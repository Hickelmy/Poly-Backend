import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  name!: string;

  // role is intentionally excluded — always 'USER' on registration

  @IsOptional()
  @IsString()
  accountType?: string; // "USER" | "ZONE_ADMIN" | "COMPANY"

  // Campos de endereço (já vêm criptografados do frontend)
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  cep?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  houseNumber?: string;

  // Campos de empresa
  @IsOptional()
  @IsString()
  companyDescription?: string;

  @IsOptional()
  @IsString()
  companyCategory?: string;

  @IsOptional()
  @IsString()
  companyWebsite?: string;

  @IsOptional()
  @IsString()
  companyDocumentUrl?: string;
}


