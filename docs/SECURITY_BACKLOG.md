# Backlog de Segurança — BarberOS (API, Web e Mobile)

> Documento vivo, escrito para ser executado por um agente de IA. Abrange os três repositórios; fica no Back-End porque a maior parte da superfície de ataque está na API.
> Última revisão: 2026-11-07 (Back-End `4489351`, Front-End `adae0cf`, Mobile `d9e7b6b`).
> Backlogs irmãos: `./BACKLOG.md` (`BE-xx`) · `../../Front-End/docs/BACKLOG.md` (`FE-xx`) · `../../Mobile/docs/BACKLOG.md` (`MOB-xx`).

---

## 0. Como usar

- Cada item `SEC-xx` tem **severidade**, **onde** (arquivo real), **ataque** (como explorar, em uma linha), **correção** e **teste de regressão obrigatório**. Quando a correção já é uma tarefa de feature, o item aponta para ela (`→ BE-01`) e o commit da feature fecha os dois.
- Severidade: **Crítico** (comprometimento de contas/tenants ou dinheiro, explorável hoje) · **Alto** · **Médio** · **Baixo**.
- **Regra de lançamento:** nenhum usuário real (nem beta) antes de todos os Críticos e Altos fechados.
- Commit: `fix(SEC-03): ...` ou `feat(BE-01): ... [SEC-01]`.
- Todo item corrigido ganha teste automatizado em `Back-End/src/__tests__/security/` (ou `integration/authz.matrix.test.js`). Item sem teste não está fechado.

### Modelo de ameaças (resumo)
| Ativo | Ameaça principal | Atores |
|---|---|---|
| Contas (cliente, barbeiro, owner, admin) | tomada de conta, escalonamento de papel | usuário malicioso logado, atacante externo |
| Dados de um tenant (agenda, clientes, faturamento) | acesso por outro tenant (IDOR/BOLA) | owner concorrente, barbeiro demitido |
| Assinatura SaaS (AbacatePay) | ativar plano sem pagar, webhook forjado | atacante externo |
| Agenda pública | spam/bloqueio de horários, enumeração | bots |
| Dados pessoais (nome, e-mail, telefone) | vazamento, LGPD | qualquer um |
| Infra (DB, segredos) | vazamento de credenciais, SQLi | atacante externo, erro operacional |

Referências usadas para o checklist: OWASP API Security Top 10 (2023), OWASP Top 10 (2021), OWASP MASVS (mobile), LGPD.

---

## 1. Achados confirmados no código (corrigir primeiro)

### [x] SEC-01 — Escalonamento de privilégio para admin — **Crítico** → BE-01
- **Onde:** `src/modules/user/userRoutes.js` (`PUT /:id` só com `authMiddleware`) + `userService.update` (`const updateData = { ...data }`).
- **Ataque:** cliente se cadastra, faz `PUT /api/user/<seu id>` com `{"role":"admin"}` → vira admin da plataforma (API Top 10: BOPLA/mass assignment + BFLA).
- **Correção:** whitelist de campos, só o próprio usuário/admin, troca de role só por rota admin.
- **Teste:** `role` no body não altera o papel; usuário A editando B → 403.

### [x] SEC-02 — IDOR em usuários, agendamentos, pagamentos e endereços — **Crítico** → BE-01, BE-04, BE-07, BE-17
- **Onde:** `GET/PUT /api/user/:id`, `GET/PUT/DELETE /api/appointment/:id`, `GET /api/payment/:id`, `GET /api/payment/appointment/:id`, `GET /api/address/:id` — todos só exigem estar logado.
- **Ataque:** iterar ids sequenciais (`/api/appointment/1..N`) → lê agenda e dados de clientes de todas as barbearias; `DELETE` apaga agendamentos de terceiros; `PUT` muda status.
- **Correção:** `authz.js` (BE-03) em todo acesso por id; 404 para recurso de outro tenant.
- **Teste:** matriz `authz.matrix.test.js` (endpoint × papel × tenant).

