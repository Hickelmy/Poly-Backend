import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrometheusService } from './prometheus.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly prometheus: PrometheusService) {}

  @Get()
  async getMetrics(@Res() res: Response) {
    const metrics = await this.prometheus.getMetrics();
    res.set('Content-Type', this.prometheus.getContentType());
    res.send(metrics);
  }
}
