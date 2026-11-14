# Backlog — Back-End BarberOS (API)

> Documento vivo, escrito para ser executado por um agente de IA. Cada tarefa é autocontida, aponta arquivos reais e tem critério de aceite verificável.
> Última revisão: 2026-11-07 (estado lido do código no commit `4489351`).
> Backlogs irmãos: Front `../../Front-End/docs/BACKLOG.md` (`FE-xx`) · Mobile `../../Mobile/docs/BACKLOG.md` (`MOB-xx`) · Segurança `./SECURITY_BACKLOG.md` (`SEC-xx`).
> Os IDs `BE-01…BE-43` já são referenciados pelo backlog do front — **não renumerar**. Tarefas novas entram a partir de `BE-44`.

---

## 0. Como usar (leia antes de qualquer tarefa)

### Regras de execução
- Ordem: P0 → P1 → P2 → P3. Dentro da fase, seguir o número. Respeitar **Depende de**.
- **Um commit por tarefa** (pode haver commits de preparação, mas a feature fecha em um commit): `feat(BE-13): motor de disponibilidade` / `fix(BE-01): ...` / `test(BE-09): ...`. Corpo do commit lista os critérios atendidos.
- **[DECISÃO PENDENTE]** = pedir "ok" ao responsável antes; a recomendação já está escrita e pode ser assumida se ele mandar seguir.
- Tarefa marcada `[SEC-xx]` também fecha um item do backlog de segurança — marcar nos dois.
- Não trocar stack (Node + Express 4 + Sequelize 6 + MySQL + Jest/Supertest). Bibliotecas novas só quando usuais no ecossistema e citadas aqui.

### Decisões de produto registradas
| Data | Decisão |
|---|---|
| 2026-10-23 | Dono se cadastra por fluxo próprio `POST /api/auth/register-owner` (BE-21). |
| 2026-10-23 | Agendamento nasce **`confirmado`** (confirmação automática). |
| 2026-10-23 | Cliente cancela/reagenda **até 24 h antes**; depois só a barbearia. API retorna `can_cancel_until`. Erro `409 CANCELLATION_WINDOW_CLOSED`. |
| 2026-10-23 | Sem app iOS no curto prazo (iPhone usa o web). App mobile ver `Mobile/docs/BACKLOG.md`. |
| 2026-11-07 | **3 planos mensais: R$ 99, R$ 199, R$ 399.** Gateway: **AbacatePay (API v2)**. Ver BE-31…BE-35. |
| 2026-11-07 | Tenant = **Barbershop** (rede). Filiais = **Branch**. Assinatura pertence à Barbershop. |

### Estado atual confirmado (2026-11-07)
- Stack: Express 4.21, Sequelize 6 (MySQL; testes em SQLite `:memory:`), JWT (`jsonwebtoken`, 8 h), bcryptjs, helmet, express-rate-limit (memória), winston, swagger-jsdoc (desligado em produção), umzug (migrations no boot em `server.js`).
- Arquitetura em uso: `src/routes/indexRoutes.js` → `src/modules/<dominio>/{Routes,Controller,Service,Repository}.js` → `src/models/*`.
- **Código morto** (não referenciado pelo `indexRoutes`): `src/controllers/*`, `src/routes/{auth,user,barber,service,appointment}Routes.js`, `src/services/*`, `src/repositories/*`, `src/middlewares/validate{Appointment,Barber,Service}Payload.js` (duplicados de `middlewares/validators/*`), `src/config/testSequelize.js` (confirmar).
- Tabelas (9 migrations): `users`, `addresses`, `barbershops`, `branches`, `barbers`, `services`, `appointments`, `payments`, + rename `created_at`. **Nenhum índice** além de `users.email unique`.
- Modelos: `User.role ∈ {cliente, barbeiro, owner, admin}`; `Appointment.status ∈ {pendente, confirmado, cancelado}` com um único `appointment_date` (sem fim/duração); `Service.price` é `FLOAT`; `Payment.method ∈ {PIX, CASH}` (pagamento presencial, não gateway).
- Endpoints existentes: `/api/auth/{register,login,me}`, CRUD de `/api/{user,barber,services,appointment,barbershop,branch}`, `/api/address` (POST/GET/PUT), `/api/payment` (POST, GET por id/por agendamento, PUT status).
- Regras de negócio **ausentes**: horários de funcionamento, jornada do barbeiro, disponibilidade, conflito de horário, janela de cancelamento, slug/perfil público, assinatura/planos, limites por plano, e-mails, recuperação de senha, verificação de e-mail, convites.
- Testes: 4 arquivos em `src/__tests__` (27 casos: auth, appointment, barbershop, payment). Rodam em SQLite com `sync`, não com as migrations. `node_modules` não instalado nesta máquina; **não executados nesta revisão**.
- Último commit diz "need fixing table creation for start server" → BE-08 valida o boot com migrations em MySQL limpo.
- **Falhas de autorização críticas** (detalhes em `SECURITY_BACKLOG.md`): escalonamento para admin via `PUT /api/user/:id`, IDOR em agendamentos/pagamentos/usuários, CRUD de barbeiro/serviço sem checagem de tenant.

### Convenções obrigatórias
1. **Camadas:** rota → controller (só HTTP) → service (regra de negócio, autorização de tenant) → repository (Sequelize). Nada de `Model.findByPk` dentro de controller.
2. **Autorização:** todo service que lê/escreve recurso de tenant chama `src/shared/authz.js` (criado em BE-03). Nunca confiar em `user_id`, `owner_id`, `barbershop_id`, `status`, `role` vindos do body quando derivam do token.
3. **Validação:** schemas Joi em `src/modules/<dominio>/<dominio>Schemas.js` + middleware `validate(schema)` (BE-38). Whitelist de campos (`stripUnknown: true`).
4. **Erros:** sempre `AppError(message, status, code)`; resposta `{ message, code, details? }` (BE-37).
5. **Datas:** armazenar em UTC (`DATETIME` UTC); cada Branch tem `timezone` (default `America/Sao_Paulo`). Conversões só em `src/shared/time.js` (BE-12).
6. **Dinheiro:** `DECIMAL(10,2)` no banco, centavos (`integer`) em cálculos e na integração AbacatePay.
7. **Transações:** operações multi-tabela em `sequelize.transaction()`.
8. **Migrations:** toda mudança de schema = nova migration reversível (`up`/`down`). Nunca editar migration já aplicada.
9. **Testes obrigatórios por tarefa:** unitário do service (regras) + integração Supertest da rota (sucesso, validação 400, 401, 403 de outro tenant, 404, 409 quando aplicável).

