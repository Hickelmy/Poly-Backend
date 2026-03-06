import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('email') private readonly emailQueue: Queue,
    @InjectQueue('payments') private readonly paymentsQueue: Queue,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  async addEmailJob(data: {
    to: string;
    subject: string;
    body: string;
    template?: string;
  }) {
    const job = await this.emailQueue.add('send-email', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    this.logger.log(`Email job queued: ${job.id}`);
    return job;
  }

  async addPaymentJob(data: {
    type: string;
    paymentId: string;
    userId?: string;
    amount?: number;
    metadata?: Record<string, any>;
  }) {
    const job = await this.paymentsQueue.add(data.type, data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    });
    this.logger.log(`Payment job queued: ${job.id} (${data.type})`);
    return job;
  }

  async addNotificationJob(data: {
    type: string;
    userId: string;
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }) {
    const job = await this.notificationsQueue.add('push', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 50,
      removeOnFail: 200,
    });
    this.logger.log(`Notification job queued: ${job.id}`);
    return job;
  }

  async getQueueStats() {
    const [emailWaiting, emailActive, emailCompleted, emailFailed] =
      await Promise.all([
        this.emailQueue.getWaitingCount(),
        this.emailQueue.getActiveCount(),
        this.emailQueue.getCompletedCount(),
        this.emailQueue.getFailedCount(),
      ]);

    const [payWaiting, payActive, payCompleted, payFailed] =
      await Promise.all([
        this.paymentsQueue.getWaitingCount(),
        this.paymentsQueue.getActiveCount(),
        this.paymentsQueue.getCompletedCount(),
        this.paymentsQueue.getFailedCount(),
      ]);

    return {
      email: { waiting: emailWaiting, active: emailActive, completed: emailCompleted, failed: emailFailed },
      payments: { waiting: payWaiting, active: payActive, completed: payCompleted, failed: payFailed },
    };
  }
}