### [x] SEC-03 — Falta de isolamento entre tenants em barbeiros, serviços e barbearia — **Crítico** → BE-03, BE-05, BE-06
- **Onde:** `barberService.create/update/remove`, `serviceService` (rotas exigem só papel `owner`), `barbershopService.update(id, req.body)`.
- **Ataque:** qualquer owner cria/edita/exclui barbeiros e serviços (inclusive preço) de outra barbearia; `PUT /api/barbershop/:id` aceita `owner_id` no body → dono transfere a barbearia ou, combinado com outro bug, assume uma alheia.
- **Correção:** checagem de posse por `barbershop_id` derivado do recurso; whitelist de campos.
- **Teste:** owner A × recursos de B → 403/404 em todos os verbos.

### [x] SEC-04 — Agendamento em nome de terceiros e status forjado — **Alto** → BE-04
- **Onde:** `appointmentService.create(req.body)` usa `user_id` e `status` do body.
- **Ataque:** criar agendamentos em nome de outra pessoa / já `confirmado`; lotar a agenda de um concorrente.
- **Correção:** `user_id` do token; status definido pelo servidor.

### [x] SEC-05 — Segredo JWT com fallback e validação frouxa — **Alto** → BE-02
- **Onde:** `src/config/config.js` (`jwtSecret: process.env.JWT_SECRET || "********"`), `authMiddleware` (`token.replace("Bearer ", "")`, sem `algorithms`), `docker-compose.yml` (`JWT_SECRET:-your_jwt_secret`).
- **Ataque:** ambiente subido sem `.env` ou com o default do compose → tokens forjáveis com segredo conhecido.
- **Correção:** validação de env no boot, secret ≥ 32 bytes aleatórios, `algorithms:['HS256']`, `iss/aud`, `token_version` para revogação.
- **Teste:** token assinado com `your_jwt_secret` → 401 em produção; boot falha sem secret.

### [x] SEC-06 — Exposição de dados pessoais em rotas públicas — **Alto** → BE-05, BE-18
- **Onde:** `GET /api/barbershop` e `/:id` (públicos) incluem `owner: {id, name, email}`; `GET /api/barber` (público) inclui `User` inteiro sem senha (e-mail, role, created_at); listagens devolvem models crus.
- **Ataque:** coletar e-mails de todos os donos e barbeiros (spam/phishing/engenharia social).
- **Correção:** DTOs públicos explícitos (allowlist de campos) em `src/modules/*/dto.js`; nunca `res.json(model)` em rota pública.
- **Teste:** snapshot das chaves da resposta pública não contém `email`, `phone`, `role`, `password`.

### [x] SEC-07 — Rate limit contornável e sem proteção por conta — **Alto** → BE-42
- **Fechado (2026-11-19):** `TRUST_PROXY` (BE-42); limite de falhas de login por e-mail (5/15 min, sucesso não conta) além do por IP; limites próprios em forgot-password, resend-verification, availability e criação de agendamento. Store em memória — com mais de uma instância, trocar por store compartilhado (Redis/MySQL).
- **Onde:** `rateLimitMiddleware.js` (store em memória, por IP), `app.js` sem `trust proxy`.
- **Ataque:** atrás de proxy (Render/Cloudflare) todos os clientes compartilham o IP do proxy (bloqueio de todos) ou o limitador usa o IP errado; com várias instâncias o limite multiplica; brute force distribuído numa mesma conta não é contido.
- **Correção:** `app.set('trust proxy', <n de proxies>)`; store compartilhado (`rate-limit-redis` ou tabela MySQL) quando houver > 1 instância; limitador de login por **e-mail** (5 falhas/15 min → atraso progressivo) além de por IP; limites específicos para `forgot-password`, `resend-verification`, `availability`, `POST /appointment`.
- **Teste:** 6ª tentativa de login errada na mesma conta, de IPs diferentes → 429.

