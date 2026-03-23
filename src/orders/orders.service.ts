import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

  async findSellerOrders(sellerEmail: string, status?: string) {
    const where: any = { sellerEmail };
    if (status) where.status = status;

    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBuyerOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido nao encontrado');
    return order;
  }

  /**
   * Transiciona pedido para awaiting_seller apos pagamento confirmado.
   * Calcula deadline e notifica vendedor.
   */
  async transitionToAwaitingSeller(orderId: string) {
    const order = await this.findOne(orderId);
    if (order.status !== 'paid') return order;

    const deadlineMinutes = order.isCardapio ? 15 : 24 * 60;
    const acceptDeadline = new Date(Date.now() + deadlineMinutes * 60 * 1000);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'awaiting_seller',
        acceptDeadline,
      },
    });

    // Notificar vendedor por email
    if (order.sellerEmail) {
      const timeLabel = order.isCardapio ? '15 minutos' : '24 horas';
      try {
        await this.queueService.addEmailJob({
          to: order.sellerEmail,
          subject: 'Novo pedido recebido!',
          body: `Voce recebeu um pedido de ${order.userEmail || 'um comprador'}.\n\nProduto: ${order.productTitle || 'Produto'}\nQuantidade: ${order.quantity}\nTotal: R$ ${order.total.toFixed(2)}\n\nVoce tem ${timeLabel} para aceitar o pedido.`,
        });
      } catch (e) {
        console.error('Erro ao enviar email de notificacao:', e);
      }

      try {
        await this.queueService.addNotificationJob({
          type: 'new_order',
          userId: '', // TODO: buscar userId do vendedor
          title: 'Novo pedido!',
          message: `${order.productTitle || 'Produto'} x${order.quantity} - R$ ${order.total.toFixed(2)}`,
          metadata: { orderId, deadline: acceptDeadline.toISOString() },
        });
      } catch (e) {
        console.error('Erro ao criar notificacao:', e);
      }
    }

    return updated;
  }

  async acceptOrder(orderId: string, sellerEmail: string) {
    const order = await this.findOne(orderId);

    if (order.sellerEmail !== sellerEmail) {
      throw new ForbiddenException('Voce nao e o vendedor deste pedido');
    }
    if (order.status !== 'awaiting_seller') {
      throw new BadRequestException(`Pedido nao pode ser aceito (status: ${order.status})`);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
      },
    });
  }

  async rejectOrder(orderId: string, sellerEmail: string, reason: string) {
    const order = await this.findOne(orderId);

    if (order.sellerEmail !== sellerEmail) {
      throw new ForbiddenException('Voce nao e o vendedor deste pedido');
    }
    if (order.status !== 'awaiting_seller') {
      throw new BadRequestException(`Pedido nao pode ser recusado (status: ${order.status})`);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: reason || 'Recusado pelo vendedor',
      },
    });

    // Restaurar estoque do produto
    if (order.productId) {
      await this.prisma.product.update({
        where: { id: order.productId },
        data: { quantityAvailable: { increment: order.quantity } },
      });
    }

    // TODO: Enfileirar reembolso via payment gateway
    try {
      await this.queueService.addPaymentJob({
        type: 'refund',
        paymentId: order.transactionId || orderId,
        amount: order.total,
        metadata: {
          orderId,
          gatewayProvider: order.gatewayProvider,
          reason: reason || 'Pedido recusado pelo vendedor',
        },
      });
    } catch (e) {
      console.error('Erro ao enfileirar reembolso:', e);
    }

    return updated;
  }

  async updateStatus(orderId: string, sellerEmail: string, status: string) {
    const order = await this.findOne(orderId);

    if (order.sellerEmail !== sellerEmail) {
      throw new ForbiddenException('Voce nao e o vendedor deste pedido');
    }

    const validTransitions: Record<string, string[]> = {
      accepted: ['shipped'],
      shipped: ['delivered'],
    };

    const allowed = validTransitions[order.status];
    if (!allowed || !allowed.includes(status)) {
      throw new BadRequestException(`Transicao de ${order.status} para ${status} nao permitida`);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
  }

  /**
   * Cron: a cada minuto, cancela pedidos awaiting_seller que expiraram.
   */
  @Cron('*/1 * * * *')
  async handleExpiredOrders() {
    const now = new Date();

    const expired = await this.prisma.order.findMany({
      where: {
        status: 'awaiting_seller',
        acceptDeadline: { lt: now },
      },
    });

    for (const order of expired) {
      try {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            rejectionReason: 'Prazo de aceitacao expirado',
          },
        });

        // Restaurar estoque
        if (order.productId) {
          await this.prisma.product.update({
            where: { id: order.productId },
            data: { quantityAvailable: { increment: order.quantity } },
          });
        }

        // Enfileirar reembolso
        await this.queueService.addPaymentJob({
          type: 'refund',
          paymentId: order.transactionId || order.id,
          amount: order.total,
          metadata: {
            orderId: order.id,
            gatewayProvider: order.gatewayProvider,
            reason: 'Prazo de aceitacao expirado',
          },
        });

        console.log(`[CRON] Pedido ${order.id} expirado e cancelado`);
      } catch (e) {
        console.error(`[CRON] Erro ao cancelar pedido expirado ${order.id}:`, e);
      }
    }
  }
}
