// BE-35: efeitos da assinatura fora do painel — página pública, aviso de cobrança no /api/me,
// recursos por plano e o ciclo diário de trials (avisos D-3, D-1 e expiração no D0).
const { Op } = require('sequelize');
const { Subscription, SubscriptionEvent, Barbershop, User } = require('../../models');
const entitlements = require('../../shared/entitlements');
const queue = require('../../jobs/queue');
const subscriptionService = require('./subscriptionService');
const { AppError, CODES } = require('../../utils/errorHandler');

const DAY_MS = 86400000;
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const daysLeft = (until, now) => Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / DAY_MS));

/** 402 FEATURE_NOT_IN_PLAN quando o plano efetivo não inclui o recurso. */
const assertFeature = async (barbershopId, feature) => {
  const subscription = await Subscription.findOne({ where: { barbershop_id: barbershopId } });
  if (!subscription) return;
  if (!entitlements.can(subscription, feature)) {
    throw new AppError('Recurso não incluído no seu plano', 402, CODES.FEATURE_NOT_IN_PLAN, {
      feature,
      upgrade_to: upgradeForFeature(feature),
    });
  }
};

/** Menor plano que inclui o recurso. */
const upgradeForFeature = (feature) => {
  const { PLANS } = require('../../shared/plans');
  const plan = [...PLANS].sort((a, b) => a.price_cents - b.price_cents).find((item) => item.features.includes(feature));
  return plan ? plan.code : null;
};

const hasFeature = async (barbershopId, feature) => {
  const subscription = await Subscription.findOne({ where: { barbershop_id: barbershopId } });
  return !subscription || entitlements.can(subscription, feature);
};

/** Agendamento público: só barbearia com acesso (trial válido, ativa, ou em carência). */
const assertBookable = async (barbershopId) => {
  const subscription = await Subscription.findOne({ where: { barbershop_id: barbershopId } });
  if (subscription && entitlements.accessLevel(subscription) === 'read_only') {
    throw new AppError('Esta barbearia não está recebendo agendamentos no momento', 404, CODES.BARBERSHOP_UNAVAILABLE);
  }
};

/**
 * Aviso de cobrança de uma barbearia (para o painel do dono). null quando não há o que avisar.
 * type: trial_ending (≤ 3 dias), past_due (carência), read_only (bloqueada), cancel_scheduled.
 */
const bannerFor = (subscription, now = new Date()) => {
  if (!subscription) return null;
  const access = entitlements.accessLevel(subscription, now);
  const base = { barbershop_id: subscription.barbershop_id, status: subscription.status, access };
  if (access === 'read_only') {
    return { ...base, type: 'read_only', severity: 'error', message: 'Assinatura inativa: o painel está em modo leitura e o agendamento online está desligado.' };
  }
  if (access === 'grace') {
    const ends = entitlements.graceEndsAt(subscription);
    const left = ends ? daysLeft(ends, now) : entitlements.GRACE_DAYS;
    return { ...base, type: 'past_due', severity: 'warning', days_left: left, message: `Não conseguimos cobrar sua assinatura. Atualize o pagamento em até ${left} dia(s) para não perder o acesso.` };
  }
  if (subscription.status === 'trialing' && subscription.trial_ends_at) {
    const left = daysLeft(subscription.trial_ends_at, now);
    if (left <= 3) {
      return { ...base, type: 'trial_ending', severity: 'info', days_left: left, message: `Seu período de teste termina em ${left} dia(s). Assine para continuar usando.` };
    }
  }
  if (subscription.cancel_at_period_end && subscription.current_period_end) {
    return { ...base, type: 'cancel_scheduled', severity: 'info', days_left: daysLeft(subscription.current_period_end, now), message: 'Sua assinatura será encerrada no fim do período atual.' };
  }
  return null;
};