### Definição de pronto (DoD)
- [ ] Critérios de aceite atendidos.
- [ ] Testes unitários + integração novos verdes; suíte inteira verde (`npm test`).
- [ ] Teste de autorização: usuário de outro tenant recebe 403/404.
- [ ] Migration roda em MySQL limpo (`npm run migrate:reset`).
- [ ] Swagger/OpenAPI da rota atualizado.
- [ ] `[x]` marcado aqui (e no `SEC-xx` correspondente).

---

## Fase P0 — Corrigir base, segurança e infraestrutura de testes

### [x] BE-01 — Usuários: travar escalonamento de privilégio e IDOR; perfil próprio `[SEC-01, SEC-02]`
- **Depende de:** —
- **Arquivos:** `src/modules/user/{userRoutes,userController,userService}.js`, nova migration `add-phone-to-users`.
- **Problema:** `userService.update` faz `{...data}` → qualquer usuário logado envia `{"role":"admin"}` para `PUT /api/user/<seu id>` e vira admin; também altera dados de qualquer outro id. `GET /api/user/:id` expõe qualquer usuário.
- **Fazer:**
  - `PUT /api/user/:id`: só `req.user.id === id` ou admin. Whitelist: `name`, `phone` (e `email` só via BE-29). `role`, `password`, `id`, `created_at` nunca aceitos aqui.
  - `GET /api/user/:id`: só o próprio ou admin.
  - Novo campo `users.phone` (E.164, opcional, índice).
  - Endpoint dedicado admin para trocar role: `PATCH /api/admin/users/:id/role` (admin apenas).
- **Aceite:** teste prova que `role` no body é ignorado/400; usuário A recebe 403 ao editar/ler B; admin consegue.

### [x] BE-02 — Configuração e JWT endurecidos `[SEC-05]`
- **Depende de:** —
- **Arquivos:** `src/config/config.js`, `src/middlewares/authMiddleware.js`, `src/modules/auth/authService.js`, `server.js`, `.env.example`.
- **Fazer:**
  - Módulo `src/config/env.js` valida variáveis no boot (Joi): `JWT_SECRET` (≥ 32 chars), `DB_*`, `NODE_ENV`, `CORS_ORIGINS`, `APP_URL`, `ABACATEPAY_*`, `MAIL_*`. Falha o boot se faltar. Remover fallback `"********"`.
  - `jwt.sign/verify` com `algorithms: ['HS256']`, `issuer`, `audience`; claims mínimos (`sub`, `role`, `tv` = token_version). Expiração do access token 15 min quando BE-30 existir (até lá manter 8 h).
  - `authMiddleware`: aceitar só `Authorization: Bearer <token>` (hoje faz `replace` ingênuo).
  - Coluna `users.token_version` (int, default 0) — incrementar no logout-all/troca de senha; middleware rejeita token com `tv` antigo.
- **Aceite:** app não sobe sem `JWT_SECRET`; token com alg `none`/outro secret → 401; token antigo após troca de senha → 401.

### [x] BE-03 — Camada de autorização por tenant `[SEC-03]`
- **Depende de:** BE-01
- **Arquivos:** novo `src/shared/authz.js`; usar em `barbershop`, `branch`, `barber`, `service`, `address`, `payment`, `appointment`.
- **Fazer:**
  - Funções: `getBarbershopForManager(user, barbershopId)`, `assertCanManageBranch(user, branchId)`, `assertCanManageBarber`, `assertCanManageService`, `assertCanViewAppointment(user, appt)`, `assertCanManageAppointment(user, appt)`. Admin passa sempre. Owner: `barbershops.owner_id = user.id`. Barbeiro: só a própria agenda/filial.
  - Retornar **404** (não 403) para recurso de outro tenant em leitura, para não revelar existência; 403 em escrita quando o recurso é visível publicamente (ex.: serviço).
  - Mover a checagem hoje inline em `barbershopController.update` e `branchService.canManageBarbershop` para o módulo.
  - `barbershopService.update`: whitelist (`name`, + campos de BE-18); **`owner_id` nunca pelo body**. `DELETE /api/barbershop/:id` → soft delete (BE-36) só admin ou owner com confirmação.
- **Aceite:** matriz de testes owner A × recursos do tenant B em todos os módulos → 403/404.

### [x] BE-04 — Agendamento: identidade e status vindos do servidor `[SEC-04]`
- **Depende de:** BE-03
- **Arquivos:** `src/modules/appointment/*`, `src/middlewares/validators/validateAppointmentPayload.js`.
- **Fazer:**
  - `role=cliente`: `user_id = req.user.id` sempre; body com `user_id` diferente → ignorado.
  - `owner`/`barbeiro`: podem criar para cliente (`client_id`) que tenha vínculo com a barbearia ou cliente rápido (BE-23); `branch_id` precisa ser do tenant.
  - `status` removido do payload de criação; nasce `confirmado` (decisão).
  - `GET /api/appointment` escopado: cliente → só os seus (preferir `/me/appointments`); barbeiro → os seus; owner → do tenant (filtro `branch_id` obrigatório validado); admin → todos.
  - `GET/PUT/DELETE /:id` com `assertCanViewAppointment/Manage`. `DELETE` físico removido (cancelamento é transição de status — BE-15).
  - Validar que `service.barbershop_id === branch.barbershop_id`.
- **Aceite:** cliente não cria agendamento em nome de outro; não lê/edita agendamento alheio; serviço de outra barbearia → 400.

