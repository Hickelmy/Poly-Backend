export class UserEventDto {
  sessionId: string;
  page: string;
  action: string;
  target?: string;
  metadata?: Record<string, any>;
  duration?: number;
  createdAt?: string; // ISO string from client clock
}

export class BatchEventsDto {
  events: UserEventDto[];
}
