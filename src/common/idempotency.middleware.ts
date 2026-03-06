import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const IDEMPOTENCY_TTL_HOURS = 24;

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const key = req.headers[IDEMPOTENCY_HEADER] as string;
    if (!key) {
      return next();
    }

    try {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key },
      });

      if (existing && existing.expiresAt > new Date()) {
        if (existing.responseBody && existing.statusCode) {
          res.status(existing.statusCode).json(existing.responseBody);
          return;
        }
      }

      // Intercept the response to save it
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        this.prisma.idempotencyKey.upsert({
          where: { key },
          create: {
            key,
            userId: (req as any).user?.userId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseBody: body,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000),
          },
          update: {
            statusCode: res.statusCode,
            responseBody: body,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000),
          },
        }).catch(() => {});

        return originalJson(body);
      };

      next();
    } catch {
      next();
    }
  }
}