### [x] BE-05 — Barbeiros: posse, vínculo com usuário e dados expostos
- **Depende de:** BE-03
- **Arquivos:** `src/modules/barber/*`, migration `barbers` (unique `user_id+branch_id`, `active`, `photo_url`, `display_name`).
- **Fazer:** `create/update/remove` checam tenant da filial; `branch_id` só pode mudar para filial do mesmo tenant; ao criar, promove `role` para `barbeiro` se for `cliente` (nunca rebaixar owner/admin); `remove` = desativar se houver agendamentos futuros (409 `BARBER_HAS_FUTURE_APPOINTMENTS` com opção `?force=cancel` que cancela e notifica). Listagem pública retorna DTO (`id`, `display_name`, `bio`, `photo_url`, `branch_id`, serviços) — **sem e-mail**. Rotas aninhadas `POST /api/branch/:id/barbers` (usado por FE-11; aceita e-mail → se usuário não existe, cria convite BE-22).
- **Aceite:** owner A não cria barbeiro na filial de B; listagem pública não contém `email`.

### [ ] BE-06 — Serviços: posse, dinheiro correto e ativação
- **Depende de:** BE-03
- **Arquivos:** `src/modules/service/*`, migration (`price` → `DECIMAL(10,2)`, `active BOOLEAN default true`, `deleted_at`, índice `barbershop_id`).
- **Fazer:** `barbershop_id` do body validado contra o tenant; `update` não permite trocar `barbershop_id`; validação `duration` ∈ [5, 480] múltiplo de 5, `price` ≥ 0 com 2 casas; listagem pública só `active`; filtro obrigatório por `barbershop_id` na rota pública (hoje lista serviços de todas as barbearias). Soft delete.
- **Aceite:** preço `29.9` persiste e retorna `"29.90"`; owner A não edita serviço de B.

### [ ] BE-07 — Pagamento presencial (PIX/dinheiro/cartão na maquininha) na agenda `[SEC-06]`
- **Depende de:** BE-03, BE-12
- **Arquivos:** `src/modules/payment/*`, migration (`method` + `CARD`, `recorded_by`, `branch_id` desnormalizado, índice).
- **Escopo:** é o registro do **pagamento do cliente final à barbearia** (não confundir com a assinatura SaaS — BE-31+).
- **Fazer:** `POST /api/payment` só staff do tenant (owner/barbeiro da filial); `amount` default = `price_snapshot` do agendamento; marcar `PAID` direto (registro presencial) ou `PENDING`; `PUT /:id/status` com tenant check; `GET /api/payment?branch_id&from&to&status&method` paginado (FE-16) com totais; cliente vê o pagamento do próprio agendamento.
- **Aceite:** barbeiro de outra barbearia recebe 403; cliente não cria pagamento; totais batem com a soma.

### [x] BE-08 — Higiene do código, migrations confiáveis e dependências
- **Depende de:** —
- **Fazer:**
  - Remover código morto listado no "Estado atual" (confirmar com `grep -rn "require(" src`).
  - Remover deps não usadas (`mysql`, `body-parser`); `nodemon` → devDependencies; adicionar `sequelize-cli` em devDependencies (scripts já o usam).
  - Garantir boot em MySQL 8 limpo: `docker compose up` → migrations → `verifySchema` ok. Atualizar `docker-compose.yml` para `mysql:8.0`.
  - Índices: `appointments(barber_id, start_at)`, `appointments(branch_id, start_at)`, `appointments(user_id)`, `barbers(branch_id)`, `branches(barbershop_id)`, `services(barbershop_id)`, `payments(appointment_id unique)`.
  - ESLint 9 (flat) + Prettier; script `lint`.
  - `README.md`: corrigir porta (3000 vs 3001 do `.env.example`), remover "Production Ready".
- **Aceite:** `npm run lint` e `npm run migrate:reset` passam em MySQL 8; nenhum arquivo morto.

### [x] BE-09 — Infraestrutura de testes e CI
- **Depende de:** BE-08
- **Fazer:**
  - Testes de integração rodando **sobre as migrations** (umzug) e não `sync`; job opcional com MySQL real via service container no CI (SQLite não pega erros de ENUM/DECIMAL/locks).
  - `src/__tests__/helpers/`: `factories.js` (user, owner+barbershop+branch, barber, service, appointment), `auth.js` (`tokenFor(user)`), `request.js`.
  - Estrutura: `src/__tests__/unit/<modulo>/*.test.js` e `src/__tests__/integration/<modulo>/*.test.js`.
  - Cobertura mínima 80% em `src/modules/**/*Service.js` (`coverageThreshold`).
  - GitHub Actions: `npm ci && npm run lint && npm test -- --coverage` em PR e push na `main`.
  - Teste de matriz de autorização gerado a partir de uma tabela `endpoint × role × tenant` (`src/__tests__/integration/authz.matrix.test.js`).
- **Aceite:** CI verde; quebrar uma regra de autorização faz o teste de matriz falhar.

---

## Fase P1 — Dono configura a operação

### [ ] BE-10 — Horário de funcionamento e fechamentos da filial
- **Depende de:** BE-03, BE-12 (timezone)
- **Fazer:** tabelas `branch_opening_hours (branch_id, weekday 0-6, opens_at TIME, closes_at TIME)` (múltiplos intervalos/dia) e `branch_closures (branch_id, date, reason, all_day, start/end opcional)`. `GET/PUT /api/branch/:id/opening-hours` (PUT substitui a semana em transação; valida sobreposição e `opens<closes`). CRUD `/api/branch/:id/closures`. Coluna `branches.timezone`, `branches.phone`, `branches.whatsapp`, `branches.active`.
- **Aceite:** intervalos sobrepostos → 400; leitura pública do horário funciona sem login.

### [ ] BE-11 — Jornada e bloqueios do barbeiro
- **Depende de:** BE-05, BE-10
- **Fazer:** `barber_working_hours (barber_id, weekday, start, end)` (default = horário da filial se vazio) e `barber_time_off (barber_id, start_at, end_at, reason)`. Owner gerencia de todos do tenant; barbeiro gerencia os próprios bloqueios. Criar bloqueio sobre agendamento existente → 409 com lista de conflitos.
- **Aceite:** jornada fora do horário da filial → 400; barbeiro não edita jornada de colega.

