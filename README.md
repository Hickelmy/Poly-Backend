# Polys Backend

Backend da aplicação Polys desenvolvido com NestJS e Prisma. Sistema de gestão de projetos, produtos, serviços e pagamentos com autenticação JWT.

## 🚀 Tecnologias

- **NestJS** - Framework Node.js para construção de aplicações server-side
- **Prisma** - ORM moderno para TypeScript
- **PostgreSQL** - Banco de dados relacional
- **JWT** - Autenticação baseada em tokens
- **TypeScript** - Linguagem de programação
- **bcrypt** - Criptografia de senhas
- **Helmet** - Segurança HTTP
- **Throttler** - Rate limiting

## 📋 Pré-requisitos

Antes de começar, você precisa ter instalado:

- **Node.js** (versão 18 ou superior)
- **PostgreSQL** (versão 12 ou superior)
- **Yarn** ou **npm**

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <url-do-repositorio>
cd Polys-Backend
```

2. Instale as dependências:
```bash
yarn install
# ou
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp env-example .env
```

4. Edite o arquivo `.env` com suas configurações:
```env
PORT=3001
DATABASE_URL="postgresql://user:password@localhost:5432/polys_db?schema=public"
JWT_SECRET="sua-chave-secreta-aqui"
JWT_EXPIRES_IN="30d"
CORS_ORIGIN=*
```

5. Configure o banco de dados PostgreSQL e atualize a `DATABASE_URL` no `.env`

## 🗄️ Configuração do Banco de Dados

1. Crie um banco de dados PostgreSQL:
```sql
CREATE DATABASE polys_db;
```

2. Execute as migrations do Prisma:
```bash
yarn prisma:migrate
# ou
npm run prisma:migrate
```

3. Gere o cliente Prisma:
```bash
yarn prisma:generate
# ou
npm run prisma:generate
```

## ▶️ Como Executar

### Desenvolvimento

Para executar em modo de desenvolvimento com hot-reload:

```bash
yarn start:dev
# ou
npm run start:dev
```

Para executar com setup completo do banco (migrations + generate + start):

```bash
yarn start:db
# ou
npm run start:db
```

### Produção

1. Compile o projeto:
```bash
yarn build
# ou
npm run build
```

2. Execute em produção:
```bash
yarn start:prod
# ou
npm run start:prod
```

A aplicação estará rodando em `http://localhost:3001` (ou na porta configurada no `.env`).

## 📜 Scripts Disponíveis

- `yarn start` - Inicia a aplicação
- `yarn start:dev` - Inicia em modo desenvolvimento com watch
- `yarn start:prod` - Inicia em modo produção
- `yarn start:db` - Executa migrations, gera Prisma client e inicia em dev
- `yarn start:reset` - Reseta o banco, gera Prisma client e inicia em dev
- `yarn build` - Compila o projeto TypeScript
- `yarn prisma:generate` - Gera o cliente Prisma
- `yarn prisma:migrate` - Executa as migrations do banco
- `yarn prisma:studio` - Abre o Prisma Studio (interface visual do banco)
- `yarn lint` - Executa o linter
- `yarn format` - Formata o código com Prettier

## 📁 Estrutura do Projeto

```
Polys-Backend/
├── src/
│   ├── auth/              # Módulo de autenticação (JWT)
│   ├── users/             # Gerenciamento de usuários
│   ├── projects/          # Gestão de projetos
│   ├── project-votes/     # Sistema de votação em projetos
│   ├── project-payments/  # Pagamentos de projetos
│   ├── products/          # Gestão de produtos
│   ├── services/          # Gestão de serviços
│   ├── settings/          # Configurações da aplicação
│   ├── prisma/            # Serviço Prisma
│   ├── app.module.ts      # Módulo principal
│   └── main.ts            # Arquivo de entrada
├── prisma/
│   ├── schema.prisma      # Schema do banco de dados
│   └── migrations/        # Migrations do Prisma
├── dist/                  # Código compilado (gerado)
├── .env                   # Variáveis de ambiente (não versionado)
├── env-example            # Exemplo de variáveis de ambiente
└── package.json           # Dependências e scripts
```

## 🔐 Autenticação

A API utiliza autenticação JWT. Para acessar rotas protegidas, inclua o token no header:

```
Authorization: Bearer <seu-token-jwt>
```

## 📊 Modelos de Dados Principais

- **User** - Usuários do sistema
- **Project** - Projetos com financiamento coletivo
- **ProjectVote** - Votos em projetos
- **ProjectPayment** - Pagamentos para projetos
- **ProjectExpense** - Despesas dos projetos
- **Product** - Produtos à venda
- **Service** - Serviços oferecidos
- **AppSettings** - Configurações gerais da aplicação

## 🛠️ Prisma Studio

Para visualizar e gerenciar os dados do banco de forma visual:

```bash
yarn prisma:studio
# ou
npm run prisma:studio
```

Isso abrirá uma interface web em `http://localhost:5555`.

## 🔒 Segurança

- Senhas são criptografadas com bcrypt
- JWT para autenticação
- Helmet para proteção HTTP
- Rate limiting com Throttler
- Validação de dados com class-validator
- CORS configurável

## 📝 Licença

**PROPRIETÁRIA - TODOS OS DIREITOS RESERVADOS**

Este software é proprietário e todos os direitos são reservados. É expressamente proibida a cópia, modificação, distribuição ou uso sem autorização prévia e por escrito do proprietário.

Para mais detalhes, consulte o arquivo [LICENSE](LICENSE).

## 👤 Autor

Projeto Polys - Todos os direitos reservados

