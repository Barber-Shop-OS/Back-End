# Runbook — operação da API BarberOS

## Ambientes
| | staging | production |
|---|---|---|
| Banco | MySQL 8 dedicado (`barberos_staging`) | MySQL 8 dedicado (`barberos_prod`) |
| AbacatePay | chave de **modo teste** (`abc_dev_...`) | chave de produção |
| E-mail | SMTP de teste (ou `MAIL_DRIVER=log`) | SMTP real |
| `APP_URL` | URL do front de staging | URL do front de produção |

Nunca compartilhe banco, segredo JWT, chave da AbacatePay ou segredo de webhook entre ambientes.

## Variáveis obrigatórias (produção)
`NODE_ENV=production`, `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME`, `DB_SSL=true` + `DB_SSL_CA` (PEM ou caminho),
`JWT_SECRET` (≥ 32 caracteres aleatórios), `CORS_ORIGINS`, `APP_URL`, `MAIL_*`, `TRUST_PROXY=1` (atrás de Render/Cloudflare),
`MIGRATE_ON_BOOT=false`. Integrações: `ABACATEPAY_*`, `GOOGLE_CLIENT_ID`, `R2_*` (ver `.env.example`).

## Usuário do banco (SEC-25)
A aplicação usa um usuário **sem** `DROP`/`GRANT`/`CREATE USER`:
```sql
CREATE USER 'barberos_app'@'%' IDENTIFIED BY '<senha forte>';
GRANT SELECT, INSERT, UPDATE, DELETE ON barberos_prod.* TO 'barberos_app'@'%';
-- usuário separado só para o passo de release (migrations):
CREATE USER 'barberos_migrator'@'%' IDENTIFIED BY '<outra senha>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON barberos_prod.* TO 'barberos_migrator'@'%';
```

## Deploy (reproduzível)
1. CI verde na `main` (lint, testes, migrations em MySQL 8).
2. Build da imagem: `docker build -t barberos-api:<sha> .` (multi-stage, `node:22-alpine`, usuário `node`, `HEALTHCHECK /health`).
3. **Release** (uma vez por deploy, com o usuário migrator):
   `docker run --rm --env-file prod.env -e DB_USER=barberos_migrator -e DB_PASS=... barberos-api:<sha> npm run migrate:release`
   — usa `GET_LOCK` no MySQL; duas releases simultâneas não colidem.
4. Sobe as instâncias com `MIGRATE_ON_BOOT=false` (o boot só valida o schema e falha se divergir).
5. Verificação: `GET /health` (processo) e `GET /ready` (banco) = 200; conferir logs JSON (`request_id`).
6. Produtos da AbacatePay (primeira vez ou plano novo): `npm run billing:sync-products`.
7. Admin inicial: `npm run create-admin -- ops@empresa.com "Ops" "<senha forte>"`.

Local (igual à produção): `docker compose up -d --build` com `.env` de `NODE_ENV=production`.

## Rollback
- Código: suba a imagem anterior (`barberos-api:<sha anterior>`). As migrations são aditivas; a versão anterior
  roda no schema novo na maioria dos casos.
- Schema (só se necessário e sem perda de dados): `npx sequelize-cli db:migrate:undo` com o usuário migrator,
  **depois** de um backup. Migrations que descartam dados (ex.: `down` de clientes de balcão) estão comentadas no arquivo.

## Backup e restore
- Backup diário (retenção 30 dias) — gerenciado pelo provedor ou:
  `mysqldump --single-transaction --routines --triggers -h $DB_HOST -u backup -p barberos_prod | gzip > barberos-$(date +%F).sql.gz`
- **Teste de restore (mensal):**
  1. `gunzip -c barberos-AAAA-MM-DD.sql.gz | mysql -h <host-de-teste> -u root -p barberos_restore`
  2. Suba a API apontando para `barberos_restore` com `MIGRATE_ON_BOOT=false` → `/ready` = 200 e o boot não acusa divergência de schema.
  3. Login com uma conta conhecida e `GET /api/admin/metrics` coerente com produção.
  4. Registre data, tamanho do dump e tempo de restore.

## Rotação de segredos
- `JWT_SECRET`: trocar derruba todas as sessões (access e refresh deixam de valer porque o access é assinado e
  o refresh depende do usuário). Faça fora do horário de pico.
- `ABACATEPAY_API_KEY`: crie a chave nova no painel, atualize, faça deploy, revogue a antiga.
- `ABACATEPAY_WEBHOOK_SECRET`: webhooks não são editáveis — crie um webhook novo com o segredo novo, atualize a env,
  faça deploy e só então apague o webhook antigo (retentativas pendentes do antigo se perdem).
- `DB_PASS`: crie a senha nova no banco (`ALTER USER`), atualize, deploy, invalide a antiga.
- `R2_*` / `MAIL_*`: gerar nova credencial, atualizar, deploy, revogar a antiga.

## Incidente de webhook (assinatura não ativou / cobrança divergente)
1. `GET /api/admin/barbershops?subscription_status=pending` e `GET /api/admin/barbershops/:id` (eventos da assinatura).
2. Tabela `webhook_events`: status `rejected` = divergência (valor/produto); `ignored` = sem assinatura correspondente.
3. Logs: procure `[billing] ALERTA` e o `request_id`.
4. O job diário `billing.daily` reconcilia `pending/past_due` consultando a AbacatePay; para forçar, rode-o
   pelo worker (ou reenvie o evento pelo painel da AbacatePay — o `id` é o mesmo e a idempotência evita duplicidade).
5. Webhook respondendo 503 = `ABACATEPAY_WEBHOOK_SECRET` ausente; 401 = segredo divergente do cadastrado no painel.

## Observabilidade
- Alertas de segurança: buscas `[security] ALERTA` e `[billing] ALERTA` → ver `docs/security/incident-response.md`.
- Logs JSON no stdout com `request_id` (também devolvido no header `X-Request-Id` e no corpo dos erros 500).
- Campos sensíveis (senhas, tokens, authorization, CPF/CNPJ) são mascarados.
- `GET /health` para liveness e `GET /ready` para readiness (banco).