### [ ] BE-12 — Modelo de agendamento v2 (intervalo, snapshots, status completos)
- **Depende de:** BE-04
- **Fazer:** migration: `start_at`, `end_at` (UTC; migrar `appointment_date` → `start_at`, `end_at = start + service.duration`), `duration_min`, `price_snapshot DECIMAL`, `service_name_snapshot`, `notes` (≤ 500), `status ENUM(confirmado, concluido, cancelado, nao_compareceu)` (migrar `pendente`→`confirmado`), `cancelled_at`, `cancelled_by`, `cancel_reason`, `source ENUM(web, mobile, balcao)`, `updated_at`. Utilitário `src/shared/time.js` (dayjs + plugins utc/timezone — lib usual) para converter horário local da filial ↔ UTC.
- **Aceite:** migration reversível; agendamentos antigos preservados; respostas incluem `start_at`, `end_at` ISO UTC.

### [ ] BE-13 — Motor de disponibilidade
- **Depende de:** BE-10, BE-11, BE-12, BE-19
- **Fazer:** `GET /api/availability?branch_id&service_id&date=YYYY-MM-DD[&barber_id]` público → `[{ start_at, end_at, barber_ids[] }]`. Regras: horário da filial ∩ jornada do barbeiro − fechamentos − bloqueios − agendamentos `confirmado` (cancelados liberam) − passado; antecedência mínima 30 min; horizonte 30 dias; grade de 15 min; barbeiro precisa executar o serviço (BE-19); "sem preferência" = união. Função pura `computeSlots(input)` em `availabilityService.js` (testável sem banco).
- **Testes:** unitários de `computeSlots` cobrindo: dia fechado, feriado, almoço, serviço de 45 min no fim do expediente, troca de horário de verão inexistente no Brasil mas timezone diferente (ex.: `America/Manaus`), slot no passado.
- **Aceite:** slots nunca se sobrepõem a agendamentos/bloqueios; resposta < 300 ms para 1 filial/10 barbeiros.

### [ ] BE-14 — Criação de agendamento à prova de concorrência
- **Depende de:** BE-13
- **Fazer:** `POST /api/appointment` dentro de transação: `SELECT ... FOR UPDATE` na linha do barbeiro, revalida o slot com o mesmo `computeSlots`, checa sobreposição (`start_at < :end AND end_at > :start AND status='confirmado'`), cria. Conflito → `409 SLOT_TAKEN`. Header `Idempotency-Key` opcional (tabela `idempotency_keys`, TTL 24 h) para evitar duplo clique/retry do mobile. Limite anti-abuso: cliente com no máximo 3 agendamentos futuros por barbearia (`409 TOO_MANY_ACTIVE_APPOINTMENTS`) `[SEC-21]`. "Sem preferência" escolhe o barbeiro livre com menos agendamentos no dia.
- **Testes:** integração com MySQL disparando 10 requisições simultâneas no mesmo slot → exatamente 1 sucesso.
- **Aceite:** teste de concorrência verde no CI (job MySQL).

### [ ] BE-15 — Ciclo de vida: cancelar, reagendar, concluir, falta
- **Depende de:** BE-14
- **Fazer:** `POST /api/appointment/:id/cancel {reason}`, `POST /:id/reschedule {start_at, barber_id?}`, `POST /:id/complete`, `POST /:id/no-show`. Máquina de estados em `appointmentStateMachine.js`:
  - cliente: cancel/reschedule só se `now <= start_at - 24h` → senão `409 CANCELLATION_WINDOW_CLOSED`;
  - staff: cancel/reschedule a qualquer momento antes de concluir; complete/no-show só após `start_at`;
  - estados finais (`concluido`, `cancelado`, `nao_compareceu`) imutáveis.
  - Toda resposta de agendamento inclui `can_cancel_until` e `allowed_actions[]` (o front só exibe o que vier aqui).
  - Tabela `appointment_events` (histórico: quem, quando, de→para) — base de BE-36.
- **Aceite:** testes unitários da máquina de estados para cada papel × estado; 23h59 antes → 409 para cliente.

### [ ] BE-16 — Notificações por e-mail e fila de jobs
- **Depende de:** BE-15
- **Fazer:**
  - `src/shared/mailer.js` (nodemailer já instalado; SMTP de provedor transacional — Resend/SES/Brevo via env). Templates pt-BR em `src/templates/email/*.html` (confirmação, cancelamento, reagendamento, lembrete, boas-vindas, convite, reset, verificação, cobrança).
  - Fila simples persistida: tabela `jobs (type, payload JSON, run_at, attempts, status, last_error)` + worker `src/jobs/worker.js` com `node-cron` a cada minuto, `SELECT ... FOR UPDATE SKIP LOCKED` (MySQL 8) para ser seguro com mais de uma instância. Retry exponencial (máx. 5).
  - Lembretes: 24 h e 2 h antes (agendados na criação; removidos/reagendados no cancel/reschedule).
  - Anexo `.ics` na confirmação.
- **Aceite:** com `MAIL_DRIVER=log` os e-mails são logados em teste; cancelar remove os lembretes pendentes.

### [ ] BE-17 — Endereço v2
- **Depende de:** BE-03
- **Fazer:** migration em `addresses`: `street`, `neighborhood`, `latitude DECIMAL(9,6)`, `longitude DECIMAL(9,6)`; validar CEP `^\d{5}-?\d{3}$`, UF da lista de 27. `GET /api/address/:id` só staff do tenant (público vê endereço embutido na filial). Geocodificação opcional (Nominatim) via job.
- **Aceite:** CEP inválido → 400; dono de B não lê endereço de A pelo id.

