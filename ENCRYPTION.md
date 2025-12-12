# Sistema de Criptografia - POLYS

## 🔐 Como Funciona

O sistema usa **criptografia simétrica AES-256-GCM** para proteger dados sensíveis. Cada usuário tem sua própria chave derivada de uma chave mestre + email do usuário.

### Fluxo de Criptografia

```
1. Chave Mestre (variável de ambiente)
   ↓
2. Chave Mestre + Email do Usuário
   ↓
3. PBKDF2 (100.000 iterações) + Salt
   ↓
4. Chave AES-256 derivada (única por usuário)
   ↓
5. Criptografia/Descriptografia dos dados
```

## 🔑 Configuração das Chaves

### Backend (.env)

Adicione no arquivo `.env` do backend:

```env
# Chave mestre para criptografia de dados sensíveis
# IMPORTANTE: Use uma chave forte e aleatória em produção!
# Gere uma chave segura com: openssl rand -base64 32
ENCRYPTION_MASTER_KEY=sua-chave-mestre-super-secreta-aqui
```

**Como gerar uma chave segura:**

**Opção 1: Script PowerShell (Recomendado para Windows)**
```powershell
# Execute o script na pasta Polys-Backend
.\generate-encryption-key.ps1
```

**Opção 2: Comando direto**
```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Opção 3: Node.js (funciona em qualquer sistema)**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Frontend (.env ou .env.local)

Adicione no arquivo `.env` ou `.env.local` do frontend:

```env
# DEVE SER A MESMA CHAVE DO BACKEND!
REACT_APP_ENCRYPTION_MASTER_KEY=sua-chave-mestre-super-secreta-aqui
```

**⚠️ IMPORTANTE:**
- A chave do frontend **DEVE SER EXATAMENTE A MESMA** do backend
- Em produção, use variáveis de ambiente seguras
- **NUNCA** commite a chave no Git
- Use chaves diferentes para desenvolvimento e produção

## 🔒 Segurança

### Por que usar chave por usuário?

A chave é derivada de: `MASTER_KEY + EMAIL_USUARIO`

**Vantagens:**
- Cada usuário tem sua própria chave
- Se uma chave for comprometida, apenas um usuário é afetado
- Dados de diferentes usuários não podem ser descriptografados entre si

### Algoritmo

- **Criptografia:** AES-256-GCM
- **Derivação de chave:** PBKDF2 com 100.000 iterações
- **Hash:** SHA-256
- **Salt:** Fixo (pode ser melhorado para salt único por usuário)

### Dados Criptografados

- ✅ Telefone
- ✅ CEP
- ✅ Rua/Logradouro
- ✅ Número da casa
- ✅ Bairro
- ✅ Chaves PIX (random, phone, email, cpf)

### Dados NÃO Criptografados

- ❌ Email (usado como identificador)
- ❌ Nome (usado para exibição)
- ❌ Cidade/Estado (usados para filtros)

## 🚀 Configuração Rápida

### 1. Gerar chave segura

**Windows (PowerShell):**
```powershell
# Na pasta Polys-Backend
.\generate-encryption-key.ps1
# Ou comando direto:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Linux/Mac:**
```bash
cd Polys-Backend
openssl rand -base64 32
```

**Node.js (qualquer sistema):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Copie a chave gerada** - você vai usar a mesma chave em ambos os arquivos (.env do backend e .env.local do frontend)

### 2. Adicionar ao .env

**Backend (.env):**
```env
ENCRYPTION_MASTER_KEY=<chave-gerada>
```

**Frontend (.env.local):**
```env
REACT_APP_ENCRYPTION_MASTER_KEY=<mesma-chave-gerada>
```

### 3. Reiniciar aplicações

```bash
# Backend
npm run start:dev

# Frontend
npm run dev
```

## 🔄 Migração de Dados Existentes

Se você já tem dados no banco que não estão criptografados:

1. Os dados antigos continuarão funcionando (compatibilidade)
2. Quando o usuário atualizar, os dados serão criptografados
3. O sistema detecta automaticamente se os dados estão criptografados ou não

## ⚠️ Avisos Importantes

1. **NUNCA perca a chave mestre** - Se perder, não será possível descriptografar os dados
2. **Use chaves diferentes** para desenvolvimento e produção
3. **Backup da chave** - Guarde a chave em local seguro (gerenciador de senhas, cofre)
4. **Rotação de chaves** - Em caso de comprometimento, gere nova chave e migre os dados

## 🛠️ Melhorias Futuras

- [ ] Salt único por usuário (armazenado no banco)
- [ ] Rotação automática de chaves
- [ ] API para obter chave do backend (mais seguro)
- [ ] Suporte a múltiplas chaves (migração gradual)

