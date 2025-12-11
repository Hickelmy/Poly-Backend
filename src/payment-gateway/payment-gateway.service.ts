import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTokensService } from '../api-tokens/api-tokens.service';

interface AbacatePayBillingResponse {
  data: {
    id: string;
    url: string;
    amount: number;
    status: string;
    devMode: boolean;
    methods: string[];
    products: any[];
    frequency: string;
    nextBilling: string | null;
    customer: {
      id: string;
      metadata: {
        name: string;
        email: string;
        cellphone: string;
        taxId: string;
      };
    };
    createdAt: string;
    updatedAt: string;
  };
  error: string | null;
}

interface AbacatePayPixResponse {
  data: {
    id: string;
    billingId: string;
    amount: number;
    status: string;
    devMode: boolean;
    brCode: string;
    brCodeBase64: string;
    platformFee: number;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
  };
  error: string | null;
}

@Injectable()
export class PaymentGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiTokensService: ApiTokensService,
  ) {}

  // Cria um pagamento via Abacate Pay
  async createAbacatePayment(data: {
    amount: number; // em reais
    projectId: string;
    projectTitle: string;
    userId?: string;
    userEmail: string;
    returnUrl?: string;
    completionUrl?: string;
  }) {
    // Busca o primeiro token ativo do Abacate Pay
    const token = await this.apiTokensService.getFullToken('abacate_pay');

    if (!token) {
      throw new BadRequestException(
        'Token do Abacate Pay não configurado. Configure em Configurações > API Tokens',
      );
    }

    // Converte valor para centavos (Abacate Pay usa centavos)
    const amountInCents = Math.round(data.amount * 100);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const payload = {
      frequency: 'ONE_TIME',
      methods: ['PIX'],
      products: [
        {
          externalId: data.projectId,
          name: `Doação: ${data.projectTitle}`,
          quantity: 1,
          price: amountInCents,
        },
      ],
      returnUrl: data.returnUrl || `${baseUrl}/projects/${data.projectId}`,
      completionUrl:
        data.completionUrl ||
        `${baseUrl}/payment/success?project=${data.projectId}`,
      customer: {
        email: data.userEmail,
      },
    };

    try {
      const response = await fetch(
        'https://api.abacatepay.com/v1/billing/create',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const result = (await response.json()) as AbacatePayBillingResponse;

      if (result.error) {
        throw new BadRequestException(
          `Erro no Abacate Pay: ${result.error}`,
        );
      }

      // Salva o pagamento no banco
      const payment = await this.prisma.projectPayment.create({
        data: {
          projectId: data.projectId,
          userId: data.userId ?? null,
          userEmail: data.userEmail,
          amount: data.amount,
          commissionAmount: data.amount * 0.1, // 10% de comissão
          paymentMethod: 'pix',
          status: 'pending',
          isSubscription: false,
          anonymous: false,
          transactionId: result.data.id,
        },
      });

      return {
        success: true,
        payment_id: payment.id,
        billing_id: result.data.id,
        payment_url: result.data.url,
        amount: data.amount,
        status: result.data.status,
      };
    } catch (error) {
      console.error('Erro ao criar pagamento Abacate Pay:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Erro ao processar pagamento. Tente novamente.',
      );
    }
  }

  // Gera QR Code PIX diretamente
  async createPixQRCode(billingId: string) {
    const token = await this.apiTokensService.getFullToken('abacate_pay');

    if (!token) {
      throw new BadRequestException('Token do Abacate Pay não configurado');
    }

    try {
      const response = await fetch(
        'https://api.abacatepay.com/v1/pixQrCode/create',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ billingId }),
        },
      );

      const result = (await response.json()) as AbacatePayPixResponse;

      if (result.error) {
        throw new BadRequestException(`Erro no Abacate Pay: ${result.error}`);
      }

      return {
        success: true,
        pix_id: result.data.id,
        br_code: result.data.brCode,
        qr_code_base64: result.data.brCodeBase64,
        amount: result.data.amount / 100, // Converte de centavos para reais
        expires_at: result.data.expiresAt,
      };
    } catch (error) {
      console.error('Erro ao gerar QR Code PIX:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erro ao gerar QR Code PIX');
    }
  }

  // Webhook para receber confirmação de pagamento
  async handleWebhook(data: any) {
    const { billingId, status } = data;

    if (!billingId) {
      return { success: false, message: 'billingId não informado' };
    }

    // Busca o pagamento pelo transactionId (billingId)
    const payment = await this.prisma.projectPayment.findFirst({
      where: { transactionId: billingId },
    });

    if (!payment) {
      return { success: false, message: 'Pagamento não encontrado' };
    }

    // Atualiza o status do pagamento
    const newStatus = status === 'PAID' ? 'confirmed' : status.toLowerCase();

    await this.prisma.projectPayment.update({
      where: { id: payment.id },
      data: { status: newStatus },
    });

    // Se confirmado, atualiza o valor arrecadado do projeto
    if (status === 'PAID') {
      await this.prisma.project.update({
        where: { id: payment.projectId },
        data: {
          currentAmount: {
            increment: payment.amount,
          },
        },
      });
    }

    return { success: true, message: 'Webhook processado' };
  }

  // Verifica status de um pagamento
  async checkPaymentStatus(paymentId: string) {
    const payment = await this.prisma.projectPayment.findUnique({
      where: { id: paymentId },
      include: { project: true },
    });

    if (!payment) {
      throw new BadRequestException('Pagamento não encontrado');
    }

    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      project_id: payment.projectId,
      project_title: payment.project.title,
      created_at: payment.createdAt,
    };
  }
}

