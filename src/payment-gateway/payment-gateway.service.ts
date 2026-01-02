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

interface MercadoPagoPreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  status: string;
}

interface MercadoPagoWebhookData {
  type: string;
  data: {
    id: string;
  };
}

interface MercadoPagoPaymentResponse {
  id: string;
  status: string;
  status_detail: string;
  external_reference?: string;
  preference_id?: string;
  metadata?: {
    preference_id?: string;
    productId?: string;
    serviceId?: string;
    userId?: string;
    quantity?: number;
    deliveryMethod?: string;
  };
  order?: {
    id: string;
  };
}

@Injectable()
export class PaymentGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiTokensService: ApiTokensService,
  ) {}

  /**
   * Cria um pagamento via Abacate Pay
   * IMPORTANTE: Dados sensíveis de cartão devem ser enviados diretamente do frontend ao gateway
   * Este método apenas cria a transação e salva o token/ID retornado
   */
  async createAbacatePayment(data: {
    amount: number; // em reais
    projectId?: string;
    productId?: string;
    serviceId?: string;
    projectTitle?: string;
    productTitle?: string;
    serviceTitle?: string;
    userId?: string;
    userEmail: string;
    returnUrl?: string;
    completionUrl?: string;
    paymentMethod?: string; // 'pix', 'credit_card', etc
    paymentToken?: string; // Token do cartão (se usar token salvo)
    installments?: number;
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

    // Determina o título baseado no tipo
    const title = data.projectTitle || data.productTitle || data.serviceTitle || 'Pagamento';
    const externalId = data.projectId || data.productId || data.serviceId || 'unknown';

    const payload = {
      frequency: 'ONE_TIME',
      methods: data.paymentMethod === 'credit_card' ? ['CREDIT_CARD'] : ['PIX'],
      products: [
        {
          externalId: externalId,
          name: title,
          quantity: 1,
          price: amountInCents,
        },
      ],
      returnUrl: data.returnUrl || `${baseUrl}/payment/return`,
      completionUrl:
        data.completionUrl ||
        `${baseUrl}/payment/success`,
      customer: {
        email: data.userEmail,
      },
      // Se tiver token de cartão, inclui nas opções
      ...(data.paymentToken && {
        paymentToken: data.paymentToken,
        installments: data.installments || 1,
      }),
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

      // Salva o pagamento no banco - APENAS tokens/IDs, nunca dados sensíveis
      if (data.projectId) {
        const payment = await this.prisma.projectPayment.create({
          data: {
            projectId: data.projectId,
            userId: data.userId ?? null,
            userEmail: data.userEmail,
            amount: data.amount,
            commissionAmount: data.amount * 0.1, // 10% de comissão
            paymentMethod: data.paymentMethod || 'pix',
            status: 'pending',
            isSubscription: false,
            anonymous: false,
            transactionId: result.data.id, // Apenas o ID da transação no gateway
            gatewayProvider: 'abacate_pay',
            paymentToken: data.paymentToken ?? null, // Token do cartão (se aplicável)
            installments: data.installments ?? 1,
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
      } else if (data.productId || data.serviceId) {
        // Cria uma Order para produtos/serviços
        const order = await this.prisma.order.create({
          data: {
            userId: data.userId ?? null,
            userEmail: data.userEmail,
            productId: data.productId ?? null,
            serviceId: data.serviceId ?? null,
            subtotal: data.amount,
            shippingCost: 0,
            total: data.amount,
            deliveryMethod: 'pickup', // Será atualizado no checkout
            paymentMethod: data.paymentMethod || 'pix',
            transactionId: result.data.id,
            gatewayProvider: 'abacate_pay',
            paymentTokenId: data.paymentToken ? undefined : null, // Se tiver token, salva o ID
            status: 'pending',
          },
        });

        return {
          success: true,
          order_id: order.id,
          billing_id: result.data.id,
          payment_url: result.data.url,
          amount: data.amount,
          status: result.data.status,
        };
      }

      throw new BadRequestException('projectId, productId ou serviceId deve ser fornecido');
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

  /**
   * Salva um token de cartão retornado pelo gateway
   * IMPORTANTE: O token já deve ter sido criado pelo gateway, nunca recebemos dados do cartão aqui
   */
  async savePaymentToken(data: {
    userId: string;
    tokenId: string; // ID do token retornado pelo gateway
    gatewayProvider: string;
    last4Digits?: string;
    cardBrand?: string;
    expiryMonth?: number;
    expiryYear?: number;
  }) {
    // Constrói o objeto de dados apenas com campos fornecidos
    const tokenData: any = {
      userId: data.userId,
      tokenId: data.tokenId,
      gatewayProvider: data.gatewayProvider,
      isDefault: false, // Primeiro cartão vira padrão
    };

    // Adiciona campos opcionais apenas se fornecidos
    if (data.last4Digits !== undefined) {
      tokenData.last4Digits = data.last4Digits;
    }
    if (data.cardBrand !== undefined) {
      tokenData.cardBrand = data.cardBrand;
    }
    if (data.expiryMonth !== undefined) {
      tokenData.expiryMonth = data.expiryMonth;
    }
    if (data.expiryYear !== undefined) {
      tokenData.expiryYear = data.expiryYear;
    }

    return this.prisma.paymentToken.create({
      data: tokenData,
    });
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

  /**
   * Cria um pagamento via Mercado Pago
   */
  async createMercadoPagoPayment(data: {
    amount: number; // em reais
    productId?: string;
    serviceId?: string;
    productTitle?: string;
    serviceTitle?: string;
    userId?: string;
    userEmail: string;
    quantity?: number;
    deliveryMethod?: string;
    deliveryAddress?: string;
    returnUrl?: string;
  }) {
    // Busca o token do Mercado Pago
    const accessToken = await this.apiTokensService.getFullToken('mercado_pago');
    
    if (!accessToken) {
      throw new BadRequestException(
        'Token do Mercado Pago não configurado. Configure em Configurações > API Tokens',
      );
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const title = data.productTitle || data.serviceTitle || 'Produto';
    
    // O amount deve estar em REAIS (ex: 1.75 para R$ 1,75)
    let amountInReais = Number(data.amount);
    
    // Validação: detecta se o valor está em centavos ou reais
    // Se o valor for >= 10 e for um número inteiro (sem decimais), 
    // provavelmente está em centavos (ex: 175 centavos = R$ 1,75)
    // Valores em reais geralmente têm decimais (ex: 1.75) ou são pequenos (< 10)
    const hasDecimals = amountInReais % 1 !== 0;
    const isLargeInteger = amountInReais >= 10 && amountInReais === Math.floor(amountInReais);
    
    if (isLargeInteger && !hasDecimals) {
      // Se for um número inteiro grande, provavelmente está em centavos
      console.warn(`Valor inteiro grande detectado (${amountInReais}), assumindo que está em centavos e convertendo para reais`);
      amountInReais = amountInReais / 100;
    }
    
    // Garante que o valor está em reais (não negativo, não zero se for pagamento)
    if (amountInReais <= 0) {
      throw new BadRequestException('Valor do pagamento deve ser maior que zero');
    }
    
    // IMPORTANTE: Mercado Pago espera valores em REAIS (com decimais), NÃO em centavos!
    // Exemplo: R$ 1,00 deve ser enviado como 1.00, não como 100
    // Garante que o valor está em reais com 2 casas decimais
    const amountInReaisFormatted = parseFloat(amountInReais.toFixed(2));
    
    // Log para debug (remover em produção)
    console.log(`Pagamento Mercado Pago - Valor recebido: ${data.amount}, Valor em reais: ${amountInReais}, Valor formatado: ${amountInReaisFormatted}`);
    
    // Validação adicional: se o valor for muito grande, algo está errado
    if (amountInReaisFormatted > 100000) {
      console.error(`ATENÇÃO: Valor muito alto (${amountInReaisFormatted}). Verifique se o valor está sendo enviado corretamente.`);
    }

    // Garante que returnUrl está definido e válido
    const successUrl = (data.returnUrl || `${baseUrl}/payment/success?status=approved`).trim();
    
    // Valida que a URL de sucesso está presente e válida
    if (!successUrl || successUrl === '') {
      throw new BadRequestException('URL de retorno de sucesso não está definida');
    }

    // Valida formato da URL
    try {
      new URL(successUrl);
    } catch (error) {
      throw new BadRequestException(`URL de retorno inválida: ${successUrl}`);
    }

    // Cria a preferência de pagamento
    // IMPORTANTE: unit_price deve ser em REAIS (ex: 1.00), não em centavos
    const preference: any = {
      items: [
        {
          title: title,
          quantity: data.quantity || 1,
          unit_price: amountInReaisFormatted, // Em reais, não em centavos!
        },
      ],
      payer: {
        email: data.userEmail,
      },
      back_urls: {
        success: successUrl,
        failure: `${baseUrl}/payment/success?status=rejected`,
        pending: `${baseUrl}/payment/success?status=pending`,
      },
      // Removemos auto_return - o Mercado Pago está sendo muito restritivo
      // O usuário será redirecionado manualmente após o pagamento usando back_urls
      notification_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/payment-gateway/webhook/mercadopago`,
      external_reference: data.productId || data.serviceId || 'unknown',
      metadata: {
        productId: data.productId || null,
        serviceId: data.serviceId || null,
        userId: data.userId || null,
        quantity: data.quantity || 1,
        deliveryMethod: data.deliveryMethod || 'pickup',
      },
    };

    console.log('URLs de retorno configuradas:', {
      success: successUrl,
      failure: `${baseUrl}/payment/success?status=rejected`,
      pending: `${baseUrl}/payment/success?status=pending`,
    });

    try {
      // A URL da API do Mercado Pago é a mesma para produção e sandbox
      // A diferença está no Access Token usado (produção vs sandbox)
      const apiUrl = 'https://api.mercadopago.com/checkout/preferences';

      // Log do payload antes de enviar (remover em produção)
      console.log('Payload enviado ao Mercado Pago:', JSON.stringify({
        ...preference,
        items: preference.items.map((item: any) => ({
          ...item,
          unit_price: item.unit_price,
        })),
      }, null, 2));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preference),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(`Erro no Mercado Pago: ${errorText}`);
      }

      const result = (await response.json()) as MercadoPagoPreferenceResponse;

      console.log('Resposta do Mercado Pago:', {
        id: result.id,
        status: result.status,
        init_point: result.init_point,
        sandbox_init_point: result.sandbox_init_point,
      });

      // Cria a Order no banco
      // Usa 'as any' temporariamente até o Prisma Client ser regenerado com o campo quantity
      const order = await this.prisma.order.create({
        data: {
          userId: data.userId ?? null,
          userEmail: data.userEmail,
          productId: data.productId ?? null,
          serviceId: data.serviceId ?? null,
          quantity: data.quantity || 1,
          subtotal: data.amount,
          shippingCost: 0,
          total: data.amount,
          deliveryMethod: data.deliveryMethod || 'pickup',
          deliveryAddress: data.deliveryAddress || null,
          paymentMethod: 'credit_card', // Mercado Pago permite múltiplos métodos
          transactionId: result.id,
          gatewayProvider: 'mercado_pago',
          status: 'pending',
        } as any, // Type assertion temporária - remover após regenerar Prisma Client
      });

      // Usa init_point para produção e sandbox_init_point para sandbox
      // Se não tiver sandbox_init_point, usa init_point (produção)
      const paymentUrl = result.sandbox_init_point || result.init_point;

      console.log('URL de pagamento gerada:', paymentUrl);

      return {
        success: true,
        order_id: order.id,
        preference_id: result.id,
        payment_url: paymentUrl,
        amount: data.amount,
        status: result.status,
      };
    } catch (error) {
      console.error('Erro ao criar pagamento Mercado Pago:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Erro ao processar pagamento. Tente novamente.',
      );
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

    if (payment) {
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

    // Tenta buscar em Orders também
    const order = await this.prisma.order.findFirst({
      where: { transactionId: billingId },
    });

    if (order) {
      const newStatus = status === 'PAID' ? 'paid' : status.toLowerCase();
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: newStatus },
      });
      return { success: true, message: 'Webhook processado' };
    }

    return { success: false, message: 'Pagamento não encontrado' };
  }

  // Webhook específico do Mercado Pago
  async handleMercadoPagoWebhook(data: MercadoPagoWebhookData) {
    if (data.type !== 'payment') {
      return { success: false, message: 'Tipo de webhook não suportado' };
    }

    const paymentId = data.data.id;
    if (!paymentId) {
      return { success: false, message: 'ID do pagamento não informado' };
    }

    // Busca o token do Mercado Pago para consultar o status
    const accessToken = await this.apiTokensService.getFullToken('mercado_pago');
    if (!accessToken) {
      return { success: false, message: 'Token do Mercado Pago não configurado' };
    }

    try {
      // Consulta o status do pagamento no Mercado Pago
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        return { success: false, message: 'Erro ao consultar pagamento no Mercado Pago' };
      }

      const payment = (await response.json()) as MercadoPagoPaymentResponse;
      const status = payment.status;

      // O external_reference contém o ID do produto/serviço
      // Mas precisamos buscar pela preference_id que está no payment
      const preferenceId = payment.metadata?.preference_id || payment.order?.id || payment.preference_id;
      
      if (!preferenceId) {
        // Tenta buscar pelo external_reference se não encontrar preference_id
        const externalRef = payment.external_reference;
        if (externalRef) {
          const order = await this.prisma.order.findFirst({
            where: {
              OR: [
                { productId: externalRef },
                { serviceId: externalRef },
              ],
            },
            orderBy: { createdAt: 'desc' },
          });
          
          if (order) {
            // Atualiza o status e desconta a quantidade
            await this.updateOrderAndProduct(order, status, paymentId);
            return { success: true, message: 'Webhook processado com sucesso' };
          }
        }
        return { success: false, message: 'Preferência não encontrada' };
      }

      // Busca a Order pelo transactionId (preference_id)
      const order = await this.prisma.order.findFirst({
        where: { transactionId: preferenceId },
      });

      if (!order) {
        return { success: false, message: 'Pedido não encontrado' };
      }

      // Atualiza o status e desconta a quantidade
      await this.updateOrderAndProduct(order, status, paymentId);

      return { success: true, message: 'Webhook processado com sucesso' };
    } catch (error) {
      console.error('Erro ao processar webhook do Mercado Pago:', error);
      return { success: false, message: 'Erro ao processar webhook' };
    }
  }

  // Método auxiliar para atualizar order e descontar quantidade do produto
  private async updateOrderAndProduct(order: any, status: string, paymentId: string) {
    // Atualiza o status do pedido
    const newStatus = status === 'approved' ? 'paid' : 
                     status === 'rejected' ? 'cancelled' : 
                     status === 'pending' ? 'pending' : 'pending';
    
    await this.prisma.order.update({
      where: { id: order.id },
      data: { 
        status: newStatus,
        transactionId: paymentId, // Atualiza com o ID do pagamento
      },
    });

    // Se o pagamento foi aprovado, desconta a quantidade do produto
    if (status === 'approved' && order.productId && order.quantity) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });

      if (product) {
        const newQuantity = Math.max(0, product.quantityAvailable - order.quantity);
        
        await this.prisma.product.update({
          where: { id: product.id },
          data: {
            quantityAvailable: newQuantity,
            // Se a quantidade chegar a 0, marca como inativo (esgotado)
            active: newQuantity > 0,
          },
        });
      }
    }
  }

  // Verifica status de um pagamento
  async checkPaymentStatus(paymentId: string) {
    const payment = await this.prisma.projectPayment.findUnique({
      where: { id: paymentId },
      include: { project: true },
    });

    if (payment) {
      return {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        project_id: payment.projectId,
        project_title: payment.project?.title,
        created_at: payment.createdAt,
      };
    }

    const order = await this.prisma.order.findUnique({
      where: { id: paymentId },
    });

    if (order) {
      return {
        id: order.id,
        status: order.status,
        amount: order.total,
        created_at: order.createdAt,
      };
    }

    throw new BadRequestException('Pagamento não encontrado');
  }
}
