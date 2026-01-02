import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ServiceBookingsService } from './service-bookings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('service-bookings')
@UseGuards(JwtAuthGuard)
export class ServiceBookingsController {
  constructor(private readonly serviceBookingsService: ServiceBookingsService) {}

  @Get()
  async findMany(
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Request() req?: any,
  ) {
    const filters: any = {};
    
    // Permitir filtrar por query params
    if (req.query.provider_email) filters.provider_email = req.query.provider_email;
    if (req.query.client_email) filters.client_email = req.query.client_email;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.service_id) filters.service_id = req.query.service_id;

    return this.serviceBookingsService.findMany({
      sort,
      limit: limit ? parseInt(limit, 10) : undefined,
      filters,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.serviceBookingsService.findOne(id);
  }

  @Post()
  async create(@Body() data: any, @Request() req: any) {
    return this.serviceBookingsService.create(data);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.serviceBookingsService.update(id, data);
  }

  @Post(':id/verify-code')
  async verifyCode(
    @Param('id') id: string,
    @Body() body: { 
      service_code: string;
      client_lat?: number;
      client_lng?: number;
      provider_lat?: number;
      provider_lng?: number;
    },
    @Request() req: any,
  ) {
    return this.serviceBookingsService.verifyCode(
      id, 
      body.service_code, 
      req.user.email,
      body.client_lat,
      body.client_lng,
      body.provider_lat,
      body.provider_lng
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.serviceBookingsService.delete(id);
  }
}