### [x] SEC-08 — CORS aberto para qualquer origem — **Médio** → BE-02
- **Onde:** `app.js` `app.use(cors())`.
- **Correção:** `CORS_ORIGINS` (lista) com `credentials: true` só para o domínio do web; app mobile não precisa de CORS.
- **Teste:** `Origin: https://evil.example` não recebe `Access-Control-Allow-Origin`.

### [x] SEC-09 — Entrada não validada (DoS por paginação, LIKE, tipos) — **Médio** → BE-38, BE-25
- **Onde:** todos os `findAll` (`pageSize` sem máximo), filtros `LIKE %${query.name}%` sem escapar curingas, `new Date(query.from)` sem validar.
- **Ataque:** `?pageSize=10000000` derruba a API/DB; `name=%_%_%...` força scans caros.
- **Correção:** schemas Joi, `pageSize ≤ 100`, escapar `%`/`_`, datas ISO validadas, `express.json({limit:'100kb'})`.
- **Teste:** `pageSize=100000` retorna ≤ 100.

### [x] SEC-10 — Política de senha fraca e enumeração de contas — **Médio** → BE-29, BE-26
- **Feito (2026-11-07):** mínimo 8 / máximo 72; bloqueio das 10 mil senhas mais comuns (SecLists) + lista pt-BR, inclusive "comum + números/símbolos no fim" (password123, Flamengo2026!); caracteres repetidos e sequências; senha ≠ e-mail, parte local do e-mail e nome; e-mail normalizado; bcrypt 12; login com tempo constante para e-mail inexistente (`src/shared/passwordPolicy.js`, code `WEAK_PASSWORD`). Cadastro segue com 409 para e-mail em uso, limitado pelo `authLimiter` (10 req/15 min por IP).
- **Onde:** `authService.register` (mínimo 6 caracteres), `409 E-mail já está em uso` no cadastro.
- **Correção:** mínimo 8, bloquear as 10 mil senhas mais comuns (lista local) e senha = e-mail; bcrypt cost 12; cadastro mantém 409 (UX) mas com rate limit forte; `forgot-password` sempre neutro. Normalizar e-mail (`lowercase/trim`) para evitar contas duplicadas `A@x.com` / `a@x.com`.

### [x] SEC-11 — Vazamento de detalhes internos em erros — **Médio** → BE-37
- **Onde:** `utils/errorHandler.handleErrorResponse` devolve `err.message` para qualquer erro, inclusive Sequelize/MySQL (nomes de tabela, colunas, SQL).
- **Correção:** só mensagens de `AppError` vão ao cliente; 500 genérico com `request_id`.

### [x] SEC-12 — TLS do banco sem validação de certificado — **Médio** → BE-44
- **Fechado (2026-11-19, BE-44):** ver `docs/runbook.md` e `src/config/sequelize.js`.
- **Onde:** `src/config/sequelize.js` (`rejectUnauthorized: false`).
- **Correção:** `ca` do provedor via env (`DB_SSL_CA`), `rejectUnauthorized: true`.

### [x] SEC-14 — Segredos e defaults no repositório — **Médio**
- **Fechado (2026-11-19, Back-End):** compose sem defaults sensíveis (`${VAR:?}`), app com usuário não-root, `sequelize-config` sem senha padrão, `.gitignore` com `.env.*` e `*-my-pc.*`; gitleaks no CI. Front/Mobile seguem no backlog deles.
- **Onde:** `docker-compose.yml` (`rootpassword`, `your_jwt_secret`, app conecta como `root`); `Front-End/src/config/api.ts` com Google Client ID fixo (é público por natureza, mas acopla ambiente — FE-03); arquivos locais não versionados `*-my-pc.*` no Front-End.
- **Correção:** compose sem defaults sensíveis (`${VAR:?obrigatório}`), usuário MySQL de aplicação; varredura `gitleaks` no histórico dos 3 repos e no CI; `.gitignore` com `*-my-pc.*`, `.env*` exceto `.env.example`.
- **Teste:** job `gitleaks` no CI dos três repositórios.

