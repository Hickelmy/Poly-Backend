import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payment-gateway')
export class PaymentGatewayController {
  constructor(private readonly paymentGatewayService: PaymentGatewayService) {}

  // Cria um pagamento PIX via Abacate Pay
  @Post('create-pix')
  @UseGuards(JwtAuthGuard)
  async createPixPayment(
    @Body()
    data: {
      amount: number;
      project_id: string;
      project_title: string;
      anonymous?: boolean;
    },
    @Request() req: any,
  ) {
    return this.paymentGatewayService.createAbacatePayment({
      amount: data.amount,
      projectId: data.project_id,
      projectTitle: data.project_title,
      userId: req.user.userId,
      userEmail: req.user.email,
    });
  }

  // Gera QR Code PIX para um billing existente
  @Post('generate-qrcode')
  @UseGuards(JwtAuthGuard)
  async generateQRCode(@Body() data: { billing_id: string }) {
    return this.paymentGatewayService.createPixQRCode(data.billing_id);
  }

  // Cria um pagamento via Mercado Pago
  @Post('create-mercadopago')
  @UseGuards(JwtAuthGuard)
  async createMercadoPagoPayment(
    @Body()
    data: {
      amount: number;
      product_id?: string;
      service_id?: string;
      product_title?: string;
      service_title?: string;
      quantity?: number;
      delivery_method?: string;
      delivery_address?: string;
      return_url?: string;
    },
    @Request() req: any,
  ) {
    return this.paymentGatewayService.createMercadoPagoPayment({
      amount: data.amount,
      productId: data.product_id,
      serviceId: data.service_id,
      productTitle: data.product_title,
      serviceTitle: data.service_title,
      userId: req.user.userId,
      userEmail: req.user.email,
      quantity: data.quantity || 1,
      deliveryMethod: data.delivery_method,
      deliveryAddress: data.delivery_address,
      returnUrl: data.return_url,
    });
  }

  // Webhook do Abacate Pay (sem autenticação JWT)
  @Post('webhook/abacate')
  async handleAbacateWebhook(@Body() data: any) {
    return this.paymentGatewayService.handleWebhook(data);
  }

  // Webhook do Mercado Pago (sem autenticação JWT)
  @Post('webhook/mercadopago')
  async handleMercadoPagoWebhook(@Body() data: any) {
    return this.paymentGatewayService.handleMercadoPagoWebhook(data);
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