### [ ] BE-18 — Perfil público da barbearia (slug) `[SEC-06]`
- **Depende de:** BE-03
- **Fazer:** colunas `slug` (unique, `[a-z0-9-]{3,60}`, gerado do nome, palavras reservadas bloqueadas: `admin`, `api`, `login`...), `description`, `phone`, `whatsapp`, `instagram`, `logo_url`, `cover_url`, `status ENUM(active, suspended, deleted)`. `GET /api/barbershop/slug/:slug` público com DTO: barbearia + filiais ativas (endereço, horários, "aberta agora" calculado no fuso) + serviços ativos + barbeiros ativos. **Não retornar `owner` nem e-mails** (hoje `GET /api/barbershop` público inclui `owner.email`). Barbearia sem assinatura ativa (BE-35) → 404 público.
- **Aceite:** listagem/detalhe público não contém e-mail; slug duplicado → 409 `SLUG_TAKEN`.

### [ ] BE-19 — Serviços executados por barbeiro
- **Depende de:** BE-05, BE-06
- **Fazer:** tabela `barber_services (barber_id, service_id)` unique; `PUT /api/barber/:id/services {service_ids[]}` (mesmo tenant). Default ao criar barbeiro: todos os serviços ativos. `GET /api/barber?branch_id&service_id` filtra.
- **Aceite:** serviço de outra barbearia → 400.

### [ ] BE-20 — Endpoints `/api/me/*`
- **Depende de:** BE-04
- **Fazer:** `GET /api/me` (perfil + papéis + `barbershops[]` que gerencia + `barber_profiles[]`), `GET /api/me/barbershops`, `GET /api/me/appointments?scope=upcoming|past&page`, `PATCH /api/me` (mesma whitelist do BE-01). Manter `/api/auth/me` como alias.
- **Aceite:** cada usuário só vê os próprios dados; paginação limitada (BE-38).

### [ ] BE-21 — Cadastro do dono (`register-owner`) com trial
- **Depende de:** BE-02, BE-18, BE-31
- **Fazer:** `POST /api/auth/register-owner {name, email, password, phone, barbershop:{name}, plan_code?}` em transação: cria `user(role=owner)`, `barbershop(slug)`, `subscription(status=trialing, trial_ends_at=+14d)` (BE-31), devolve token. Filial é criada no passo seguinte do wizard (`POST /api/branch`). Envia e-mail de boas-vindas + verificação (BE-27). `POST /api/auth/register` continua criando só `cliente`.
- **Aceite:** falha em qualquer etapa não deixa usuário órfão; e-mail duplicado → 409.

### [ ] BE-22 — Convite de barbeiro
- **Depende de:** BE-05, BE-16
- **Fazer:** tabela `invitations (barbershop_id, branch_id, email, role='barbeiro', token_hash, expires_at 7d, accepted_at, invited_by)`. `POST /api/branch/:id/invitations` (owner), `GET /api/invitations/:token` (público: nome da barbearia/filial), `POST /api/invitations/:token/accept` (logado com mesmo e-mail, ou cria conta com nome+senha). Token aleatório 32 bytes, guardado como SHA-256 `[SEC-26]`. Reenviar/revogar. Respeita limite de barbeiros do plano (BE-35).
- **Aceite:** token usado/expirado → 410; e-mail diferente do convite → 403.

### [ ] BE-23 — Clientes da barbearia [DECISÃO PENDENTE: cliente rápido sem conta]
- **Depende de:** BE-12
- **Recomendação:** permitir "cliente rápido" para agendamento de balcão: tabela `barbershop_clients (barbershop_id, user_id NULL, name, phone, email NULL, notes)`; quando a pessoa criar conta com o mesmo telefone/e-mail, vincular. `appointments.client_id` → `barbershop_clients.id` (manter `user_id` para quem tem conta).
- **Fazer:** `GET /api/barbershop/:id/clients?search&page` (nome, telefone, visitas, última visita, total gasto, faltas), `GET /clients/:clientId` (histórico), `POST /clients` (rápido). Escopo de tenant estrito: cliente de A nunca aparece para B.
- **Aceite:** busca por telefone parcial funciona; dados de outro tenant inacessíveis.

### [ ] BE-24 — Métricas: dashboard, financeiro e barbeiro
- **Depende de:** BE-07, BE-15
- **Fazer:** `GET /api/dashboard/summary?barbershop_id&branch_id?&from&to` → receita (pagamentos `PAID`), nº agendamentos por status, ticket médio, taxa de ocupação (minutos agendados / minutos disponíveis), top serviços, receita por dia, receita por filial e por barbeiro. `GET /api/dashboard/barber?from&to` (barbeiro logado). Consultas agregadas no repository com índices de BE-08. Respeitar fuso da filial no agrupamento por dia.
- **Aceite:** testes com fixture conhecida conferem cada número.

### [ ] BE-25 — Busca pública de filiais
- **Depende de:** BE-17, BE-18
- **Fazer:** `GET /api/search/branches?q&city&service&lat&lng&page` → filiais ativas de barbearias com assinatura ativa; `q` busca nome da barbearia/filial/serviço; ordenação por distância quando lat/lng (Haversine em SQL). Escapar `%`/`_` no LIKE `[SEC-09]`.
- **Aceite:** barbearia suspensa não aparece; `pageSize` máximo 50.

---

## Fase P2 — Autenticação completa e monetização (AbacatePay)

### [ ] BE-26 — Recuperação de senha `[SEC-26]`
- **Depende de:** BE-16
- **Fazer:** `POST /api/auth/forgot-password {email}` → sempre 202 com mensagem neutra; token 32 bytes (hash SHA-256 no banco, expira 1 h, uso único) em `password_reset_tokens`; `POST /api/auth/reset-password {token, password}` → troca senha, incrementa `token_version` (derruba sessões), invalida outros tokens. Rate limit por e-mail e IP.
- **Aceite:** token reutilizado → 410; resposta idêntica para e-mail existente ou não.

### [ ] BE-27 — Verificação de e-mail
- **Depende de:** BE-16
- **Fazer:** `users.email_verified_at`; `POST /api/auth/verify-email {token}`, `POST /api/auth/resend-verification` (rate limit). Owner não verificado pode usar o trial, mas não publica a página (`status` público) até verificar [DECISÃO PENDENTE — recomendação].
- **Aceite:** token expirado → 410 com opção de reenviar.