### [x] SEC-15 — Token de acesso persistido em `localStorage` no web — **Médio** → BE-30, FE-37
- **Fechado (2026-11-21):** o front (FE-37) guarda o access token só em memória; a sessão volta pelo refresh em cookie httpOnly.
- **Onde:** `Front-End/src/store/index.ts` (`redux-persist`, whitelist `auth` → `localStorage`).
- **Ataque:** qualquer XSS (inclusive via dependência) lê o JWT de 8 h e sequestra a sessão.
- **Correção:** access token curto só em memória; refresh em cookie `httpOnly; Secure; SameSite=Strict`; CSP restritiva (SEC-17) para reduzir XSS. Até BE-30, reduzir validade e não persistir dados além do necessário.
- **Back-end pronto (BE-30, 2026-11-19):** access 15 min + refresh rotativo em cookie httpOnly com detecção de reuso e CSRF. Fecha quando o FE-37 tirar o token do `localStorage`.

---

## 2. Controles que precisam existir antes do lançamento

### [x] SEC-13 — Webhook e checkout AbacatePay seguros — **Crítico** → BE-32, BE-33
- **Ataque:** chamar o webhook com payload `subscription.completed` forjado → plano grátis; reenviar evento antigo; trocar `externalId` para ativar outra barbearia; ativar pela URL de retorno do checkout.
- **Controles:** secret na URL **e** HMAC do corpo cru com `timingSafeEqual`; janela de timestamp de 5 min; idempotência por `event.id`; ativação só via webhook (nunca pelo `returnUrl`); conferir `externalId`, produto e valor contra o banco; reconciliação diária via API; chave `ABACATEPAY_API_KEY` só no backend, separada por ambiente (devMode/produção); logs sem dados de cartão/CPF completos.
- **Teste:** assinatura inválida, timestamp velho, evento repetido, valor divergente → nenhuma mudança de status.
- **Fechado (2026-11-19):** segredo em tempo constante + HMAC do corpo cru (quando a chave pública está configurada); a AbacatePay v2 não envia timestamp, então o replay é barrado pela idempotência por `event.id`; ativação só via webhook; produto e valor conferidos contra o plano (divergência → `rejected`, sem mudança); externalId autoritativo; reconciliação diária. Testes em `src/__tests__/integration/billing/webhooks.test.js`.

### [x] SEC-16 — Cadeia de dependências — **Alto**
- **Fechado (2026-11-21):** `npm audit --omit=dev --audit-level=high` limpo nos dois repos (Back-End: `@aws-sdk/*` e `fast-xml-parser` atualizados; resta só a moderada do `uuid` interno do Sequelize, sem correção não-quebrante).
- **Parcial (2026-11-07, Back-End):** `npm audit fix` (18 → 1 vulnerabilidade de produção, só moderada: `uuid` interno do Sequelize), nodemailer 10, CI com `npm audit --audit-level=high`, Dependabot, gitleaks, deps sem uso removidas, `engines`. **Front-End (2026-11-21):** zod 4.6 (alta: exaustão de memória), react-router 7.18 (moderada: open redirect), `redux-persist`/`redux-saga` sem uso removidos → `npm audit --omit=dev` com 0 vulnerabilidades; CI do front já roda `npm audit --audit-level=high`, Dependabot e gitleaks. Mobile cancelado.
- `npm audit --omit=dev --audit-level=high` falhando o CI nos 3 repos; Dependabot (npm + GitHub Actions) semanal; `npm ci` com lockfile; fixar versão do Node (`.nvmrc` / `engines`); remover dependências sem uso (`mysql`, `body-parser`, `react-icons` — BE-08/FE-04); revisar `babel-plugin-react-compiler` beta.

