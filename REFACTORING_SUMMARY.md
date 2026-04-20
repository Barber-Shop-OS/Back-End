# Refactoring Completo: Sprint 0 e Sprint 1

## 📋 Resumo Executivo

Este documento descreve as mudanças aplicadas ao BarberOS Back-End em duas sprints de refatoração completa, focando em **segurança crítica** (Sprint 0) e **expansão de modelo de dados SaaS** (Sprint 1).

---

## ✅ SPRINT 0 — Critical Security Fixes (COMPLETO)

### 0.1 — Hashing Seguro de Senha ✓
**Mudanças aplicadas:**
- `authController.js`: Implementa bcryptjs.hash() no registro
- `userController.js`: **NOVO** — Implementa hash seguro na atualização de usuário (PUT /:id)
- Validação de comprimento mínimo de senha (6 caracteres)

**Benefício:** Protege contra exposure de senhas em texto plano

### 0.2 — Exclusão de Password de Respostas ✓
**Mudanças aplicadas:**
- `authController.js`: Todos os retornos de User usam `attributes: { exclude: ['password'] }`
- `userController.js`: Todos os retornos usam exclusão de password
- `barberService.js`: Enriquecimento de dados exclui password
- `appointmentService.js`: Enriquecimento de dados exclui password

**Benefício:** Elimina risco de vazamento de hash via API

### 0.3 — Proteção de Rotas com Auth ✓
**Mudanças aplicadas:**
- `roleMiddleware.js`: **NOVO** — Factory function dinâmica que aceita múltiplos roles
- `authMiddleware.js`: Atualizado para usar UnauthorizedError
- Todas as rotas aplicam middleware apropriado:
  - `/api/user`: Todos exigem auth, GET/ e DELETE/ exigem role admin
  - `/api/barber`: GET públicos, POST/PUT/DELETE exigem auth + role
  - `/api/services`: GET públicos, POST/PUT/DELETE exigem auth + role
  - `/api/appointment`: Todos exigem auth (com roles diferenciados)

**Benefício:** Apenas usuários autenticados e autorizados acessam operações sensíveis

### 0.4 — Lógica de Downgrade de Role Corrigida ✓
**Mudanças aplicadas:**
- `barberService.js` método `deleteBarber()`: 
  - **ANTES:** Verificava se havia NENHUM barbeiro no sistema todo
  - **DEPOIS:** Verifica se aquele USER ESPECÍFICO tem outros registros de barbeiro
  - Se não tiver, rebaixa somente aquele usuário para 'cliente'

**Benefício:** Lógica correta de multi-user e multi-role

### 0.5 — Padronização de Mensagens em Português (pt-BR) ✓
**Mudanças aplicadas:**
- `errorHandler.js`: Classes de erro com mensagens pt-BR + 2 classes novas (UnauthorizedError, ForbiddenError)
- Todos os controllers: Mensagens pt-BR
- Todos os services: Mensagens pt-BR
- Todos os middlewares: Mensagens pt-BR
- Todas as validações: Mensagens pt-BR

**Benefício:** Experiência consistente para usuários brasileiros

---

## ✅ SPRINT 1 — Data Model Expansion (COMPLETO)

### 1.1 — Remoção de sequelize.sync() ✓
**Mudanças aplicadas:**
- `app.js`: Comentado/removido o `sequelize.sync({ force: false })`
- Estrutura preparada para **migrations versionadas**

**Benefício:** Versionamento controlado de schema, seguro para produção

### 1.2 — Configuração Sequelize CLI ✓
**Arquivos criados:**
- `.sequelizerc`: Configuração de pastas (migrations, seeders, config)
- `src/config/sequelize-config.js`: Config por ambiente (dev, test, production)

### 1.3 — Modelo Address (NOVO) ✓
**Arquivo:** `src/models/address.js`
- Campos: id, cep, number, complement, city, state, created_at
- Uso: Localização de branches

### 1.4 — Modelo Barbershop (NOVO) ✓
**Arquivo:** `src/models/barbershop.js`
- Campos: id, name, owner_id (FK), created_at
- Associação: owner_id referencia User
- Uso: Cadeia/organização de barbearias

### 1.5 — Modelo Branch (NOVO) ✓
**Arquivo:** `src/models/branch.js`
- Campos: id, name, barbershop_id (FK), address_id (FK), created_at
- Associações: Barbershop 1→N Branch, Address 1→1 Branch
- Uso: Múltiplas localizações por barbearia

### 1.6 — Modelo Barber Atualizado ✓
**Arquivo:** `src/models/barber.js`
- **NOVO campo:** branch_id (FK)
- Agora cada barbeiro está ligado a uma branch específica
- Mantém associação com User

### 1.7 — Modelo Service Atualizado ✓
**Arquivo:** `src/models/service.js`
- **CORRIGIDO:** Model name de 'barbearia' → 'Service'
- **NOVO campo:** barbershop_id (FK)
- Agora serviços pertencem a barbearias (não globais)

