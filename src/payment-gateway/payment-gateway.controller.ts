import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payment-gateway')
export class PaymentGatewayController {
  constructor(private readonly paymentGatewayService: PaymentGatewayService) {}

  // Cria QR Code PIX via Abacate Pay (produto, serviço ou projeto)
  @Post('create-pix')
  @UseGuards(JwtAuthGuard)
  async createPixPayment(
    @Body()
    data: {
      amount: number;
      project_id?: string;
      project_title?: string;
      product_id?: string;
      product_title?: string;
      service_id?: string;
      service_title?: string;
      quantity?: number;
      anonymous?: boolean;
      cart_items?: Array<{ product_id: string; quantity: number; price: number }>;
    },
    @Request() req: any,
  ) {
    const title = data.project_title || data.product_title || data.service_title || 'Carrinho de compras';
    return this.paymentGatewayService.createPixQRCodeDirect({
      amount: data.amount,
      projectId: data.project_id,
      productId: data.product_id,
      serviceId: data.service_id,
      title,
      userId: req.user.userId,
      userEmail: req.user.email,
      quantity: data.quantity || 1,
      cartItems: data.cart_items,
    });
  }

  // Verifica status de um QR Code PIX pelo ID retornado pelo Abacate Pay
  @Get('check-pix/:pixId')
  @UseGuards(JwtAuthGuard)
  async checkPixStatus(@Param('pixId') pixId: string) {
    return this.paymentGatewayService.checkPixQRCodeStatus(pixId);
  }

  // Cria um pagamento via Stripe
  @Post('create-stripe')
  @UseGuards(JwtAuthGuard)
  async createStripePayment(
    @Body()
    data: {
      amount: number;
      product_id?: string;
      service_id?: string;
      project_id?: string;
      product_title?: string;
      service_title?: string;
      project_title?: string;
      quantity?: number;
      currency?: string;
      cart_items?: Array<{ product_id: string; quantity: number; price: number }>;
    },
    @Request() req: any,
  ) {
    return this.paymentGatewayService.createStripePayment({
      amount: data.amount,
      productId: data.product_id,
      serviceId: data.service_id,
      projectId: data.project_id,
      productTitle: data.product_title,
      serviceTitle: data.service_title,
      projectTitle: data.project_title,
      userId: req.user.userId,
      userEmail: req.user.email,
      quantity: data.quantity || 1,
      currency: data.currency,
      cartItems: data.cart_items,
    });
  }

  // Webhook do Abacate Pay (sem autenticação JWT)
  @Post('webhook/abacate')
  async handleAbacateWebhook(@Body() data: any) {
    return this.paymentGatewayService.handleWebhook(data);
  }

  // Webhook do Stripe (sem autenticação JWT)
  @Post('webhook/stripe')
  async handleStripeWebhook(@Body() data: any) {
    return this.paymentGatewayService.handleStripeWebhook(data);
  }

  // Verifica status de um pagamento
  @Get('status/:paymentId')
  @UseGuards(JwtAuthGuard)
  async checkStatus(@Param('paymentId') paymentId: string) {
    return this.paymentGatewayService.checkPaymentStatus(paymentId);
  }

  /**
   * Salva um token de cartão retornado pelo gateway
   * IMPORTANTE: Este endpoint recebe apenas o token já criado pelo gateway
   * NUNCA recebe dados sensíveis do cartão (número, CVV, etc)
   */
  @Post('save-payment-token')
  @UseGuards(JwtAuthGuard)
  async savePaymentToken(
    @Body()
    data: {
      token_id: string; // ID do token retornado pelo gateway
      gateway_provider: string;
      last4_digits?: string;
      card_brand?: string;
      expiry_month?: number;
      expiry_year?: number;
    },
    @Request() req: any,
  ) {
    return this.paymentGatewayService.savePaymentToken({
      userId: req.user.userId,
      tokenId: data.token_id,
      gatewayProvider: data.gateway_provider,
      last4Digits: data.last4_digits,
      cardBrand: data.card_brand,
      expiryMonth: data.expiry_month,
      expiryYear: data.expiry_year,
    });
  }
}