### [x] SEC-17 — Cabeçalhos de segurança no web (Cloudflare) — **Alto** → FE
- **Fechado (2026-11-21, FE-40):** `_headers` gerado no build do front com CSP/HSTS/nosniff/frame-ancestors/Referrer/Permissions-Policy; ESLint proíbe `dangerouslySetInnerHTML`. Validar com securityheaders.com no deploy.
- **Onde:** `Front-End/wrangler.json` só serve assets; não há `_headers`.
- **Fazer:** arquivo `public/_headers` (ou Worker) com: `Content-Security-Policy` (`default-src 'self'; script-src 'self' https://accounts.google.com; connect-src 'self' <API_URL>; img-src 'self' data: <R2_URL>; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`), `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=()`. Validar com securityheaders.com.
- **Front:** proibir `dangerouslySetInnerHTML` (regra ESLint) e sanitizar qualquer texto vindo do dono (descrição da barbearia) — React escapa por padrão, manter assim.

### [x] SEC-18 — Cabeçalhos e superfície da API — **Médio**
- **Fechado (2026-11-19):** helmet (HSTS incluso), sem `X-Powered-By`, Swagger fora de produção e `GET /` sem versão — com teste (`security-hardening.test.js`). HTTPS/redirect no proxy (runbook).
- `helmet` já ativo — manter; adicionar `app.disable('x-powered-by')` (helmet cobre, confirmar); Swagger só fora de produção (já está — adicionar teste); `GET /` não revelar versão; HTTPS obrigatório (redirect/HSTS no proxy).

### [x] SEC-19 — Segurança do app mobile — **Alto** → MOB
- **Descartado (2026-11-21):** o app mobile foi cancelado; o produto é só web.
- Tokens em `expo-secure-store` (Keychain/Keystore), nunca `AsyncStorage`; nenhum segredo no bundle (só URL pública da API e IDs públicos); deep links validados (`barberos://convite/:token` não executa ação sem confirmação do usuário); `android:allowBackup=false` / excluir storage sensível de backup; desabilitar logs em release; checagem de versão mínima (`/api/app-config` força update em caso de falha crítica); ofuscação padrão (Hermes); certificate pinning [DECISÃO PENDENTE — recomendação: não no MVP, custo de rotação alto].

### [ ] SEC-20 — LGPD e privacidade — **Alto** → BE-40, FE-30
- Política de privacidade e termos publicados e aceitos no cadastro (com versão); base legal por dado (execução de contrato para agendamento); minimização (barbeiro vê nome e telefone do cliente só dos próprios atendimentos); exportação e exclusão de conta; retenção definida (logs 90 dias, dados de tenant cancelado 90 dias e depois anonimização); registro de operadores (AbacatePay, provedor de e-mail, Cloudflare, hospedagem) e DPA; canal do encarregado (e-mail) no rodapé; e-mails de marketing só com opt-in.

### [x] SEC-21 — Abuso da agenda pública — **Médio** → BE-14, BE-13
- **Fechado (2026-11-21):** agendar online exige e-mail verificado **ou** telefone (`403 CONTACT_REQUIRED`, decisão de 20/11); dono/gerente bloqueia cliente na barbearia (`PATCH .../clients/:id { blocked, blocked_reason }` → `403 CLIENT_BLOCKED` no agendamento online; a equipe ainda agenda no balcão); faltas já visíveis no CRM. Captcha (Turnstile) fica para se surgir abuso.
- **Parcial (2026-11-15, Sprint C):** máximo de 3 agendamentos futuros por cliente/barbearia (`409 TOO_MANY_ACTIVE_APPOINTMENTS`), 10 criações/hora por conta de cliente, rate limit de 60/min e `Cache-Control` 30 s em `GET /availability` e `GET /search/branches`, `Idempotency-Key` na criação (BE-13, BE-14, BE-25). **Falta:** e-mail verificado ou telefone para agendar [DECISÃO PENDENTE], faltas visíveis ao dono e bloqueio de cliente (BE-23), captcha se surgir abuso.
- Limite de agendamentos futuros por cliente/barbearia (3); limite de criação por conta/IP (ex.: 10/h); exigir e-mail verificado **ou** telefone para agendar [DECISÃO PENDENTE]; contagem de faltas (`nao_compareceu`) visível ao dono e opção de bloquear cliente na barbearia; `GET /availability` com rate limit e cache curto; captcha (Cloudflare Turnstile) no cadastro e no agendamento sem conta se surgir abuso.

