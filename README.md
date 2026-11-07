# BarberOS — API (Back-End)

API REST do BarberOS, SaaS multi-tenant de agendamento para barbearias (uma barbearia ou uma rede com filiais).

> **Status:** em desenvolvimento — ainda **não** está pronto para produção.
> O que falta está em [`docs/BACKLOG.md`](./docs/BACKLOG.md) (funcionalidades) e [`docs/SECURITY_BACKLOG.md`](./docs/SECURITY_BACKLOG.md) (segurança).

## Stack

Node.js ≥ 20 · Express 4 · Sequelize 6 · MySQL 8 · JWT (HS256) · Joi · Jest + Supertest · ESLint 9

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha JWT_SECRET (openssl rand -base64 48) e o banco
docker compose up -d db   # MySQL 8 local (ou use um MySQL seu)
npm run dev               # aplica as migrations pendentes e sobe em http://localhost:3000
```

A API **não sobe** com configuração insegura: `JWT_SECRET` ausente, curto (< 32) ou com valor de exemplo,
dados do banco ausentes, ou `CORS_ORIGINS` ausente em produção (ver `src/config/env.js`).

Documentação interativa (Swagger), fora de produção: `http://localhost:3000/api/docs`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor com reload (nodemon) |
| `npm start` | servidor (produção) |
| `npm test` | testes unitários e de integração (SQLite em memória) |
| `npm run test:coverage` | testes com cobertura |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run migrate` / `migrate:undo` / `migrate:status` | migrations via sequelize-cli |

As migrations também são aplicadas automaticamente no boot (`server.js`), com verificação de que o schema
confere com os models.

## Arquitetura

```
src/
  routes/indexRoutes.js        registro central das rotas
  modules/<dominio>/
    <dominio>Routes.js         rotas + Swagger + middlewares (auth, papel, validação)
    <dominio>Schemas.js        validação Joi de body/query/params
    <dominio>Controller.js     só HTTP
    <dominio>Service.js        regras de negócio e autorização por tenant
    <dominio>Repository.js     acesso ao banco (Sequelize)
  shared/                      authz (tenant), tokens JWT, paginação, erros, utilitários
  middlewares/                 auth, papel, validação, erros, rate limit, log
  models/ migrations/ config/
  __tests__/{unit,integration,helpers}
```

### Regras transversais
- **Multi-tenant:** o tenant é a `Barbershop`. Toda leitura/escrita de recurso de uma barbearia passa por
  `src/shared/authz.js` (dono só no próprio tenant; barbeiro nos próprios atendimentos; cliente nos próprios
  agendamentos; admin em tudo).
- **Identidade vem do token**, nunca do corpo: `user_id`, `owner_id`, `status` e `role` enviados pelo cliente
  são ignorados ou recusados.
- **Erros** sempre no formato `{ "message": "...", "code": "...", "details": [...]? }` (catálogo em
  `src/shared/errorCodes.js`). Erros internos nunca vazam detalhes.
- **Paginação:** `?page=1&pageSize=10` (máximo 100); resposta `{ items, page, pageSize, total, totalPages }`.

## Papéis

`cliente` · `barbeiro` · `owner` (dono de barbearia) · `admin` (plataforma). O cadastro público cria sempre
`cliente`; o papel só muda por `PATCH /api/admin/users/:id/role` (admin), o que encerra as sessões do usuário.

## Exemplo rápido

```bash
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"João Silva","email":"joao@example.com","password":"senha-forte-123"}'

curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"joao@example.com","password":"senha-forte-123"}'

curl http://localhost:3000/api/auth/me -H "Authorization: Bearer <token>"
```

## Licença

MIT — ver [LICENSE](./LICENSE).
