import { Controller, Get, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get('seller')
  async getSellerOrders(@Request() req: any, @Query('status') status?: string) {
    return this.ordersService.findSellerOrders(req.user.email, status);
  }

  @Get('buyer')
  async getBuyerOrders(@Request() req: any) {
    return this.ordersService.findBuyerOrders(req.user.userId);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/accept')
  async acceptOrder(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.acceptOrder(id, req.user.email);
  }

  @Patch(':id/reject')
  async rejectOrder(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason?: string },
  ) {
    return this.ordersService.rejectOrder(id, req.user.email, body.reason || '');
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { status: string },
  ) {
    return this.ordersService.updateStatus(id, req.user.email, body.status);
  }
}
