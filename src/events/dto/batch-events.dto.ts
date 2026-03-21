import {
  IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const ALLOWED_ACTIONS = ['pageview', 'click', 'search', 'filter', 'feature_use'] as const;

export class UserEventDto {
  @IsString()
  sessionId!: string;

  @IsString()
  page!: string;

  @IsString()
  @IsIn(ALLOWED_ACTIONS)
  action!: string;

  @IsString()
  @IsOptional()
  target?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsString()
  @IsOptional()
  createdAt?: string;
}

export class BatchEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserEventDto)
  events!: UserEventDto[];
}
