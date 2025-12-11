import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTokensService } from './api-tokens.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api-tokens')
@UseGuards(JwtAuthGuard)
export class ApiTokensController {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  @Get()
  async findMany() {
    return this.apiTokensService.findMany();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.apiTokensService.findOne(id);
  }

  @Post()
  async create(@Body() data: any) {
    return this.apiTokensService.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.apiTokensService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.apiTokensService.delete(id);
  }

  @Post('reorder')
  async reorder(@Body() data: { token_ids: string[] }) {
    return this.apiTokensService.reorder(data.token_ids);
  }
}

