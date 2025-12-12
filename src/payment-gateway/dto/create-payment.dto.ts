import { IsNumber, IsString, IsOptional, IsBoolean, Min } from 'class-validator';

/**
 * DTO para criação de pagamento
 * NUNCA deve conter dados sensíveis como número completo do cartão, CVV, etc
 * Dados sensíveis devem ser enviados diretamente ao gateway via frontend
 */
export class CreatePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  project_id?: string;

  @IsOptional()
  @IsString()
  product_id?: string;

  @IsOptional()
  @IsString()
  service_id?: string;

  @IsString()
  payment_method!: string; // 'pix', 'credit_card', 'debit_card', 'boleto'

  @IsOptional()
  @IsString()
  payment_token_id?: string; // ID do token salvo (se o usuário escolher usar cartão salvo)

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsNumber()
  installments?: number; // Número de parcelas (apenas para cartão)

  @IsOptional()
  @IsString()
  delivery_method?: string; // 'delivery' ou 'pickup'

  @IsOptional()
  @IsString()
  delivery_address?: string; // Endereço de entrega (já criptografado do frontend)
}

/**
 * DTO para processar pagamento com cartão
 * Este DTO é usado apenas internamente quando o gateway retorna o token
 * NUNCA deve ser usado para receber dados do frontend diretamente
 */
export class ProcessCardPaymentDto {
  @IsString()
  token!: string; // Token retornado pelo gateway após processar o cartão

  @IsString()
  gateway_provider!: string;

  @IsOptional()
  @IsString()
  last4_digits?: string;

  @IsOptional()
  @IsString()
  card_brand?: string;

  @IsOptional()
  @IsNumber()
  expiry_month?: number;

  @IsOptional()
  @IsNumber()
  expiry_year?: number;
}