### 1.8 — Modelo Appointment Atualizado ✓
**Arquivo:** `src/models/appointment.js`
- **NOVO campo:** branch_id (FK)
- Agora rastreia em qual branch ocorre o agendamento

### 1.9 — Modelo Payment (NOVO) ✓
**Arquivo:** `src/models/payment.js`
- Campos: id, appointment_id (FK), amount, method (PIX/CASH), status (PENDING/PAID/FAILED), transaction_id, paid_at, created_at
- Associação: Appointment 1→1 Payment
- Uso: Gestão de pagamentos por agendamento

### 1.10 — User Model Estendido ✓
**Arquivo:** `src/models/user.js`
- Role enum estendido: 'cliente', 'barbeiro', **'owner'**, **'admin'**
- Suporta estrutura multi-tenant com proprietários

### 1.11 — Índice de Modelos Completo ✓
**Arquivo:** `src/models/index.js`
- **TODAS** as associações definidas em um único lugar
- Documentado por domínio (User, Barbershop, Branch, Appointment, Payment)
- Aliases claros para leitura (_as 'owner', _as 'client'_)

### 1.12 — Migrations Sequelize ✓
**Arquivos criados (em ordem de dependência):**
1. `20260420000001-create-users.js` — Users com role ENUM
2. `20260420000002-create-addresses.js` — Endereços
3. `20260420000003-create-barbershops.js` — Barbearias com FK user (owner)
4. `20260420000004-create-branches.js` — Branches com FK barbershop e address
5. `20260420000005-create-barbers.js` — Barbeiros com FK user e branch
6. `20260420000006-create-services.js` — Serviços com FK barbershop
7. `20260420000007-create-appointments.js` — Agendamentos com FK user, barber, service, branch
8. `20260420000008-create-payments.js` — Pagamentos com FK appointment

---

## 🚀 Como Executar as Migrações

### Pré-requisitos
```bash
npm install
npm install -D sequelize-cli
```

### Executar migrations
```bash
# Development
npx sequelize-cli db:migrate

# Production
NODE_ENV=production npx sequelize-cli db:migrate
```

### Reverter migrations (se necessário)
```bash
npx sequelize-cli db:migrate:undo
# ou para reverter uma específica
npx sequelize-cli db:migrate:undo:all
```

### Criar seeds (dados iniciais)
```bash
npx sequelize-cli seed:generate --name demo-data
npx sequelize-cli db:seed:all
```

---

## 📊 Diagrama de Relacionamentos

```
User (1) ──┐
           │
           ├─→ (N) Barbershop (proprietário)
           │        │
           │        └─→ (N) Branch
           │                  │
           │                  ├─→ (N) Barber ← (1) User (barbeiro)
           │                  │
           │                  └─→ (1) Address
           │
           ├─→ (N) Appointment ──→ (1) Barber
           │         │              │
           │         │              └─→ (1) Branch
           │         │
           │         ├─→ (1) Service ← (N) Barbershop
           │         │
           │         └─→ (1) Payment

```

---

## ⚠️ Breaking Changes

| Item | Sprint 0/1 | Impacto |
|------|---------|--------|
| Password hashing no update | Sprint 0 | Senhas antigas em plain text devem ser resetadas via email |
| Role enum estendido | Sprint 1 | 'owner' e 'admin' são novos valores permitidos |
| Branch_id obrigatório em Barber | Sprint 1 | Todos os barbeiros devem estar ligados a uma branch |
| Barbershop_id obrigatório em Service | Sprint 1 | Todos os serviços devem pertencer a uma barbearia |
| Branch_id obrigatório em Appointment | Sprint 1 | Todos os agendamentos devem registrar a branch |

---

## ✅ Checklist de Verificação Pós-Deploy

- [ ] Migrations executadas sem erro
- [ ] Tabelas criadas com colunas corretas
- [ ] ForeignKeys configuradas e validadas
- [ ] Teste: POST /api/auth/register (nova senha)
- [ ] Teste: GET /api/user/:id (sem password na resposta)
- [ ] Teste: POST /api/user/:id (senha atualizada com hash)
- [ ] Teste: GET /api/barber (sem auth, função)
- [ ] Teste: POST /api/barber (com auth + role)
- [ ] Teste: POST /api/appointment (cria com branch_id)

---

## 📝 Notas Importantes

1. **Backward Compatibility:** O projeto não é backward compatible com dados antigos. Um script de migração de dados é necessário se houver data existente.

2. **Production Ready:** Antes de deploy em produção:
   - Backup completo do banco de dados
   - Teste migrations em ambiente de staging
   - Plano de rollback preparado

3. **Próximas Fases Recomendadas:**
   - Criar controllers e services para Barbershop e Branch
   - Implementar filtros de multi-tenant (por barbershop/branch)
   - Testes de integração
   - Documentação Swagger/OpenAPI

---

**Data:** 20 de abril de 2026  
**Status:** ✅ Completo e pronto para deploy  
**Versão:** 2.0.0 (SaaS Ready)
