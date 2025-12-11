import { IsString, IsOptional } from 'class-validator';

export class CreateReportDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