### [ ] BE-28 — Login com Google
- **Depende de:** BE-02
- **Fazer:** `POST /api/auth/google {id_token, intent: 'login'|'signup-owner'|'signup-client'}`; validar com `google-auth-library` (`audience = GOOGLE_CLIENT_ID`, `email_verified=true`); vincular por e-mail (tabela `user_identities (user_id, provider, provider_user_id)`). Usuário só-Google tem `password` nulo (migration `password NULL`).
- **Aceite:** token de outro `aud` → 401.

### [ ] BE-29 — Trocar senha e e-mail
- **Depende de:** BE-01, BE-27
- **Fazer:** `POST /api/me/password {current_password, new_password}` (incrementa `token_version`); `POST /api/me/email {new_email, password}` → envia verificação ao novo e-mail e aviso ao antigo; troca só após confirmação. Política de senha (BE-38): ≥ 8 caracteres, não pode ser igual ao e-mail.
- **Aceite:** senha atual errada → 400 `INVALID_CURRENT_PASSWORD`; sessões antigas caem.

### [ ] BE-30 — Refresh token, logout e sessões `[SEC-15]`
- **Depende de:** BE-02
- **Fazer:** access token 15 min + refresh token opaco (32 bytes, hash no banco, `refresh_tokens (user_id, token_hash, expires_at 30d, revoked_at, replaced_by, user_agent, ip)`), **rotação** a cada uso e detecção de reuso (reuso → revoga a família). Web: refresh em cookie `httpOnly; Secure; SameSite=Strict; Path=/api/auth`; mobile: no corpo, guardado em secure storage. `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/logout-all`. Se cookie, proteção CSRF (checar `Origin` + header custom `X-Requested-With`).
- **Aceite:** refresh reutilizado revoga todos; logout invalida o refresh.

### [ ] BE-31 — Planos e assinaturas (modelo de domínio)
- **Depende de:** BE-03
- **Planos (decididos 2026-11-07; limites = [DECISÃO PENDENTE], recomendação abaixo):**

  | code | Nome sugerido | Preço/mês | Filiais | Barbeiros (total) | Recursos |
  |---|---|---|---|---|---|
  | `essencial` | Essencial | R$ 99 | 1 | 3 | Agenda, página pública, agendamento online, lembretes por e-mail, pagamentos presenciais |
  | `profissional` | Profissional | R$ 199 | 3 | 10 | + financeiro e relatórios, clientes/CRM, exportação CSV |
  | `rede` | Rede | R$ 399 | ilimitadas (fair use 15) | ilimitados | + dashboard consolidado da rede, gerentes por filial (BE-47), suporte prioritário |

  Trial: 14 dias, sem cartão, com todos os recursos do `profissional` [DECISÃO PENDENTE — recomendação].
- **Fazer:** tabelas `plans (code, name, price_cents, interval='MONTHLY', limits JSON, features JSON, abacatepay_product_id, active)` (seed via migration), `subscriptions (barbershop_id unique, plan_code, status ENUM(trialing, pending, active, past_due, canceled, expired), trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, abacatepay_customer_id, abacatepay_subscription_id, abacatepay_checkout_id)`, `subscription_events` (histórico). `GET /api/plans` público. `GET /api/barbershop/:id/subscription` (owner). Serviço `entitlements.js`: `can(barbershop, 'branches.create')`, `limit(barbershop, 'barbers')`.
- **Aceite:** preços servidos pela API (o front não tem preço fixo); testes de `entitlements` por plano.

### [ ] BE-32 — Integração AbacatePay: cliente e checkout de assinatura
- **Depende de:** BE-31
- **Referência:** API v2 (`https://api.abacatepay.com/v2`, `Authorization: Bearer <ABACATEPAY_API_KEY>`). Endpoints relevantes: `POST /v2/customers/create`, `POST /v2/products/create` (com `cycle: MONTHLY`), `POST /v2/subscriptions/create` (gera checkout `bill_...`), `GET /v2/subscriptions/get?externalId=`, `POST /v2/subscriptions/cancel`, `POST /v2/subscriptions/change-plan` (vale a partir do próximo ciclo), `POST /v2/customer-portal/create`. Métodos: cartão; PIX recorrente exige **Pix Automático** habilitado na conta. **Confirmar payloads na doc oficial antes de implementar** (docs.abacatepay.com, seletor v2) — a API mudou bastante em 2026.
- **Fazer:**
  - `src/integrations/abacatepay/client.js` (axios, timeout 10 s, retry só em GET/5xx, logs sem dados sensíveis, `devMode` por env).
  - Script `npm run billing:sync-products` cria/atualiza os 3 produtos e grava `abacatepay_product_id`.
  - `POST /api/billing/checkout {plan_code}` (owner): cria/reusa customer (CNPJ/CPF obrigatório — coletar no checkout; validar dígitos), cria subscription checkout com `externalId = barbershop_id`, `metadata.barbershop_id`, `returnUrl`/`completionUrl` = `APP_URL/dashboard/assinatura?status=...`; salva `abacatepay_checkout_id`, status `pending`; retorna `checkout_url`.
  - `POST /api/billing/change-plan {plan_code}` → `change-plan` na AbacatePay; downgrade bloqueado se uso atual excede o limite do plano novo (`409 PLAN_LIMIT_EXCEEDED` com detalhes).
  - `POST /api/billing/cancel` → `cancel_at_period_end` [DECISÃO PENDENTE: AbacatePay cancela imediatamente; recomendação: marcar no nosso banco e chamar a API só no fim do período via job].
  - `POST /api/billing/portal` → link do customer portal.
  - **Nunca** ativar assinatura pelo retorno do navegador; só webhook (BE-33).
- **Testes:** cliente HTTP mockado com `nock`; contrato dos payloads em fixtures.
- **Aceite:** fluxo completo em `devMode` documentado em `docs/billing.md`.

