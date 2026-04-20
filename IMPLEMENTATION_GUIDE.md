# 🚀 Guia de Implementação — Sprint 0 & Sprint 1

## ⚠️ PRÉ-REQUISITOS

- Node.js 14+ instalado
- MySQL 5.7+ (ou mariadb) em execução
- Arquivo `.env` configurado com credenciais do banco de dados
- npm (gerenciador de pacotes Node.js)

---

## 📦 PASSO 1: Instalar Sequelize CLI

```bash
# Instalar como dependência de desenvolvimento
npm install --save-dev sequelize-cli

# Verificar instalação
npx sequelize-cli --version
```

---

## 📝 PASSO 2: Verificar Configuração

### 2.1 Arquivo `.env` deve conter:
```bash
DB_HOST=localhost
DB_USER=root
DB_PASS=sua_senha
DB_NAME=barbershop_db
PORT=3000
JWT_SECRET=seu_jwt_secret_aqui
```

### 2.2 Verificar que `.sequelizerc` existe e aponta para os caminhos corretos

```bash
cat .sequelizerc
# Deve retornar:
# - config: src/config/sequelize-config.js
# - models-path: src/models
# - migrations-path: src/migrations
# - seeders-path: src/seeders
```

---

## 🔄 PASSO 3: Executar Migrações

### 3.1 Em Ambiente de Desenvolvimento

```bash
# Executar TODAS as migrations
npx sequelize-cli db:migrate

# Verificar status das migrations
npx sequelize-cli db:migrate:status
```

**Saída esperada:**
```
up  20260420000001-create-users.js
up  20260420000002-create-addresses.js
up  20260420000003-create-barbershops.js
up  20260420000004-create-branches.js
up  20260420000005-create-barbers.js
up  20260420000006-create-services.js
up  20260420000007-create-appointments.js
up  20260420000008-create-payments.js
```

### 3.2 Em Produção

```bash
# Definir variável de ambiente
export NODE_ENV=production

# Executar migrations
npx sequelize-cli db:migrate

# Verificar
npx sequelize-cli db:migrate:status
```

---

## 🧪 PASSO 4: Testar Endpoints (Postman/Insomnia)

### 4.1 Registrar Novo Usuário
```
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "name": "João Silva",
  "email": "joao@example.com",
  "password": "senha123",
  "role": "cliente"
}
```

**Resultado esperado:**
```json
{
  "message": "Usuário cadastrado com sucesso",
  "user": {
    "id": 1,
    "name": "João Silva",
    "email": "joao@example.com",
    "role": "cliente"
    // NOTA: password NÃO aparece na resposta
  }
}
```

### 4.2 Login
```
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "joao@example.com",
  "password": "senha123"
}
```

**Resultado esperado:**
```json
{
  "message": "Login realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 4.3 Obter Perfil (com Token)
```
GET http://localhost:3000/api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Resultado esperado:**
```json
{
  "id": 1,
  "name": "João Silva",
  "email": "joao@example.com",
  "role": "cliente"
}
```

### 4.4 Listar Usuários (requer admin)
```
GET http://localhost:3000/api/user
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Resultado esperado (se não for admin):**
```json
{
  "message": "Acesso restrito. Permissão necessária: admin"
}
```
Status: 403

### 4.5 Criar Barbeiro (requer auth + admin/owner)
```
POST http://localhost:3000/api/barber
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "user_id": 1,
  "bio": "Barbeiro experiente com 10 anos"
}
```

**Resultado esperado:**
```json
{
  "id": 1,
  "user_id": 1,
  "bio": "Barbeiro experiente com 10 anos",
  "created_at": "2026-04-20T10:00:00.000Z"
}
```

---

## 🔙 PASSO 5: Se Precisar Reverter

### 5.1 Reverter Última Migration
```bash
npx sequelize-cli db:migrate:undo
```

### 5.2 Reverter Todas as Migrations
```bash
npx sequelize-cli db:migrate:undo:all
```

### 5.3 Reverter para Migration Específica
```bash
# Reverter até a migration de users (exclusive)
npx sequelize-cli db:migrate:undo:all --to 20260420000001-create-users.js
```

---

## ✅ PASSO 6: Verificação Final

### Checklist
- [ ] `npm install` executado sem erros
- [ ] `.env` configurado com credenciais corretas
- [ ] Migrations executadas com sucesso
- [ ] Tabelas criadas no banco de dados
- [ ] POST /api/auth/register funciona
- [ ] POST /api/auth/login retorna token
- [ ] GET /api/auth/me funciona com token
- [ ] GET /api/user retorna 403 sem token
- [ ] GET /api/barber retorna dados públicos

### Verificação no MySQL

```sql
-- Verificar que todas as tabelas foram criadas
SHOW TABLES;

-- Resultado esperado:
-- addresses
-- appointments
-- barbershops
-- barbers
-- branches
-- payments
-- services
-- sequelize_meta (criada automaticamente)
-- users

-- Verificar estrutura de uma tabela
DESCRIBE users;

-- Verificar dados
SELECT * FROM users;
```

---

## 🐛 Troubleshooting

### Erro: "Table 'users' doesn't exist"
```
Solução: Executar npx sequelize-cli db:migrate
```

### Erro: "Access denied for user"
```
Solução: Verificar credenciais em .env
- DB_HOST: localhost (ou IP correto)
- DB_USER: root (ou usuário correto)
- DB_PASS: senha correta
- DB_NAME: nome do banco de dados
```

### Erro: "sequelize-cli not found"
```
Solução: npm install -D sequelize-cli
```

### Erro: "Cannot find module 'sequelize'"
```
Solução: npm install sequelize
(deve estar em package.json)
```

### Password appearing in response
```
Solução: Verificar que attributes: { exclude: ['password'] } está aplicado
- Buscar em controllers, services
- Garantir que enrichment functions usam exclusão
```

---

## 📚 Referências

### Sequelize CLI Docs
- https://github.com/sequelize/cli

### Executar Migrations
```bash
npx sequelize-cli db:migrate
npx sequelize-cli db:migrate:status
npx sequelize-cli db:migrate:undo
```

### Criar Seeds (dados de teste)
```bash
npx sequelize-cli seed:generate --name demo-users
npx sequelize-cli db:seed:all
```

---

## 🎯 Próximos Passos

1. **Criar Controllers para Barbershop e Branch**
   - GET /api/barbershop
   - POST /api/barbershop
   - GET /api/branch
   - POST /api/branch

2. **Implementar Filtros Multi-Tenant**
   - GET /api/barber?barbershop_id=1
   - GET /api/services?barbershop_id=1

3. **Testes de Integração**
   - Fluxo de agendamento completo
   - Integração com payments

4. **Documentação Swagger/OpenAPI**

---

**Última Atualização:** 20 de abril de 2026  
**Versão:** 2.0.0  
**Status:** ✅ Pronto para Implementação
