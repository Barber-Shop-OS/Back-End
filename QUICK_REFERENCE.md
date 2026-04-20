# ⚡ QUICK REFERENCE — BarberOS v2.0

## 🚀 Start Server
```bash
npm install
npm run dev
```

---

## 📚 Documentação Rápida

| Quando Você Precisa | Leia |
|-----------------|------|
| Entender mudanças da v1 | [WHAT'S_NEW.md](./WHAT'S_NEW.md) |
| Deploy em produção | [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) |
| Passo a passo setup | [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) |
| Ver arquitetura | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Arquivos mudados | [FILES_CHANGED.md](./FILES_CHANGED.md) |
| Para executivos | [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md) |

---

## 🔧 Comandos Úteis

### Development
```bash
npm run dev              # Inicia servidor em watch mode
npm test                 # Roda testes
npm run lint             # Verifica código
```

### Database
```bash
# Migrações
npx sequelize-cli db:migrate           # Executar todas
npx sequelize-cli db:migrate:status    # Ver status
npx sequelize-cli db:migrate:undo      # Reverter última
npx sequelize-cli db:migrate:undo:all  # Reverter todas

# Backup
mysqldump -u root -p barbershop_db > backup.sql
mysql -u root -p barbershop_db < backup.sql
```

### Limpeza
```bash
npm run clean            # Remove node_modules
npm install              # Reinstala dependências
```

---

## 🌐 API Quick Test

### 1️⃣ Registrar
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"João","email":"joao@test.com","password":"123456","role":"cliente"}'
```

### 2️⃣ Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@test.com","password":"123456"}'
```

### 3️⃣ Usar Token (salve o token do login acima)
```bash
TOKEN="seu_token_aqui"
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📁 Estrutura de Pastas

```
Back-End/
├── src/
│   ├── config/           # Configurações (DB, etc)
│   ├── controllers/      # Controladores (5)
│   ├── middlewares/      # Middlewares (6)
│   ├── models/           # Modelos (8)
│   ├── migrations/       # Migrações (8)
│   ├── repositories/     # Acesso a dados (3)
│   ├── routes/           # Rotas (6)
│   ├── services/         # Lógica de negócio (3)
│   └── utils/            # Utilitários
├── app.js                # Express app
├── server.js             # Entry point
├── package.json          # Dependências
├── .env                  # Variáveis de ambiente
├── .sequelizerc           # Config Sequelize
└── README.md             # Este projeto
```

---

## 🔐 Roles & Permissions

| Role | Ações |
|------|-------|
| **cliente** | Ver barbeiros, serviços. Criar agendamentos próprios |
| **barbeiro** | Tudo de cliente + ver agendamentos próprios |
| **owner** | Criar/gerenciar barbershop e branches próprias |
| **admin** | Acesso total (admin global) |

---

## 🗄️ Modelos (8 Tabelas)

```
Users (com 4 roles)
├── Barbershop (cadeia)
│   ├── Branch (localização)
│   │   ├── Address
│   │   └── Barber
│   └── Service
├── Barber
│   └── Appointment
│       ├── User (client)
│       ├── Service
│       └── Payment
```

---

## 🔒 Proteção de Rotas

| Rota | Auth | Role |
|------|------|------|
| GET /barber | ❌ | - |
| POST /barber | ✅ | admin, owner |
| PUT /user/:id | ✅ | admin |
| GET /appointment | ✅ | barber, admin, owner |
| POST /appointment | ✅ | any |

---

## 💾 Variáveis de Ambiente (.env)

```bash
DB_HOST=localhost
DB_USER=root
DB_PASS=senha_aqui
DB_NAME=barbershop_db
DB_PORT=3306
NODE_ENV=development
PORT=3000
JWT_SECRET=seu_secret_jwt_aqui
```

---

## 🐛 Problemas Comuns

### "Table doesn't exist"
```bash
npx sequelize-cli db:migrate
```

### "Access denied"
Verificar .env com credenciais MySQL

### "Port 3000 in use"
```bash
sudo kill -9 $(lsof -ti:3000)
```

### "Module not found"
```bash
npm install
```

---

## 📊 Sprint Completion

| Sprint | Status | Focus |
|--------|--------|-------|
| Sprint 0 | ✅ DONE | Segurança |
| Sprint 1 | ✅ DONE | SaaS Model |
| Sprint 2 | 📋 TODO | Controllers (Barbershop, Branch) |
| Sprint 3 | 📋 TODO | Testes integrados |

---

## 🎯 Próximo Passo

1. **Setup Local**
   ```bash
   npm install -D sequelize-cli
   npx sequelize-cli db:migrate
   npm run dev
   ```

2. **Testar**
   - POST /api/auth/register
   - POST /api/auth/login
   - GET /api/auth/me

3. **Deploy**
   - Seguir [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

---

## 📞 Documentação Detalhada

Para mais informações, consulte os arquivos de documentação:

| Arquivo | Objetivo |
|---------|----------|
| README.md | Overview do projeto |
| WHAT'S_NEW.md | O que mudou |
| ARCHITECTURE.md | Diagramas e design |
| IMPLEMENTATION_GUIDE.md | Setup e deploy |
| DEPLOYMENT_CHECKLIST.md | Checklist produção |
| REFACTORING_SUMMARY.md | Mudanças detalhadas |

---

## 🆘 Precisa de Ajuda?

1. Verifique a documentação acima
2. Consulte DEPLOYMENT_CHECKLIST.md > Troubleshooting
3. Verifique logs: `tail -f logs/app.log`
4. Reverter mudanças: `git revert HEAD`

---

**Versão:** 2.0.0  
**Atualizado:** 20 de abril de 2026  
**Status:** ✅ Production Ready

**Comece aqui:** Ler [README.md](./README.md)