### [ ] BE-33 — Webhooks AbacatePay e máquina de estados da assinatura `[SEC-13]`
- **Depende de:** BE-32
- **Fazer:**
  - `POST /api/webhooks/abacatepay` com `express.raw()` nessa rota (precisa do corpo cru para HMAC). Validar: secret na URL (`?webhookSecret=` comparado com `crypto.timingSafeEqual`) **e** assinatura HMAC do header (formato `t=TIMESTAMP,v1=SIGNATURE`; rejeitar timestamp > 5 min) — confirmar nome do header e algoritmo na doc v2.
  - Idempotência: tabela `webhook_events (provider, event_id unique, type, payload, processed_at)`; mesmo `id` reentregue (a AbacatePay retenta até 7× em ~18 h com o mesmo id) → 200 sem reprocessar.
  - Eventos → transições: `subscription.completed` → `active` (define período); `subscription.renewed` → estende `current_period_end`, status `active`; `subscription.payment_failed` → `past_due` (+ e-mail ao owner com motivo); `subscription.cancelled` → `canceled`; `subscription.plan_changed` → atualiza `plan_code`; `checkout.completed` → vincula `abacatepay_subscription_id`. Evento desconhecido → 200 + log.
  - Conferir `externalId/metadata.barbershop_id` e valor contra o plano esperado; divergência → alerta e não ativa.
  - Responder 200 rápido; processamento pesado via job (BE-16). Nunca retornar `410` (desativa o webhook na AbacatePay).
  - Job diário de reconciliação: `GET /v2/subscriptions/get` para assinaturas `pending/past_due` (cobre webhook perdido).
- **Aceite:** testes com payloads reais de exemplo assinados; replay e assinatura inválida → 401 sem efeito.

### [ ] BE-34 — Upload de imagens (logo, capa, foto do barbeiro) `[SEC-22]`
- **Depende de:** BE-18
- **Recomendação:** Cloudflare R2 (front já está na Cloudflare; API compatível com S3 via `@aws-sdk/client-s3`) com URL pré-assinada.
- **Fazer:** `POST /api/uploads/presign {kind: logo|cover|barber_photo, content_type, size}` → valida tipo (`image/jpeg|png|webp`, **sem SVG**), tamanho (≤ 2 MB), tenant; chave `tenants/<barbershop_id>/<kind>/<uuid>.<ext>`; `POST /api/uploads/confirm` verifica o objeto (HEAD + magic bytes) antes de gravar a URL.
- **Aceite:** upload de SVG/HTML recusado; chave nunca derivada do nome do arquivo do usuário.

### [ ] BE-35 — Aplicação de limites do plano e bloqueio por inadimplência
- **Depende de:** BE-31, BE-33
- **Fazer:** middleware `requireEntitlement('branches.create')` etc. em criação de filial/barbeiro/convite; `402 PLAN_LIMIT_REACHED` com `{limit, used, upgrade_to}`. Regras de status: `trialing/active` → tudo; `past_due` → 7 dias de carência com banner (campo `billing_banner` em `/api/me`); após carência ou `expired/canceled` → painel em modo leitura, agendamento público desligado (página pública 404/“indisponível”), **dados preservados** 90 dias. Job diário: trials vencidos → `expired` + e-mails D-3, D-1, D0.
- **Aceite:** testes de cada transição; agendamentos existentes não são apagados.

### [ ] BE-36 — Auditoria e soft delete
- **Depende de:** BE-15
- **Fazer:** `paranoid: true` (`deleted_at`) em barbershops, branches, barbers, services, users. Tabela `audit_logs (actor_id, barbershop_id, action, entity, entity_id, before JSON, after JSON, ip, created_at)` gravada no service em ações sensíveis (troca de role, exclusões, preço, assinatura, pagamentos). `GET /api/audit-logs?barbershop_id` (owner/admin).
- **Aceite:** excluir serviço não quebra histórico de agendamentos.

### [x] BE-37 — Padrão de erros com `code`
- **Depende de:** BE-08
- **Fazer:** `AppError(message, status, code, details)`; catálogo em `src/shared/errorCodes.js` (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `SLOT_TAKEN`, `CANCELLATION_WINDOW_CLOSED`, `PLAN_LIMIT_REACHED`, `SLUG_TAKEN`, `EMAIL_IN_USE`, ...). Mapear `SequelizeUniqueConstraintError` → 409, `ForeignKeyConstraintError` → 409, `ValidationError` → 400. Em produção, 500 responde `{"message":"Erro interno","code":"INTERNAL","request_id"}` — **nunca** `err.message` de erro não tratado `[SEC-11]`.
- **Aceite:** teste garante que erro de SQL não vaza mensagem.

### [x] BE-38 — Validação de entrada centralizada `[SEC-09]`
- **Depende de:** BE-08
- **Fazer:** Joi + `validate({body, query, params})` com `stripUnknown`, `abortEarly:false`; ids inteiros positivos; `pageSize` máx. 100 (hoje ilimitado → DoS por `pageSize=1000000`); strings com tamanho máximo; `express.json({ limit: '100kb' })`; e-mail normalizado (`trim().toLowerCase()`) no cadastro/login. Substituir os validators manuais de `middlewares/validators/*`.
- **Aceite:** `pageSize=100000` → 100 itens no máximo; campos extras ignorados.

### [ ] BE-39 — Seed de desenvolvimento e E2E
- **Depende de:** BE-12
- **Fazer:** `src/seeders/` + `npm run seed`: admin, 2 owners (planos diferentes), 3 filiais, 6 barbeiros, serviços, jornada, 50 agendamentos em estados variados, clientes. Idempotente. Usado pelos E2E do front (FE-32) e mobile.
- **Aceite:** `npm run migrate:reset && npm run seed` em MySQL limpo; nunca roda com `NODE_ENV=production`.

