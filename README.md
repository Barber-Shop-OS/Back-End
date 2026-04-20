# 🚀 BarberOS Back-End v2.0

**Status:** ✅ Production Ready | **License:** MIT

---

## 📋 O que é BarberOS?

BarberOS é uma **plataforma SaaS para gestão de barbearias** com suporte a:
- ✅ Autenticação JWT segura
- ✅ Múltiplas barbearias e branches
- ✅ Gerenciamento de barbeiros e agendamentos
- ✅ Rastreamento de pagamentos
- ✅ Controle de acesso baseado em roles (RBAC)
- ✅ 100% das mensagens em Português (pt-BR)

---

## 🎯 Quick Start

### Pré-requisitos
- Node.js 14+ 
- MySQL 5.7+
- npm

### Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Instalar Sequelize CLI (para migrações)
npm install -D sequelize-cli

# 3. Configurar .env
cp .env.example .env
# Editar com suas credenciais do MySQL

# 4. Executar migrações
npx sequelize-cli db:migrate

# 5. Iniciar servidor
npm run dev
```

**Servidor rodando em:** `http://localhost:3000`

---

## 📚 Documentação

O repositório mantém apenas um documento de apoio além deste README:

- [RELATORIO_MUDANCAS.md](./RELATORIO_MUDANCAS.md) | Resumo consolidado do que foi mudado

---

## 🏗️ Arquitetura

```
Routes → Controllers → Services → Repositories → Models
   ↑                                              ↓
   └──────────────── Middleware Stack ──────────→
                  (Auth, Roles, Validation)
```

### Stack Tecnológico
- **Runtime:** Node.js 14+
- **Framework:** Express 4.21.2
- **ORM:** Sequelize 6.37.6
- **Database:** MySQL 5.7+
- **Auth:** JWT + bcryptjs
- **Validation:** Joi/Custom

### Banco de Dados (8 Tabelas)

```
Users ─┬─→ Barbershops ─→ Branches ─→ Barbers
       ├─→ Appointments ─→ Payments
       └─→ Services
       └─→ Addresses
```

---

## 🔐 Segurança

- ✅ Senhas hashadas com bcryptjs (10 rounds)
- ✅ JWT com expiração (8 horas)
- ✅ Password nunca é retornado em respostas
- ✅ Autenticação obrigatória em endpoints sensíveis
- ✅ Autorização baseada em roles (RBAC)
- ✅ CORS habilitado
- ✅ Validação de payload
- ✅ Foreign keys com CASCADE delete

---

## 🌐 Endpoints Principais

### Autenticação
```bash
POST   /api/auth/register      # Registrar novo usuário
POST   /api/auth/login         # Login com email/senha
GET    /api/auth/me            # Obter perfil do usuário logado
```

### Usuários (Admin Only)
```bash
GET    /api/user               # Listar todos os usuários
GET    /api/user/:id           # Obter usuário específico
PUT    /api/user/:id           # Atualizar usuário
DELETE /api/user/:id           # Deletar usuário
```

### Barbearias (Owner/Admin)
```bash
GET    /api/barbershop         # Listar barbearias
POST   /api/barbershop         # Criar barbearia
GET    /api/barbershop/:id     # Obter barbearia
PUT    /api/barbershop/:id     # Atualizar barbearia
DELETE /api/barbershop/:id     # Deletar barbearia
```

### Branches (Owner/Admin)
```bash
GET    /api/branch             # Listar branches
POST   /api/branch             # Criar branch
GET    /api/branch/:id         # Obter branch
PUT    /api/branch/:id         # Atualizar branch
DELETE /api/branch/:id         # Deletar branch
```

### Barbeiros (Público/Auth)
```bash
GET    /api/barber             # Listar barbeiros (público)
POST   /api/barber             # Criar barbeiro (admin/owner)
GET    /api/barber/:id         # Obter barbeiro
PUT    /api/barber/:id         # Atualizar (owner/admin)
DELETE /api/barber/:id         # Deletar (owner/admin)
```

### Serviços (Público/Auth)
```bash
GET    /api/services           # Listar serviços (público)
POST   /api/services           # Criar serviço (admin/owner)
PUT    /api/services/:id       # Atualizar (admin/owner)
DELETE /api/services/:id       # Deletar (admin/owner)
```

### Agendamentos (Auth Required)
```bash
GET    /api/appointment        # Listar agendamentos (barbeiro/admin/owner)
POST   /api/appointment        # Criar agendamento
GET    /api/appointment/:id    # Obter agendamento
PUT    /api/appointment/:id    # Atualizar agendamento
DELETE /api/appointment/:id    # Cancelar agendamento
```

