import { Controller, Get, Res, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { Response, Request } from 'express';
import { PrometheusService } from './prometheus.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser extends Request {
  user?: { userId: string; email: string; role: string };
}

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly prometheus: PrometheusService) {}

  @Get()
  async getMetrics(@Res() res: Response, @Req() req: RequestWithUser) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Acesso negado');
    }
    const metrics = await this.prometheus.getMetrics();
    res.set('Content-Type', this.prometheus.getContentType());
    res.send(metrics);
  }
}
