// SEC-20 (LGPD): retenção. Roda no ciclo diário da cobrança (billingWebhookService.onDaily).
// - Barbearia encerrada (assinatura cancelada/expirada ou barbearia excluída) há mais de RETENTION_DAYS:
//   fichas de clientes perdem nome/telefone/e-mail/observações, agendamentos perdem observações e o CPF/CNPJ
//   de cobrança é apagado. Valores e contagens ficam (obrigação fiscal/contábil), sem identificar pessoas.
// - Limpeza: refresh tokens e tokens de uso único vencidos há mais de 30 dias; notificações lidas há 180 dias;
//   registros do banner de cookies (BE-58) com mais de 5 anos (prazo prescricional do CDC, art. 27).
const { Op } = require('sequelize');
const { sequelize, Barbershop, BarbershopClient, Appointment, Subscription, RefreshToken, UserToken, UserNotification, CookieConsent } = require('../../models');
const logger = require('../../utils/logger');

const DAY = 24 * 60 * 60 * 1000;
const retentionDays = () => Number(process.env.RETENTION_DAYS) > 0 ? Number(process.env.RETENTION_DAYS) : 90;
const ENDED = ['canceled', 'expired'];
const CONSENT_RETENTION_DAYS = 5 * 365;

/** Fim efetivo de uma assinatura encerrada (o último marco de tempo conhecido). */
const endedAt = (subscription) =>
  new Date(Math.max(...[subscription.current_period_end, subscription.trial_ends_at, subscription.cancel_requested_at, subscription.updated_at].filter(Boolean).map((d) => new Date(d).getTime()), 0));

/** Barbearias cujo período de retenção acabou e ainda não foram anonimizadas. */
const dueBarbershops = async (now) => {
  const limit = new Date(now.getTime() - retentionDays() * DAY);
  const ids = new Set();
  const ended = await Subscription.findAll({ where: { status: { [Op.in]: ENDED } } });
  for (const subscription of ended) if (endedAt(subscription) < limit) ids.add(subscription.barbershop_id);
  const deleted = await Barbershop.findAll({ where: { deleted_at: { [Op.lt]: limit } }, paranoid: false, attributes: ['id'] });
  for (const shop of deleted) ids.add(shop.id);
  if (!ids.size) return [];
  const pending = await Barbershop.findAll({ where: { id: { [Op.in]: [...ids] }, anonymized_at: null }, paranoid: false, attributes: ['id'] });
  return pending.map((shop) => shop.id);
};

const anonymizeBarbershop = async (barbershopId, now) =>
  sequelize.transaction(async (transaction) => {
    const [clients] = await BarbershopClient.update(
      { name: 'Cliente removido', phone: null, email: null, notes: null, user_id: null, blocked_reason: null },
      { where: { barbershop_id: barbershopId }, transaction }
    );
    const { Branch } = require('../../models');
    const branchIds = (await Branch.findAll({ where: { barbershop_id: barbershopId }, attributes: ['id'], paranoid: false, transaction })).map((b) => b.id);
    if (branchIds.length) await Appointment.update({ notes: null }, { where: { branch_id: { [Op.in]: branchIds } }, transaction });
    await Subscription.update({ billing_tax_id: null }, { where: { barbershop_id: barbershopId }, transaction });
    await Barbershop.update({ anonymized_at: now }, { where: { id: barbershopId }, paranoid: false, transaction });
    return clients;
  });

const purgeExpired = async (now) => {
  const tokenLimit = new Date(now.getTime() - 30 * DAY);
  const refresh = await RefreshToken.destroy({ where: { expires_at: { [Op.lt]: tokenLimit } } });
  const single = await UserToken.destroy({ where: { expires_at: { [Op.lt]: tokenLimit } } });
  const notifications = await UserNotification.destroy({ where: { read_at: { [Op.lt]: new Date(now.getTime() - 180 * DAY) } } });
  const consents = await CookieConsent.destroy({ where: { created_at: { [Op.lt]: new Date(now.getTime() - CONSENT_RETENTION_DAYS * DAY) } } });
  return { refresh, single, notifications, consents };
};

const runRetention = async (now = new Date()) => {
  const barbershops = await dueBarbershops(now);
  let clients = 0;
  for (const id of barbershops) clients += await anonymizeBarbershop(id, now);
  const purged = await purgeExpired(now);
  if (barbershops.length || purged.refresh || purged.single || purged.notifications || purged.consents) {
    logger.info('[lgpd] retenção aplicada', { barbershops: barbershops.length, clients, ...purged });
  }
  return { barbershops, clients, ...purged };
};

let registered = false;
const register = () => {
  if (registered) return;
  registered = true;
  require('../billing/billingWebhookService').onDaily(runRetention);
};

module.exports = { runRetention, register, endedAt };
