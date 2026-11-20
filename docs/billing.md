# Cobrança da assinatura (AbacatePay v2)

Assinatura SaaS da barbearia (planos Essencial R$ 99, Profissional R$ 199, Rede R$ 399). Não confundir
com o pagamento presencial do cliente final (`/api/payment`, BE-07).

## Configuração
1. Crie uma chave de API no painel da AbacatePay. Use uma chave de **modo teste** (`abc_dev_...`) em
   desenvolvimento/staging. Permissões: `CUSTOMER:CREATE`, `PRODUCT:CREATE`, `PRODUCT:READ`,
   `SUBSCRIPTION:CREATE`, `SUBSCRIPTION:READ`, `SUBSCRIPTION:DELETE`.
2. `.env`: `ABACATEPAY_API_KEY`, `ABACATEPAY_METHODS=CARD` (ou `CARD,PIX` com Pix Automático),
   `APP_URL` (URL do front; usada no retorno do checkout).
3. `npm run billing:sync-products` — cria um produto mensal por plano (`externalId = barberos-plan-<code>`)
   e grava `plans.abacatepay_product_id`. Idempotente.
4. Webhook (BE-33): painel → Integração → Webhooks → **Webhook v2**, endpoint
   `https://<api>/api/webhooks/abacatepay?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>` com os eventos
   `subscription.completed`, `subscription.trial_started`, `subscription.renewed`,
   `subscription.payment_failed`, `subscription.plan_changed`, `subscription.cancelled`, `checkout.completed`.

## Fluxo (modo teste)
1. Dono cadastra a barbearia → trial de 14 dias (`trialing`, recursos do Profissional).
2. `POST /api/billing/checkout {barbershop_id, plan_code, tax_id}` → `checkout_url`. O trial continua
   até o pagamento ser confirmado.
3. Dono paga na página da AbacatePay (no modo teste, use o simulador de pagamento do painel).
4. A AbacatePay chama o webhook `subscription.completed` → assinatura `active`, `plan_code` definido,
   período de 1 mês. **Só o webhook ativa** — o retorno do navegador (`completionUrl`) apenas mostra
   "processando".
5. Renovação mensal: `subscription.renewed` estende `current_period_end`.
6. Falha de cobrança: `subscription.payment_failed` → `past_due` (+ e-mail ao dono). Carência e bloqueio no BE-35.
7. Troca de plano: `POST /api/billing/change-plan` agenda para o próximo ciclo (`pending_plan_code`);
   downgrade bloqueado se o uso excede o plano novo.
8. Cancelamento: `POST /api/billing/cancel` marca `cancel_at_period_end`; o job diário chama
   `POST /v2/subscriptions/cancel` no fim do período (a AbacatePay cancela imediatamente).
   `POST /api/billing/resume` desfaz antes disso.
9. `POST /api/billing/portal` → link do portal do cliente (trocar cartão, recibos).

## Erros
| HTTP | code | Quando |
|---|---|---|
| 400 | `INVALID_TAX_ID` | CPF/CNPJ com dígito verificador errado |
| 409 | `SUBSCRIPTION_ALREADY_ACTIVE` | checkout com assinatura paga ativa (use change-plan) |
| 409 | `PLAN_LIMIT_EXCEEDED` | uso atual (filiais/barbeiros) maior que o plano escolhido |
| 409 | `NO_ACTIVE_SUBSCRIPTION` / `SAME_PLAN` | troca/cancelamento sem assinatura válida |
| 502 | `PAYMENT_PROVIDER_ERROR` | AbacatePay recusou ou falhou (detalhe só no log) |
| 503 | `BILLING_UNAVAILABLE` | `ABACATEPAY_API_KEY` ausente ou plano sem produto sincronizado |
