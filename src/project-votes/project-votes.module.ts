import { Module } from '@nestjs/common';
import { ProjectVotesService } from './project-votes.service';
import { ProjectVotesController } from './project-votes.controller';

@Module({
  controllers: [ProjectVotesController],
  providers: [ProjectVotesService],
})
export class ProjectVotesModule {}


