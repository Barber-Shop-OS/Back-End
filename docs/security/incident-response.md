# Resposta a incidentes de segurança (SEC-28)

> Plano curto para uma equipe pequena. Complementa o `docs/runbook.md` (deploy, backup, rotação de segredos).
> Campos entre `<>` devem ser preenchidos antes do lançamento.

## 1. Papéis e contatos
| Papel | Quem | Contato |
|---|---|---|
| Responsável pelo incidente (decide e comunica) | `<nome>` | `<telefone/e-mail>` |
| Encarregado de dados (LGPD) | `<nome>` | `VITE_SUPPORT_EMAIL` do front (e-mail exibido no rodapé e na política de privacidade) |
| Hospedagem da API (Railway) / banco (Supabase) | suporte das plataformas | painéis das contas |
| Cobrança (AbacatePay) | suporte AbacatePay | painel AbacatePay |

## 2. Como os incidentes aparecem
Sem Sentry (decisão de 20/11): tudo sai nos logs JSON da API. Configure na plataforma de logs um alerta
(e-mail/WhatsApp) para as buscas abaixo:

| Busca no log | Significa | Limite padrão (env) |
|---|---|---|
| `[security] ALERTA: pico de 401` | força bruta / tokens roubados sendo testados | 60/min (`SECURITY_ALERT_401_PER_MIN`) |
| `[security] ALERTA: pico de 403` | varredura de acesso a dados de outra barbearia | 40/min (`SECURITY_ALERT_403_PER_MIN`) |
| `[security] ALERTA: pico de 429` | abuso/robô batendo nos limites | 60/min (`SECURITY_ALERT_429_PER_MIN`) |
| `[security] ALERTA: pico de erros 5xx` | falha da aplicação ou do banco | 10/min (`SECURITY_ALERT_5XX_PER_MIN`) |
| `[security] ALERTA: falhas de assinatura no webhook` | webhook forjado ou segredo trocado | 3/min (`SECURITY_ALERT_WEBHOOK_PER_MIN`) |
| `[billing] ALERTA` | divergência de valor/produto na cobrança | — |
| `REFRESH_REUSED` | refresh token copiado (sessão derrubada automaticamente) | — |

Cada alerta traz `last_url` e `last_ip` do último evento da janela; use o `request_id` para achar a requisição.

## 3. Primeiros 30 minutos
1. **Confirmar** (é ataque ou bug?): ler os logs ao redor do alerta, `GET /api/admin/audit` (ações administrativas).
2. **Conter** conforme o caso:
   - IP abusivo → bloquear no Cloudflare/Railway (regra de firewall).
   - Conta comprometida → `npm run revoke-sessions -- --user=<id> --yes` e forçar troca de senha (fluxo de recuperação).
   - Suspeita de token/segredo vazado → **revogar tudo** (seção 4) e rotacionar o segredo (runbook, "Rotação de segredos").
   - Webhook forjado → conferir `webhook_events`; nenhuma assinatura muda sem webhook válido (SEC-13). Trocar o
     segredo do webhook se houve vazamento.
3. **Registrar** em `docs/security/incidents/AAAA-MM-DD-<titulo>.md`: linha do tempo, dados afetados, ações.

## 4. Derrubar sessões em massa
```bash
npm run revoke-sessions -- --all --yes            # todos os usuários
npm run revoke-sessions -- --role=admin --yes     # só um papel (admin | owner | barbeiro | cliente)
npm run revoke-sessions -- --user=12,34 --yes     # usuários específicos
```
Incrementa `token_version` (access tokens param na hora) e revoga todos os refresh tokens. Se o `JWT_SECRET`
vazou, **também** troque o segredo (o script não impede quem tem o segredo de assinar tokens novos).
Se a `TOTP_ENCRYPTION_KEY` vazou, troque-a e peça aos usuários com 2FA que desativem/ativem de novo.

## 5. Comunicação (LGPD)
- Houve acesso indevido a dados pessoais com risco ou dano relevante → comunicar a **ANPD** e os **titulares
  afetados** em até **3 dias úteis** do conhecimento (Resolução CD/ANPD nº 15/2024), pelo formulário da ANPD.
- Conteúdo mínimo: natureza dos dados, titulares afetados, medidas tomadas, riscos, contato do encarregado.
- Barbearias (controladoras dos dados dos seus clientes) devem ser avisadas primeiro quando os dados forem dos
  clientes delas.
- Sem dado pessoal exposto (ex.: só indisponibilidade): aviso no status/e-mail aos donos, sem ANPD.

## 6. Depois do incidente
- Causa raiz + correção com teste que reproduz o problema.
- Revisar limites dos alertas (falsos positivos/negativos).
- Atualizar este documento.
