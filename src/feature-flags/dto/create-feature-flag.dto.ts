import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateFeatureFlagDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledZoneIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledZoneIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledCities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledCities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledStates?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledStates?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedUserIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  priority?: number;
}