### [x] SEC-22 — Uploads — **Médio** → BE-34
- **Fechado (2026-11-19, BE-34):** magic bytes, sem SVG/HTML, ≤ 2 MB, chave do servidor, bucket próprio. **Recomendado depois:** reprocessar com `sharp` para remover EXIF.
- Tipos permitidos por magic bytes (jpeg/png/webp), sem SVG/HTML; ≤ 2 MB; nome gerado pelo servidor; bucket sem listagem; servir de domínio separado da aplicação; remover EXIF (reprocessar com `sharp`) [recomendado].

### [x] SEC-23 — Suíte automatizada de segurança — **Alto** → BE-09
- **Feito (2026-11-07):** matriz `authz.matrix.test.js` (41 rotas × papéis; falha se rota nova não for declarada); `mass-assignment.test.js` cobrindo todas as 17 rotas de escrita; testes de JWT (`auth-token.test.js`); DAST com OWASP ZAP API scan em `.github/workflows/dast.yml` (semanal + manual) contra instância temporária com MySQL 8, alvo `/api/docs.json`, exceções em `.zap/rules.tsv`. **Quando o staging existir (BE-44):** apontar o ZAP para ele.
- `authz.matrix.test.js`: tabela declarativa `{method, path, roles_allowed, tenant_scoped}` para **toda** rota; o teste gera casos para cada papel (anônimo, cliente, barbeiro A, owner A, owner B, admin) e falha se a rota nova não estiver na tabela.
- Testes de mass assignment: para cada `POST/PUT/PATCH`, enviar campos proibidos (`id`, `role`, `owner_id`, `barbershop_id`, `status`, `created_at`) e afirmar que não persistem.
- Testes de JWT: alg `none`, secret errado, expirado, `token_version` antigo.
- DAST: OWASP ZAP baseline contra staging no CI semanal.

### [ ] SEC-24 — Pentest antes do lançamento — **Alto**
- Após sprints A–D: checklist OWASP API Top 10 executado manualmente contra staging (registrar evidências em `docs/security/pentest-AAAA-MM.md`), incluindo fluxo de pagamento AbacatePay em devMode. Corrigir achados e reexecutar.

### [x] SEC-25 — Banco e infraestrutura — **Médio** → BE-44
- **Fechado (2026-11-19, BE-44):** ver `docs/runbook.md` e `src/config/sequelize.js`.
- Usuário de aplicação com `SELECT/INSERT/UPDATE/DELETE` apenas; migrations com usuário separado; banco sem acesso público (allowlist de IP/VPC); backups criptografados com teste de restore trimestral; rotação de segredos documentada (JWT, DB, AbacatePay, SMTP); segredos só no gerenciador do provedor.

### [x] SEC-26 — Tokens de uso único (reset, verificação, convite) — **Alto** → BE-22, BE-26, BE-27
- 32 bytes de `crypto.randomBytes`, armazenados como SHA-256, expiração curta, uso único, invalidação ao trocar senha/e-mail; links nunca com o e-mail em texto; troca de senha derruba todas as sessões (`token_version`); aviso por e-mail em troca de senha/e-mail.
- **Fechado (2026-11-19):** `user_tokens` (BE-26/27/29) + convites (BE-22): SHA-256, expiração, uso único com consumo atômico, link anterior invalidado, `token_version` derrubando sessões e avisos de segurança por e-mail.

