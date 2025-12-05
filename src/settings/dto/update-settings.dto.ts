import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsBoolean()
  openSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  dailySummary?: boolean;

  @IsOptional()
  @IsString()
  defaultLocale?: string;
}


