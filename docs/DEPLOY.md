# Deploy da API (ambiente de teste)

> Procedimento completo de produção (usuários do banco, migrations, rollback): ver [`runbook.md`](./runbook.md).

## Arquitetura de teste

| Parte | Onde | Observação |
|---|---|---|
| Banco | **Supabase** (PostgreSQL) | conexão por `DATABASE_URL` no *Session pooler* (porta 5432) |
| API | Railway (ou Render) a partir do `Dockerfile` | healthcheck em `GET /health` |
| Front | Vercel (teste) ou Cloudflare | ver `docs/DEPLOY.md` do Front-End |

## Passo a passo

1. **Supabase:** criar o projeto (região São Paulo, `sa-east-1`) e copiar a connection string do *Session pooler*
   (Project Settings → Database → Connection string). Não usar o *Transaction pooler* (porta 6543).
2. **Railway:** New Project → Deploy from GitHub repo → `Barber-Shop-OS/Back-End` (usa o `Dockerfile`).
3. Variáveis do serviço:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | connection string do Supabase (*Session pooler*) |
| `DB_SSL` | `true` |
| `DB_POOL_MAX` | `5` no plano gratuito do Supabase |
| `JWT_SECRET` | gerar com `openssl rand -base64 48` |
| `CORS_ORIGINS` | URL do front, ex. `https://barberos-web.vercel.app` |
| `APP_URL` | a mesma URL do front |
| `TRUST_PROXY` | `1` |
| `MIGRATE_ON_BOOT` | `true` no teste; em produção `false` e migrations no passo de release |
| `MAIL_DRIVER` / `RESEND_API_KEY` | `log` até configurar o Resend |

4. **Settings → Networking → Generate Domain**: essa URL vira o `VITE_API_BASE_URL` do front.
5. Conferir `GET /health` e depois o fluxo de cadastro e agendamento pelo front.

Demais variáveis (AbacatePay, Google, R2): ver `.env.example`.
