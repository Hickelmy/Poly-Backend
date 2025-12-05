import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProjectPaymentsService } from './project-payments.service';

@Controller('project-payments')
export class ProjectPaymentsController {
  constructor(private readonly projectPaymentsService: ProjectPaymentsService) {}

  @Get()
  findAll(
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query() query?: any,
  ) {
    const { sort: _s, limit: _l, ...filters } = query || {};
    return this.projectPaymentsService.findMany({
      sort,
      limit: limit ? parseInt(limit, 10) : undefined,
      filters,
    });
  }

  @Post()
  create(@Body() body: any) {
    return this.projectPaymentsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.projectPaymentsService.update(id, body);
  }
}


