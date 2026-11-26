# Deploy da API + banco (ambiente de teste)

> Procedimento completo de produção (usuários do banco, migrations, rollback): ver [`runbook.md`](./runbook.md). Este guia cobre só o ambiente de teste.

## Por que não Supabase (por enquanto)

A API usa **MySQL 8** (Sequelize `dialect: 'mysql'`, driver `mysql2`). O Supabase é **PostgreSQL**.
Migrar exige trocar o driver e reescrever as migrations que alteram colunas `ENUM`
(`20261114000015-appointments-v2.js`, entre outras), que o Sequelize não converte para Postgres.
Por isso o teste sobe com um MySQL 8 gerenciado, sem mudar código.

## Provedor recomendado: Railway (API + MySQL no mesmo projeto)

- MySQL 8 de verdade: as migrations, `FOR UPDATE SKIP LOCKED` (fila de jobs) e os `ENUM` funcionam como no CI.
- A API roda pelo `Dockerfile` do repositório e fala com o banco pela rede privada (sem expor o MySQL).
- Custo: plano Hobby, US$ 5/mês com US$ 5 de uso incluídos (confirmar em railway.com/pricing).

### Passo a passo

1. railway.com → **New Project → Deploy from GitHub repo** → `Barber-Shop-OS/Back-End` (usa o `Dockerfile`).
2. No mesmo projeto: **+ New → Database → MySQL**.
3. Variáveis do serviço da API (use as referências do MySQL do Railway):

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST` | `${{MySQL.MYSQLHOST}}` |
| `DB_PORT` | `${{MySQL.MYSQLPORT}}` |
| `DB_USER` | `${{MySQL.MYSQLUSER}}` |
| `DB_PASS` | `${{MySQL.MYSQLPASSWORD}}` |
| `DB_NAME` | `${{MySQL.MYSQLDATABASE}}` |
| `DB_SSL` | `false` (rede privada do Railway) |
| `JWT_SECRET` | gerar com `openssl rand -base64 48` |
| `CORS_ORIGINS` | URL do front na Cloudflare, ex. `https://barberos-web.<conta>.workers.dev` |
| `APP_URL` | a mesma URL do front |
| `TRUST_PROXY` | `1` |
| `MAIL_DRIVER` | `log` (até configurar o Resend ou SMTP) |
| `MIGRATE_ON_BOOT` | `true` no teste (aplica as migrations ao subir); em produção, `false` e migrations no passo de release |

4. **Settings → Networking → Generate Domain** → essa URL vira o `VITE_API_BASE_URL` do front.
5. Com `MIGRATE_ON_BOOT=true`, o primeiro boot aplica as migrations. Health check: `GET /health`.

## Alternativas avaliadas

| Opção | Prós | Contras |
|---|---|---|
| **Railway MySQL** (recomendado) | MySQL 8 real, API e banco juntos, deploy em minutos | pago por uso (~US$ 5/mês) |
| Aiven for MySQL | MySQL 8 real, backups | plano gratuito de MySQL encerrado (não cria novos desde 06/11/2026); Developer ~US$ 5/mês |
| TiDB Cloud Starter | gratuito (5 GiB, cota mensal) | compatível só em parte com MySQL 8; `SKIP LOCKED` e as migrations precisam ser validados antes |
| Supabase (Postgres) | plano gratuito, painel bom | exige portar o backend para Postgres (trabalho de dias, não de horas) |

## Para produção (antes de clientes reais)

Ver `SECURITY_BACKLOG.md`: ainda abertos SEC-07 (rate limit por conta/compartilhado), SEC-12 (TLS do banco
com CA), SEC-13 (webhook AbacatePay), SEC-15 (refresh token em cookie), SEC-16 (dependências do front).
