import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Req() req: RequestWithUser,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('user_lat') userLatStr?: string,
    @Query('user_lng') userLngStr?: string,
    @Query() query?: any,
  ) {
    const { sort: _s, limit: _l, user_lat: _uLat, user_lng: _uLng, ...filters } = query || {};
    
    const userLat = userLatStr ? parseFloat(userLatStr) : undefined;
    const userLng = userLngStr ? parseFloat(userLngStr) : undefined;
    
    return this.servicesService.findMany({
      sort: sort,
      limit: limit ? parseInt(limit, 10) : undefined,
      filters,
      userLat: !isNaN(userLat as number) ? userLat : undefined,
      userLng: !isNaN(userLng as number) ? userLng : undefined,
      userId: req.user?.userId,
      userRole: req.user?.role,
    });
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.servicesService.findOne(id, req.user?.userId, req.user?.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: RequestWithUser, @Body() body: any) {
    const user = req.user!;
    return this.servicesService.create(body, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.servicesService.update(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.servicesService.delete(id);
  }
}