/** Extensão do GET /api/me: billing_banner (primeiro aviso mais grave) e avisos por barbearia. */
const meExtension = async (user, profile) => {
  const ids = (profile.barbershops || []).map((shop) => shop.id);
  if (!ids.length) return { billing_banner: null, billing_banners: [] };
  const subscriptions = await Subscription.findAll({ where: { barbershop_id: { [Op.in]: ids } } });
  const banners = subscriptions.map((sub) => bannerFor(sub)).filter(Boolean);
  const rank = { error: 0, warning: 1, info: 2 };
  banners.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { billing_banner: banners[0] || null, billing_banners: banners };
};

// ---------------------------------------------------------------------------------------------
// Ciclo diário de trials
// ---------------------------------------------------------------------------------------------

// Do mais próximo para o mais distante: quem já está a 1 dia recebe só o aviso de D-1.
const REMINDERS = [
  { key: 'trial.reminder.d1', days: 1, title: 'Seu teste do BarberOS termina amanhã' },
  { key: 'trial.reminder.d3', days: 3, title: 'Seu teste do BarberOS termina em 3 dias' },
];

const emailOwner = async (subscription, { title, message }) => {
  const shop = await Barbershop.findByPk(subscription.barbershop_id, { include: [{ model: User, as: 'owner', attributes: ['name', 'email'] }] });
  if (!shop || !shop.owner) return;
  await queue.enqueue('email.send', {
    template: 'billing',
    to: shop.owner.email,
    data: { title, message, first_name: shop.owner.name.split(' ')[0], barbershop_name: shop.name, billing_url: `${appUrl()}/dashboard/assinatura` },
  });
};

const alreadySent = (subscription, key) => SubscriptionEvent.count({ where: { subscription_id: subscription.id, type: key } });

/** Avisos D-3/D-1 (uma vez cada) e expiração dos trials vencidos (D0, com e-mail). */
const runTrialCycle = async (now = new Date()) => {
  const stats = { reminders: 0, expired: 0 };
  const trials = await Subscription.findAll({ where: { status: 'trialing', trial_ends_at: { [Op.ne]: null } } });
  for (const subscription of trials) {
    const ends = new Date(subscription.trial_ends_at);
    if (ends <= now) {
      await subscription.update({ status: 'expired' });
      await subscriptionService.recordEvent(subscription, 'trial.expired', { from: 'trialing', to: 'expired' });
      await emailOwner(subscription, {
        title: 'Seu período de teste terminou',
        message: 'O teste gratuito do BarberOS terminou. Seus dados estão guardados: assine um plano para voltar a editar o painel e receber agendamentos.',
      });
      stats.expired += 1;
      continue;
    }
    const left = (ends.getTime() - now.getTime()) / DAY_MS;
    // Só o aviso mais próximo que se aplica (D-1 dispensa o D-3 atrasado), uma vez.
    const reminder = REMINDERS.find((item) => left <= item.days);
    if (reminder && !(await alreadySent(subscription, reminder.key))) {
      await subscriptionService.recordEvent(subscription, reminder.key);
      await emailOwner(subscription, {
        title: reminder.title,
        message: 'Assine um plano para continuar usando o BarberOS sem interrupção. Seus dados e agendamentos são mantidos.',
      });
      stats.reminders += 1;
    }
  }
  return stats;
};

let registered = false;
const register = () => {
  if (registered) return;
  registered = true;
  require('../barbershop/barbershopPublicService').setVisibilityCheck(async (barbershop) => {
    const subscription = await Subscription.findOne({ where: { barbershop_id: barbershop.id } });
    // BE-27: dono com e-mail não confirmado usa o trial, mas a página não é publicada.
    return entitlements.isPubliclyVisible(subscription) && (await require('../auth/emailVerificationService').ownerVerified(barbershop));
  });
  require('../me/meService').addProfileExtension(meExtension);
  require('../billing/billingWebhookService').onDaily(runTrialCycle);
};

module.exports = { register, assertFeature, hasFeature, assertBookable, bannerFor, meExtension, runTrialCycle, upgradeForFeature };
