import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateTransportType } from '../common/transport.util';

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


interface StripeCheckoutSessionResponse {
  id: string;
  url: string;
  amount_total: number;
  currency: string;
  status: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class PaymentGatewayService {
  constructor(private readonly prisma: PrismaService) {}

  private getAbacatePayToken(): string {
    const token = process.env.ABACATE_PAY_TOKEN;
    const allKeys = Object.keys(process.env);
    const abacateKeys = allKeys.filter(k => k.toUpperCase().includes('ABACATE'));
    console.log('[DEBUG] ABACATE_PAY_TOKEN present:', !!token);
    console.log('[DEBUG] ABACATE_PAY_TOKEN length:', token?.length ?? 0);
    console.log('[DEBUG] ABACATE_PAY_TOKEN first 6 chars:', token ? token.substring(0, 6) + '...' : 'N/A');
    console.log('[DEBUG] Env keys containing "ABACATE":', abacateKeys);
    console.log('[DEBUG] Total env vars:', allKeys.length);
    if (!token) {
      throw new BadRequestException('ABACATE_PAY_TOKEN não configurado nas variáveis de ambiente');
    }
    return token;
  }

  private getStripeToken(): string {
    const token = process.env.STRIPE_SECRET_KEY;
    const stripeKeys = Object.keys(process.env).filter(k => k.toUpperCase().includes('STRIPE'));
    console.log('[DEBUG] STRIPE_SECRET_KEY present:', !!token);
    console.log('[DEBUG] Env keys containing "STRIPE":', stripeKeys);
    if (!token) {
      throw new BadRequestException('STRIPE_SECRET_KEY não configurado nas variáveis de ambiente');
    }
    return token;
  }

  async createPixQRCodeDirect(data: {
    amount: number; // em reais
    projectId?: string;
    productId?: string;
    serviceId?: string;
    title?: string;
    userId?: string;
    userEmail: string;
    quantity?: number;
    cartItems?: Array<{ product_id: string; quantity: number; price: number }>;
    delivery_method?: string;
    delivery_address?: string;
  }) {
    const token = this.getAbacatePayToken();
    const amountInCents = Math.round(data.amount * 100);
    const description = data.title || 'Pagamento Polys';

    try {
      const response = await fetch(
        'https://api.abacatepay.com/v1/pixQrCode/create',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount: amountInCents, expiresIn: 3600, description }),
        },
      );

      const result = (await response.json()) as AbacatePayPixResponse;

      if (result.error) {
        throw new BadRequestException(`Erro no Abacate Pay: ${result.error}`);
      }

      let paymentId: string | undefined;
      let orderId: string | undefined;

      if (data.projectId) {
        const payment = await this.prisma.projectPayment.create({
          data: {
            projectId: data.projectId,
            userId: data.userId ?? null,
            userEmail: data.userEmail,
            amount: data.amount,
            commissionAmount: data.amount * 0.1,
            paymentMethod: 'pix',
            status: 'pending',
            isSubscription: false,
            anonymous: false,
            transactionId: result.data.id,
            gatewayProvider: 'abacate_pay',
          },
        });
        paymentId = payment.id;
      } else if (data.productId || data.serviceId || data.cartItems?.length) {
        const firstProductId = data.productId ?? data.cartItems?.[0]?.product_id ?? null;
        const totalQty = data.cartItems
          ? data.cartItems.reduce((s, i) => s + i.quantity, 0)
          : (data.quantity || 1);

        // Buscar produto para auto-calcular transporte e dados do vendedor
        let transportType: string | null = null;
        let sellerEmail: string | null = null;
        let productTitle: string | null = null;
        let isCardapio = false;
        if (firstProductId) {
          const product = await this.prisma.product.findUnique({ where: { id: firstProductId } });
          if (product) {
            transportType = data.delivery_method === 'delivery'
              ? calculateTransportType(product.weightKg, totalQty, product.unitType || 'unidade')
              : null;
            sellerEmail = product.sellerEmail || null;
            productTitle = product.title || null;
            isCardapio = product.category === 'alimentos';
          }
        }

        const order = await this.prisma.order.create({
          data: {
            userId: data.userId ?? null,
            userEmail: data.userEmail,
            productId: firstProductId,
            serviceId: data.serviceId ?? null,
            quantity: totalQty,
            subtotal: data.amount,
            shippingCost: 0,
            total: data.amount,
            deliveryMethod: data.delivery_method || 'pickup',
            deliveryAddress: data.delivery_address || null,
            transportType,
            sellerEmail,
            productTitle,
            isCardapio,
            paymentMethod: 'pix',
            transactionId: result.data.id,
            gatewayProvider: 'abacate_pay',
            status: 'pending',
          } as any,
        });
        orderId = order.id;
      } else {
        throw new BadRequestException('projectId, productId ou serviceId deve ser fornecido');
      }

