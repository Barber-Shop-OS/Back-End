# LGPD — registro das operações de tratamento (SEC-20)

> Rascunho técnico para revisão jurídica (decisão de 20/11). Mantém o que o sistema faz hoje; atualizar a cada
> nova integração ou dado coletado.

## 1. Papéis
- **BarberOS** é **controlador** dos dados das contas (donos, equipe, clientes com conta) e **operador** dos dados
  que cada barbearia registra sobre os próprios clientes (ficha, histórico, observações).
- **Barbearia** é **controladora** dos dados dos clientes dela.
- Encarregado (DPO): e-mail em `VITE_SUPPORT_EMAIL` (rodapé do site e política de privacidade).

## 2. Dados, finalidade e base legal
| Dado | Quem | Finalidade | Base legal (art. 7º) |
|---|---|---|---|
| Nome, e-mail, telefone, senha (hash) | todos com conta | conta e login | execução de contrato (V) |
| Segredo 2FA (cifrado) e códigos de recuperação (hash) | quem ativa 2FA | segurança da conta | execução de contrato (V) / legítimo interesse (IX) |
| Agendamentos, serviços, preços, observações | clientes e barbearias | prestar o serviço agendado | execução de contrato (V) |
| Ficha do cliente na barbearia (nome, telefone, e-mail, observações, bloqueio) | barbearias | atendimento e gestão do salão | legítimo interesse da barbearia (IX) |
| CPF/CNPJ e dados de cobrança | dono | assinatura do plano (AbacatePay) | execução de contrato (V) e obrigação legal (II) |
| IP, user agent, sessões, logs | todos | segurança e prevenção a fraude | legítimo interesse (IX) |
| Aceite dos termos (`terms_version`, data) | todos | prova do consentimento/aceite | obrigação legal (II) |

Não há e-mails de marketing. Se forem criados, só com **opt-in** explícito e descadastro em um clique.

## 3. Minimização e acesso
- Barbeiro vê só os clientes dos próprios atendimentos (e um cliente específico quando digita o telefone
  completo para agendar); o histórico mostra só os atendimentos dele.
- Recepção vê clientes e agenda da filial, sem financeiro.
- Isolamento por barbearia em todas as consultas (matriz `authz.matrix.test.js`).
- Logs sem corpo de requisição; tokens, senhas e CPF/CNPJ mascarados.

## 4. Retenção (job diário `src/modules/me/retentionService.js`)
| Dado | Prazo | Depois |
|---|---|---|
| Barbearia com assinatura cancelada/expirada ou excluída | 90 dias (`RETENTION_DAYS`) | fichas de clientes e observações anonimizadas; CPF/CNPJ de cobrança apagado; valores ficam (fiscal) |
| Conta excluída pelo titular | imediato | dados pessoais removidos/anonimizados (`POST /api/me/delete`) |
| Refresh tokens e links de uso único vencidos | 30 dias | apagados |
| Notificações lidas | 180 dias | apagadas |
| Logs da aplicação | 90 dias na plataforma de logs | descartados (arquivos locais limitados a 5 × 10 MB) |
| Backups do banco | conforme o plano do Supabase | sobrescritos |

## 5. Direitos do titular
- Acesso/portabilidade: `GET /api/me/export` (botão "Exportar meus dados" em Conta › Privacidade).
- Exclusão: `POST /api/me/delete` (Conta › Privacidade). Dono precisa cancelar a assinatura antes.
- Correção: edição do perfil (Conta › Dados pessoais).
- Cliente sem conta (só ficha na barbearia): pedido ao encarregado; a barbearia (controladora) é avisada.

## 6. Operadores (suboperadores)
| Operador | Uso | Dados | Local |
|---|---|---|---|
| Supabase | banco de dados (PostgreSQL) | todos os dados do sistema | conforme a região do projeto |
| Railway | hospedagem da API e logs | trânsito de todos os dados; logs | EUA (padrão) |
| Cloudflare | site (Workers/assets), bucket de imagens (R2), DNS | IP, imagens enviadas | global |
| Resend | envio de e-mails transacionais | nome, e-mail, dados do agendamento | EUA |
| AbacatePay | cobrança da assinatura | nome, e-mail, CPF/CNPJ, telefone do dono | Brasil |
| Google | login com Google (opcional) | e-mail, nome, ID da conta Google | EUA |

Transferência internacional (art. 33): contratar com cláusulas-padrão/DPA de cada provedor antes do lançamento.

## 7. Incidentes
Ver `docs/security/incident-response.md` (comunicação à ANPD e aos titulares em até 3 dias úteis).