### [x] SEC-27 — Contas privilegiadas — **Médio** → BE-41
- **Fechado (2026-11-21):** 2FA TOTP (RFC 6238, sem dependências) com segredo cifrado (AES-256-GCM, `TOTP_ENCRYPTION_KEY`), proteção contra reuso do código e 10 códigos de recuperação (hash SHA-256, uso único). Login com 2FA devolve `challenge_token` (5 min) e a sessão abre em `POST /auth/2fa/verify`. Obrigatório para admin (rotas `/api/admin` → `403 TWO_FACTOR_SETUP_REQUIRED` até ativar; admin não desativa) e opcional para os demais (decisão de 20/11). Dono recebe e-mail quando alguém entra na equipe (barbeiro, gerente, recepção, convite aceito). Admin só por script CLI e auditoria das ações admin já existiam.
- Admin criado só por script CLI; 2FA (TOTP) obrigatório para admin e opcional para owner [DECISÃO PENDENTE para owner]; log de auditoria de toda ação admin (BE-36); alerta por e-mail ao owner quando um novo barbeiro/gerente é adicionado.

### [ ] SEC-28 — Monitoramento e resposta a incidentes — **Médio** → BE-42
- Alertas: pico de 401/403/429, falhas de assinatura de webhook, erros 5xx; `docs/security/incident-response.md` (quem acionar, como revogar tokens em massa — incrementar `token_version` global —, como rotacionar chaves, como comunicar titulares/ANPD em até 3 dias úteis quando aplicável).

### [x] SEC-29 — Logs seguros — **Baixo**
- **Fechado (2026-11-19):** logs sem corpo; `authorization`, senhas, tokens, CPF/CNPJ mascarados; URL do log sem token de convite nem `token/secret` na query (`safeUrl`).
- `requestLoggerMiddleware` já não loga corpo — manter e testar; scrubbing de `authorization`, `password`, `token`, `cpf`, `cnpj` em logs e no Sentry; não logar query string de rotas com token (`/invitations/:token`, `verify-email?token=`).

### [x] SEC-30 — Limite próprio para `/auth/refresh` — **Médio (disponibilidade)**
- **Fechado (2026-11-21):** o refresh dividia a cota de 10/15 min do login (`authLimiter`); com access token de 15 min e um refresh a cada carregamento do app, poucas recargas geravam 429 e derrubavam a sessão. Agora usa `refreshLimiter` (600/15 min por IP — vários aparelhos da barbearia saem pelo mesmo IP; o token tem 256 bits, então o limite não protege contra adivinhação). `authLimiter` passa a ser testável com `RATE_LIMIT_IN_TESTS`.

### [x] SEC-31 — Limite geral por IP compatível com o uso real — **Médio (disponibilidade)**
- **Fechado (2026-11-21):** `apiLimiter` subiu de 100 para 300 req/min por IP. Na validação do front, navegar pelo painel em ritmo normal gerava 429 (cada tela faz ~10 chamadas, há polling da agenda) e barbearias têm vários aparelhos atrás do mesmo IP. Limites específicos (login, refresh, e-mail, pagamento, agendamento) continuam.

### [x] SEC-32 — Tolerância de 30 s no reuso do refresh — **Médio (disponibilidade)**
- **Fechado (2026-11-21):** a detecção de reuso (SEC-15) derrubava a sessão inteira em corridas legítimas — duas abas abrindo ao mesmo tempo, ou recarga enquanto uma renovação estava em voo (o `Set-Cookie` novo se perde). Reapresentar o refresh recém-trocado em até 30 s, com a família ainda ativa, agora emite outro refresh da mesma família; depois disso continua revogando tudo (`REFRESH_REUSED`).

---

## Ordem de execução recomendada
1. **Imediato (antes de qualquer outra feature):** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06 (via BE-01…BE-05, BE-18) + SEC-23 (matriz) para não regredir.
2. **Sprint A/B:** SEC-07, SEC-08, SEC-09, SEC-10, SEC-11, SEC-14, SEC-16.
3. **Antes de ligar cobrança:** SEC-13, SEC-26.
4. **Antes do lançamento:** SEC-12, SEC-15, SEC-17, SEC-18, SEC-19 (se o app for junto), SEC-20, SEC-21, SEC-22, SEC-24, SEC-25.
5. **Contínuo:** SEC-27, SEC-28, SEC-29.