### [ ] BE-40 — LGPD: exportar e excluir conta `[SEC-20]`
- **Depende de:** BE-36
- **Fazer:** `GET /api/me/export` (JSON com dados pessoais e agendamentos), `DELETE /api/me` (anonimiza: nome "Usuário removido", e-mail `deleted+<id>@invalid`, telefone nulo; mantém agendamentos para o financeiro da barbearia). Owner com assinatura ativa precisa cancelar antes. Registrar aceite de termos/privacidade (`users.terms_accepted_at`, `terms_version`) no cadastro.
- **Aceite:** após exclusão não é possível logar e os dados pessoais não aparecem em nenhuma listagem.

### [ ] BE-41 — API administrativa da plataforma
- **Depende de:** BE-31, BE-36
- **Fazer:** `/api/admin/*` (role `admin`): listar/buscar barbearias com status de assinatura, suspender/reativar, estender trial, listar usuários, métricas (MRR, ativos, churn, trials). Criação de admin só via script CLI (`npm run create-admin`), nunca via API pública `[SEC-27]`.
- **Aceite:** owner recebe 403 em todo `/api/admin/*`.

### [ ] BE-42 — Observabilidade e saúde
- **Depende de:** BE-08
- **Fazer:** middleware `request_id` (header `X-Request-Id`, gera UUID se ausente; incluído em logs e respostas de erro); logs JSON em produção; `GET /health` (liveness) e `GET /ready` (checa DB); Sentry opcional (`SENTRY_DSN`) com scrubbing de `Authorization`/`password`/`token`; `app.set('trust proxy', 1)` quando atrás de proxy (Render/Cloudflare) `[SEC-07]`.
- **Aceite:** todo log de requisição tem `request_id`.

### [ ] BE-43 — Contrato OpenAPI versionado
- **Depende de:** BE-37
- **Fazer:** completar anotações Swagger dos módulos; `npm run openapi:export` gera `docs/openapi.json` (commitado, consumido pelo `openapi-typescript` do front e do mobile); teste que falha se a rota existe sem documentação. Remover `docs/API_ENDPOINTS_SUMMARY.json`, `API_README.md`, `SWAGGER_DOCUMENTATION.md` e a collection Postman desatualizados (ou gerar a collection do OpenAPI).
- **Aceite:** `docs/openapi.json` reflete 100% das rotas.

---

## Fase P3 — Produção e expansão

### [ ] BE-44 — Deploy de produção e operação
- **Depende de:** BE-42
- **Fazer:** Dockerfile multi-stage (`node:22-alpine`, `npm ci --omit=dev`, usuário não-root, `HEALTHCHECK`); migrations como passo de release separado (não no boot de cada instância — ou com lock); ambientes `staging` e `production` com bancos separados; usuário MySQL de aplicação sem `DROP/GRANT` `[SEC-25]`; backup diário com retenção 30 dias + teste de restore documentado; SSL do banco com CA (`rejectUnauthorized: true`) `[SEC-12]`; `docs/runbook.md` (deploy, rollback, rotação de segredos, incidente de webhook).
- **Aceite:** deploy em staging reproduzível a partir do README.

### [ ] BE-45 — Push notifications (app mobile)
- **Depende de:** BE-16 (consumido por MOB-11)
- **Fazer:** tabela `push_tokens (user_id, expo_token, platform, last_seen)`; `POST/DELETE /api/me/push-tokens`; canal `push` no worker de notificações (Expo Push API) para confirmação, lembrete, cancelamento e "novo agendamento" para o barbeiro. Remover tokens inválidos ao receber `DeviceNotRegistered`.
- **Aceite:** lembrete 2 h chega por push e e-mail; token inválido é removido.

### [ ] BE-46 — Lembretes por WhatsApp [FUTURO / DECISÃO PENDENTE]
- **Depende de:** BE-16
- **Recomendação:** WhatsApp Cloud API oficial (Meta) com templates aprovados; recurso dos planos `profissional`/`rede`; opt-in do cliente registrado.

### [ ] BE-47 — Papel de gerente de filial [DECISÃO PENDENTE]
- **Depende de:** BE-03
- **Recomendação:** tabela `barbershop_members (barbershop_id, user_id, role ENUM(owner, manager), branch_ids JSON NULL)` em vez de novo valor no ENUM global de `users.role`; `authz.js` passa a consultar membership. Necessário para o plano `rede` (dono com várias filiais delega a gestão).
- **Aceite:** gerente da filial X não vê financeiro da filial Y.

### [ ] BE-48 — Versionamento e paginação consistentes
- **Depende de:** BE-43
- **Fazer:** prefixo `/api/v1` (manter `/api` como alias por 1 release); resposta paginada padrão `{items, page, pageSize, total, totalPages}` em todos os list; `ETag`/`Cache-Control` nas rotas públicas (`/slug/:slug`, `/availability` 30 s). `GET /api/app-config` público (`min_app_version`, flags) para MOB-18.

---

## Sequência recomendada (sprints)
1. **A — Fechar buracos (P0):** BE-01 → BE-04, BE-08, BE-09, BE-37, BE-38 (+ FE-01…FE-07). Nada vai para usuário real antes disso.
2. **B — Dono configura:** BE-05, BE-06, BE-10, BE-11, BE-12, BE-17, BE-18, BE-19, BE-20, BE-31, BE-21, BE-22.
3. **C — Agendar ponta a ponta:** BE-13, BE-14, BE-15, BE-16, BE-25.
4. **D — Operação e cobrança:** BE-07, BE-23, BE-24, BE-32, BE-33, BE-35 → **lançamento pago possível aqui**.
5. **E — Completar:** BE-26 → BE-30, BE-34, BE-36, BE-39 → BE-44.
6. **F — Expansão:** BE-45 → BE-48.

### Critério de "pronto para lançar" (go-live)
- [ ] Todos os itens `SEC-xx` marcados como **Crítico/Alto** fechados.
- [ ] Sprints A–D concluídas e suíte verde no CI com job MySQL.
- [ ] Fluxo real em staging: owner cadastra → trial → configura filial/serviço/barbeiro → cliente agenda → e-mail chega → owner assina plano no AbacatePay (devMode) → webhook ativa → renovação simulada → falha simulada bloqueia após carência.
- [ ] Backup + restore testados; termos de uso e política de privacidade publicados.
