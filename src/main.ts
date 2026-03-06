import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { PrometheusService } from './observability/prometheus.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const logger = new Logger('Bootstrap');

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production',
    }),
  );

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN') || true,
    credentials: true,
  });

  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Prometheus HTTP metrics middleware
  try {
    const prometheus = app.get(PrometheusService);
    app.use((req: any, res: any, next: any) => {
      if (req.path === '/metrics') return next();
      const end = prometheus.httpRequestDuration.startTimer();
      prometheus.activeConnections.inc();

      res.on('finish', () => {
        const route = req.route?.path || req.path;
        end({ method: req.method, route, status: res.statusCode });
        prometheus.httpRequestsTotal.inc({
          method: req.method,
          route,
          status: res.statusCode,
        });
        prometheus.activeConnections.dec();
      });

      next();
    });
  } catch {
    // Prometheus not available
  }

  const port = configService.get<number>('PORT') || 3001;
  await app.listen(port);
  logger.log(`Application running on port ${port} [${nodeEnv}]`);
}

bootstrap();
