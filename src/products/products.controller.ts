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
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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
    
    return this.productsService.findMany({
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
    return this.productsService.findOne(id, req.user?.userId, req.user?.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: RequestWithUser, @Body() body: any) {
    const user = req.user!;
    return this.productsService.create(body, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: RequestWithUser) {
    return this.productsService.update(id, body, req.user!.userId, req.user!.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.productsService.delete(id, req.user!.userId, req.user!.role);
  }
}


