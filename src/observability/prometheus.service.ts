import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as client from 'prom-client';

@Injectable()
export class PrometheusService implements OnModuleInit {
  private registry!: client.Registry;

  httpRequestDuration!: client.Histogram;
  httpRequestsTotal!: client.Counter;
  activeConnections!: client.Gauge;
  paymentProcessed!: client.Counter;
  queueJobsTotal!: client.Counter;
  dbQueryDuration!: client.Histogram;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.registry = new client.Registry();
    
    client.collectDefaultMetrics({ register: this.registry });

    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.activeConnections = new client.Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      registers: [this.registry],
    });

    this.paymentProcessed = new client.Counter({
      name: 'payments_processed_total',
      help: 'Total number of payments processed',
      labelNames: ['status', 'method', 'gateway'],
      registers: [this.registry],
    });

    this.queueJobsTotal = new client.Counter({
      name: 'queue_jobs_total',
      help: 'Total queue jobs',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });

    this.dbQueryDuration = new client.Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries',
      labelNames: ['operation', 'model'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
