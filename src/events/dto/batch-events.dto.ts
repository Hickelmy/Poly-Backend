export class UserEventDto {
  sessionId!: string;
  page!: string;
  action!: string;
  target?: string;
  metadata?: Record<string, any>;
  duration?: number;
  createdAt?: string;
}

export class BatchEventsDto {
  events!: UserEventDto[];
}
