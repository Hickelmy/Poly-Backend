import { Controller, Get, Post, Body, Query, Delete } from '@nestjs/common';
import { ProjectVotesService } from './project-votes.service';

@Controller('project-votes')
export class ProjectVotesController {
  constructor(private readonly projectVotesService: ProjectVotesService) {}

  @Get()
  findAll(
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query() query?: any,
  ) {
    const { sort: _s, limit: _l, ...filters } = query || {};
    return this.projectVotesService.findMany({
      sort,
      limit: limit ? parseInt(limit, 10) : undefined,
      filters,
    });
  }

  @Post()
  create(@Body() body: any) {
    return this.projectVotesService.create(body);
  }

  @Delete()
  remove(@Body() body: any) {
    return this.projectVotesService.deleteForUser(body);
  }
}


