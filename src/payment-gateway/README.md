# Payment Gateway - Tokenização de Pagamentos

## ⚠️ IMPORTANTE: Segurança de Dados de Pagamento

**NUNCA** armazene dados sensíveis de pagamento no banco de dados:
- ❌ Número completo do cartão
- ❌ CVV/CVC
- ❌ Data de validade completa
- ❌ Dados do portador do cartão

**SEMPRE** use tokenização:
- ✅ Apenas tokens retornados pelo gateway
- ✅ IDs de transação
- ✅ Últimos 4 dígitos (apenas para exibição)
- ✅ Bandeira do cartão (apenas para exibição)

## Fluxo de Pagamento

### 1. Pagamento com Cartão de Crédito

#### Frontend → Gateway (Direto)
O frontend deve enviar os dados do cartão **diretamente** ao gateway de pagamento (Abacate Pay, Stripe, etc), nunca ao nosso backend.

```javascript
// Exemplo: Frontend envia dados do cartão diretamente ao Abacate Pay
const response = await fetch('https://api.abacatepay.com/v1/cards/tokenize', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${gatewayToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    cardNumber: '4111111111111111',
    cvv: '123',
    expiryMonth: '12',
    expiryYear: '2025',
    holderName: 'Nome do Portador',
  }),
});

const { token } = await response.json();
```

#### Frontend → Backend (Apenas Token)
Depois de obter o token do gateway, o frontend envia apenas o token ao nosso backend:

```javascript
// Frontend envia apenas o token ao nosso backend
await polysApi.paymentGateway.createPixPayment({
  amount: 100.00,
  product_id: 'prod-123',
  payment_method: 'credit_card',
  payment_token: token, // Token retornado pelo gateway
  installments: 3,
});
```

#### Backend → Gateway (Processa Pagamento)
O backend usa o token para processar o pagamento:

```typescript
// Backend processa pagamento usando o token
const result = await paymentGatewayService.createAbacatePayment({
  amount: 100.00,
  productId: 'prod-123',
  paymentMethod: 'credit_card',
  paymentToken: token, // Token recebido do frontend
  installments: 3,
});
```

### 2. Salvar Cartão para Uso Futuro (Tokenização)

Se o usuário quiser salvar o cartão para uso futuro:

1. **Frontend** tokeniza o cartão diretamente no gateway
2. **Frontend** envia o token ao backend para salvar
3. **Backend** salva apenas o token (nunca dados do cartão)

```javascript
// 1. Tokenizar cartão no gateway (frontend)
const tokenResponse = await fetch('https://api.abacatepay.com/v1/cards/tokenize', {
  // ... dados do cartão
});

const { token, last4, brand, expiryMonth, expiryYear } = await tokenResponse.json();

// 2. Salvar token no nosso backend
await polysApi.paymentGateway.savePaymentToken({
  token_id: token,
  gateway_provider: 'abacate_pay',
  last4_digits: last4,
  card_brand: brand,
  expiry_month: expiryMonth,
  expiry_year: expiryYear,
});
```

### 3. Usar Cartão Salvo

Quando o usuário escolher usar um cartão salvo:

```javascript
// Frontend busca tokens salvos do usuário
const savedTokens = await polysApi.paymentTokens.list();

// Usa o token salvo no pagamento
await polysApi.paymentGateway.createPixPayment({
  amount: 100.00,
  product_id: 'prod-123',
  payment_method: 'credit_card',
  payment_token_id: savedTokens[0].id, // ID do token salvo no nosso banco
  installments: 1,
});
```

## Modelos de Dados

### PaymentToken
Armazena apenas informações não sensíveis do cartão tokenizado:

```typescript
{
  id: string;              // ID no nosso banco
  userId: string;          // Usuário dono do token
  tokenId: string;         // ID do token no gateway
  gatewayProvider: string; // 'abacate_pay', 'stripe', etc
  last4Digits: string;    // Apenas últimos 4 dígitos
  cardBrand: string;      // 'Visa', 'Mastercard', etc
  expiryMonth: number;    // Mês de expiração
  expiryYear: number;     // Ano de expiração
  isDefault: boolean;     // Cartão padrão
}
```

### ProjectPayment / Order
Armazena apenas tokens e IDs de transação:

```typescript
{
  transactionId: string;    // ID da transação no gateway
  paymentToken: string;      // Token do cartão (se usado)
  gatewayProvider: string;   // Nome do gateway
  last4Digits: string;      // Últimos 4 dígitos (opcional, apenas exibição)
  cardBrand: string;         // Bandeira (opcional, apenas exibição)
  installments: number;     // Número de parcelas
}
```

## Checklist de Segurança

- [x] Dados do cartão nunca passam pelo nosso backend
- [x] Apenas tokens são armazenados no banco
- [x] Últimos 4 dígitos apenas para exibição
- [x] Bandeira do cartão apenas para exibição
- [x] Tokenização feita diretamente no gateway
- [x] Webhooks do gateway para confirmação de pagamento
- [x] Dados sensíveis criptografados (endereços, etc)

## Exemplo Completo: Checkout de Produto

```typescript
// 1. Usuário preenche dados do cartão no frontend
const cardData = {
  number: '4111111111111111',
  cvv: '123',
  expiryMonth: '12',
  expiryYear: '2025',
  holderName: 'João Silva',
};

// 2. Frontend tokeniza diretamente no gateway
const token = await tokenizeCardInGateway(cardData);

// 3. Frontend envia apenas o token ao nosso backend
const order = await polysApi.paymentGateway.createPixPayment({
  amount: product.price,
  product_id: product.id,
  payment_method: 'credit_card',
  payment_token: token.id, // Apenas o token
  installments: 1,
});

// 4. Backend processa e salva apenas o transactionId
// Nenhum dado sensível é armazenado!
```