      return {
        success: true,
        pix_id: result.data.id,
        br_code: result.data.brCode,
        qr_code_base64: result.data.brCodeBase64,
        amount: data.amount,
        expires_at: result.data.expiresAt,
        payment_id: paymentId,
        order_id: orderId,
      };
    } catch (error) {
      console.error('Erro ao criar QR Code PIX:', error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Erro ao gerar QR Code PIX. Tente novamente.');
    }
  }

  async checkPixQRCodeStatus(pixId: string) {
    const token = this.getAbacatePayToken();

    try {
      const response = await fetch(
        `https://api.abacatepay.com/v1/pixQrCode/check?id=${pixId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const result = (await response.json()) as AbacatePayPixResponse;

      if (result.error) {
        throw new BadRequestException(`Erro ao verificar PIX: ${result.error}`);
      }

      if (result.data.status === 'PAID') {
        const payment = await this.prisma.projectPayment.findFirst({
          where: { transactionId: pixId },
        });
        if (payment && payment.status !== 'confirmed') {
          await this.prisma.projectPayment.update({
            where: { id: payment.id },
            data: { status: 'confirmed' },
          });
          await this.prisma.project.update({
            where: { id: payment.projectId },
            data: { currentAmount: { increment: payment.amount } },
          });
        }

        const order = await this.prisma.order.findFirst({
          where: { transactionId: pixId },
        });
        if (order && order.status !== 'paid' && order.status !== 'awaiting_seller') {
          // Calcular deadline de aceitacao
          const deadlineMinutes = order.isCardapio ? 15 : 24 * 60;
          const acceptDeadline = new Date(Date.now() + deadlineMinutes * 60 * 1000);

          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              status: 'awaiting_seller',
              acceptDeadline,
            },
          });
          if (order.productId && order.quantity) {
            const product = await this.prisma.product.findUnique({
              where: { id: order.productId },
            });
            if (product) {
              const newQuantity = Math.max(0, product.quantityAvailable - order.quantity);
              await this.prisma.product.update({
                where: { id: product.id },
                data: { quantityAvailable: newQuantity, active: newQuantity > 0 },
              });
            }
          }
        }
      }

      return {
        pix_id: result.data.id,
        status: result.data.status, // 'PENDING' | 'PAID' | 'EXPIRED'
        amount: result.data.amount / 100,
      };
    } catch (error) {
      console.error('Erro ao verificar status PIX:', error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Erro ao verificar status do PIX');
    }
  }

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
    const token = this.getAbacatePayToken();

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
    const token = this.getAbacatePayToken();

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
   * Cria um pagamento via Stripe
   * Retorna um Payment Intent que pode ser usado no mobile para abrir o Stripe Payment Sheet
   */
  async createStripePayment(data: {
    amount: number; // em reais
    productId?: string;
    serviceId?: string;
    projectId?: string;
    productTitle?: string;
    serviceTitle?: string;
    projectTitle?: string;
    userId?: string;
    userEmail: string;
    quantity?: number;
    currency?: string; // Padrão: 'brl'
    cartItems?: Array<{ product_id: string; quantity: number; price: number }>;
    delivery_method?: string;
    delivery_address?: string;
  }) {
    // Busca o token do Stripe (env var tem prioridade sobre DB)
    const secretKey = this.getStripeToken();

    // Valida que é uma secret key (começa com sk_), não uma publishable key (pk_)
    if (!secretKey.startsWith('sk_')) {
      throw new BadRequestException(
        'Token do Stripe inválido. Use uma Secret Key (sk_...) e não uma Publishable Key (pk_...). Configure em Configurações > API Tokens',
      );
    }

    // Converte valor para centavos (Stripe usa centavos)
    const amountInCents = Math.round(data.amount * 100);
    const currency = (data.currency || 'brl').toLowerCase();

    // Validação de valor
    if (amountInCents <= 0) {
      throw new BadRequestException('Valor do pagamento deve ser maior que zero');
    }

    const title = data.productTitle || data.serviceTitle || data.projectTitle || 'Pagamento';
    const externalId = data.productId || data.serviceId || data.projectId || 'unknown';

    try {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      
      // Função auxiliar para criar checkout session
      const createSession = async (includePix: boolean) => {
        const sessionParams = new URLSearchParams({
          'line_items[0][price_data][currency]': currency,
          'line_items[0][price_data][product_data][name]': title,
          'line_items[0][price_data][unit_amount]': amountInCents.toString(),
          'line_items[0][quantity]': (data.quantity || 1).toString(),
          'mode': 'payment',
          'success_url': `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          'cancel_url': `${baseUrl}/payment/cancel`,
          'customer_email': data.userEmail,
        });

        // Adiciona métodos de pagamento: cartão
        sessionParams.append('payment_method_types[]', 'card');
        
        // Para BRL (Brasil), adiciona boleto e PIX (se solicitado)
        if (currency === 'brl') {
          sessionParams.append('payment_method_types[]', 'boleto');
          if (includePix) {
            sessionParams.append('payment_method_types[]', 'pix');
          }
        }

        // Adiciona metadata
        if (data.productId) sessionParams.append('metadata[productId]', data.productId);
        if (data.serviceId) sessionParams.append('metadata[serviceId]', data.serviceId);
        if (data.projectId) sessionParams.append('metadata[projectId]', data.projectId);
        if (data.userId) sessionParams.append('metadata[userId]', data.userId);
        sessionParams.append('metadata[userEmail]', data.userEmail);
        sessionParams.append('metadata[quantity]', (data.quantity || 1).toString());

        const sessionResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: sessionParams,
        });

        return sessionResponse;
      };

      // Tenta criar checkout com PIX primeiro (para BRL)
      let response = await createSession(currency === 'brl');
      
      // Se PIX não estiver habilitado, tenta novamente sem PIX
      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          // Se o erro for sobre PIX não estar habilitado, tenta sem PIX
          if (
            currency === 'brl' &&
            errorJson.error?.message?.includes('pix') &&
            (errorJson.error?.message?.includes('invalid') ||
             errorJson.error?.message?.includes('not activated') ||
             errorJson.error?.message?.includes('not enabled'))
          ) {
            console.log('PIX não está habilitado na conta Stripe. Criando checkout sem PIX...');
            response = await createSession(false);
            
            if (!response.ok) {
              const retryErrorText = await response.text();
              throw new BadRequestException(`Erro no Stripe: ${retryErrorText}`);
            }
          } else {
            throw new BadRequestException(`Erro no Stripe: ${errorText}`);
          }
        } catch (parseError) {
          // Se não conseguir parsear o erro, lança o erro original
          throw new BadRequestException(`Erro no Stripe: ${errorText}`);
        }
      }

      const checkoutSession = (await response.json()) as any;

      // Cria a Order/Payment no banco
      if (data.projectId) {
        const payment = await this.prisma.projectPayment.create({
          data: {
            projectId: data.projectId,
            userId: data.userId ?? null,
            userEmail: data.userEmail,
            amount: data.amount,
            commissionAmount: data.amount * 0.1, // 10% de comissão
            paymentMethod: 'credit_card',
            status: 'pending',
            isSubscription: false,
            anonymous: false,
            transactionId: checkoutSession.id,
            gatewayProvider: 'stripe',
          },
        });

        return {
          success: true,
          payment_id: payment.id,
          session_id: checkoutSession.id,
          checkout_url: checkoutSession.url,
          amount: data.amount,
          currency: currency,
        };
      } else if (data.productId || data.serviceId || data.cartItems?.length) {
        const firstProductId = data.productId ?? data.cartItems?.[0]?.product_id ?? null;
        const totalQty = data.cartItems
          ? data.cartItems.reduce((s, i) => s + i.quantity, 0)
          : (data.quantity || 1);

        // Buscar produto para auto-calcular transporte e dados do vendedor
        let transportType: string | null = null;
        let sellerEmail: string | null = null;
        let productTitle: string | null = null;
        let isCardapio = false;
        if (firstProductId) {
          const product = await this.prisma.product.findUnique({ where: { id: firstProductId } });
          if (product) {
            transportType = data.delivery_method === 'delivery'
              ? calculateTransportType(product.weightKg, totalQty, product.unitType || 'unidade')
              : null;
            sellerEmail = product.sellerEmail || null;
            productTitle = product.title || null;
            isCardapio = product.category === 'alimentos';
          }
        }

        const order = await this.prisma.order.create({
          data: {
            userId: data.userId ?? null,
            userEmail: data.userEmail,
            productId: firstProductId,
            serviceId: data.serviceId ?? null,
            quantity: totalQty,
            subtotal: data.amount,
            shippingCost: 0,
            total: data.amount,
            deliveryMethod: data.delivery_method || 'pickup',
            deliveryAddress: data.delivery_address || null,
            transportType,
            sellerEmail,
            productTitle,
            isCardapio,
            paymentMethod: 'credit_card',
            transactionId: checkoutSession.id,
            gatewayProvider: 'stripe',
            status: 'pending',
          } as any,
        });

        return {
          success: true,
          order_id: order.id,
          session_id: checkoutSession.id,
          checkout_url: checkoutSession.url,
          amount: data.amount,
          currency: currency,
        };
      }

      throw new BadRequestException('projectId, productId ou serviceId deve ser fornecido');
    } catch (error) {
      console.error('Erro ao criar pagamento Stripe:', error);
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

  // Webhook específico do Stripe
  async handleStripeWebhook(data: any) {
    const eventType = data.type;
    const session = data.data?.object;

    // Aceita checkout.session.completed (Checkout Session) ou payment_intent.succeeded (compatibilidade)
    if (eventType === 'checkout.session.completed') {
      const sessionId = session?.id;
      if (!sessionId) {
        return { success: false, message: 'ID da sessão não informado' };
      }

      try {
        // Busca a Order ou Payment pelo transactionId (session_id)
        const order = await this.prisma.order.findFirst({
          where: { transactionId: sessionId },
        });

        if (order) {
          const dlMinutes = order.isCardapio ? 15 : 24 * 60;
          const dlDeadline = new Date(Date.now() + dlMinutes * 60 * 1000);
          await this.prisma.order.update({
            where: { id: order.id },
            data: { status: 'awaiting_seller', acceptDeadline: dlDeadline },
          });

          // Se o pagamento foi aprovado, desconta a quantidade do produto
          if (order.productId && order.quantity) {
            const product = await this.prisma.product.findUnique({
              where: { id: order.productId },
            });

            if (product) {
              const newQuantity = Math.max(0, product.quantityAvailable - order.quantity);
              
              await this.prisma.product.update({
                where: { id: product.id },
                data: {
                  quantityAvailable: newQuantity,
                  active: newQuantity > 0,
                },
              });
            }
          }

          return { success: true, message: 'Webhook processado com sucesso' };
        }

        // Tenta buscar em ProjectPayment também
        const payment = await this.prisma.projectPayment.findFirst({
          where: { transactionId: sessionId },
        });

        if (payment) {
          await this.prisma.projectPayment.update({
            where: { id: payment.id },
            data: { status: 'confirmed' },
          });

          // Atualiza o valor arrecadado do projeto
          await this.prisma.project.update({
            where: { id: payment.projectId },
            data: {
              currentAmount: {
                increment: payment.amount,
              },
            },
          });

          return { success: true, message: 'Webhook processado com sucesso' };
        }

        return { success: false, message: 'Pagamento não encontrado' };
      } catch (error) {
        console.error('Erro ao processar webhook do Stripe:', error);
        return { success: false, message: 'Erro ao processar webhook' };
      }
    }

    // Fallback para payment_intent.succeeded (compatibilidade com código antigo)
    if (eventType === 'payment_intent.succeeded') {
      const paymentIntent = session;
      const paymentIntentId = paymentIntent?.id;
      if (!paymentIntentId) {
        return { success: false, message: 'ID do pagamento não informado' };
      }

      try {
        // Busca a Order ou Payment pelo transactionId (payment_intent_id)
        const order = await this.prisma.order.findFirst({
          where: { transactionId: paymentIntentId },
        });

        if (order) {
          const piDlMinutes = order.isCardapio ? 15 : 24 * 60;
          const piDeadline = new Date(Date.now() + piDlMinutes * 60 * 1000);
          await this.prisma.order.update({
            where: { id: order.id },
            data: { status: 'awaiting_seller', acceptDeadline: piDeadline },
          });

          // Se o pagamento foi aprovado, desconta a quantidade do produto
          if (order.productId && order.quantity) {
            const product = await this.prisma.product.findUnique({
              where: { id: order.productId },
            });

            if (product) {
              const newQuantity = Math.max(0, product.quantityAvailable - order.quantity);
              
              await this.prisma.product.update({
                where: { id: product.id },
                data: {
                  quantityAvailable: newQuantity,
                  active: newQuantity > 0,
                },
              });
            }
          }

          return { success: true, message: 'Webhook processado com sucesso' };
        }

        // Tenta buscar em ProjectPayment também
        const payment = await this.prisma.projectPayment.findFirst({
          where: { transactionId: paymentIntentId },
        });

        if (payment) {
          await this.prisma.projectPayment.update({
            where: { id: payment.id },
            data: { status: 'confirmed' },
          });

          // Atualiza o valor arrecadado do projeto
          await this.prisma.project.update({
            where: { id: payment.projectId },
            data: {
              currentAmount: {
                increment: payment.amount,
              },
            },
          });

          return { success: true, message: 'Webhook processado com sucesso' };
        }

        return { success: false, message: 'Pagamento não encontrado' };
      } catch (error) {
        console.error('Erro ao processar webhook do Stripe:', error);
        return { success: false, message: 'Erro ao processar webhook' };
      }
    }

    return { success: false, message: 'Tipo de webhook não suportado' };
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
