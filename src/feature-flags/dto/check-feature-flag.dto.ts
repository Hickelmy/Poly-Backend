import { IsString, IsOptional } from 'class-validator';

export class CheckFeatureFlagDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  userRole?: string;
}
