import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD', '');
    const db = this.configService.get<number>('REDIS_DB', 0);

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      db,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.warn('Redis connection failed after 3 retries. Running without cache.');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection error: ${err.message}. Cache features disabled.`);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    try {
      await this.client.connect();
    } catch {
      this.logger.warn('Redis not available. Application will run without caching.');
    }
  }

  async onModuleDestroy() {
    if (this.client?.status === 'ready') {
      await this.client.quit();
    }
  }

  get isConnected(): boolean {
    return this.client?.status === 'ready';
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) return;
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // silently fail
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.del(key);
    } catch {
      // silently fail
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      // silently fail
    }
  }
}