### Pagamentos (Admin/Owner)
```bash
GET    /api/payment            # Listar pagamentos
POST   /api/payment            # Registrar pagamento
GET    /api/payment/:id        # Obter pagamento
PUT    /api/payment/:id        # Atualizar pagamento
```

---

## 🧪 Testando com cURL

### 1. Registrar
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@example.com",
    "password": "senha123",
    "role": "cliente"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@example.com",
    "password": "senha123"
  }'
```

### 3. Usar Token
```bash
TOKEN="seu_token_aqui"
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Modelo de Dados

### Users
```javascript
{
  id: Integer (PK),
  name: String,
  email: String (UNIQUE),
  password: String (HASHED),
  role: ENUM ['cliente', 'barbeiro', 'owner', 'admin'],
  created_at: DateTime
}
```

### Barbershops
```javascript
{
  id: Integer (PK),
  name: String,
  owner_id: Integer (FK → Users),
  created_at: DateTime
}
```

### Branches
```javascript
{
  id: Integer (PK),
  name: String,
  barbershop_id: Integer (FK → Barbershops),
  address_id: Integer (FK → Addresses),
  created_at: DateTime
}
```

### Appointments
```javascript
{
  id: Integer (PK),
  user_id: Integer (FK → Users),
  barber_id: Integer (FK → Barbers),
  service_id: Integer (FK → Services),
  branch_id: Integer (FK → Branches),
  appointment_date: DateTime,
  status: ENUM ['pending', 'confirmed', 'completed', 'cancelled'],
  created_at: DateTime
}
```

### Payments
```javascript
{
  id: Integer (PK),
  appointment_id: Integer (FK → Appointments),
  amount: Decimal(10,2),
  method: ENUM ['PIX', 'CASH'],
  status: ENUM ['PENDING', 'PAID', 'FAILED'],
  transaction_id: String,
  paid_at: DateTime,
  created_at: DateTime
}
```

---

## 🚀 Deploy em Produção

### Checklist
1. [ ] Backup do banco de dados
2. [ ] `.env` configurado com credenciais reais
3. [ ] `npm install` e `npm run build`
4. [ ] Migrações executadas: `npx sequelize-cli db:migrate`
5. [ ] Testes passando: `npm test`
6. [ ] Verificações de segurança
7. [ ] Deploy com PM2 ou Docker

### Com PM2
```bash
npm install -g pm2
pm2 start app.js --name "barberos-api"
pm2 save
pm2 startup
```

### Com Docker (Futura)
```bash
docker build -t barberos:latest .
docker run -p 3000:3000 barberos:latest
```

---

## 🐛 Troubleshooting

### Erro: "Table doesn't exist"
```bash
npx sequelize-cli db:migrate
```

### Erro: "Access denied for user"
Verificar credenciais em `.env`

### Erro: "Port already in use"
```bash
sudo kill -9 $(lsof -ti:3000)
```

---

## 📝 Versão 2.0 — Principais Mudanças

### ✨ Novo (Sprint 1)
- Modelo SaaS completo (Barbershops, Branches)
- Migrações versionadas com Sequelize CLI
- 4 novos modelos (Address, Barbershop, Branch, Payment)
- Suporte a múltiplas localizações por barbearia

### 🔒 Segurança (Sprint 0)
- Hashing de senha na atualização
- Exclusão de password de todas as respostas
- Proteção de rotas com autenticação e roles
- Lógica corrigida de downgrade de role

### 🌐 Localização
- 100% das mensagens em português (pt-BR)
- Suporte a CEP e endereços brasileiros

---

## 📦 Dependências Principais

```json
{
  "express": "^4.21.2",
  "sequelize": "^6.37.6",
  "mysql2": "^3.13.0",
  "bcryptjs": "^3.0.2",
  "jsonwebtoken": "^9.0.2",
  "cors": "^2.8.5",
  "dotenv": "^16.x.x"
}
```

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja [LICENSE](./LICENSE) para detalhes.

---

## 👨‍💻 Autor

**BarberOS Development Team**

---

## 📞 Suporte

Para suporte, consulte o relatório consolidado em [RELATORIO_MUDANCAS.md](./RELATORIO_MUDANCAS.md).

---

**Versão:** 2.0.0  
**Data:** 20 de abril de 2026  
**Status:** ✅ Production Ready