import { Module } from '@nestjs/common';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';

@Module({
  imports: [PrismaModule, ApiTokensModule],
  controllers: [PaymentGatewayController],
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}

