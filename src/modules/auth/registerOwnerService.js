// BE-21: cadastro do dono. Em uma transação: usuário owner + barbearia (slug) + assinatura em trial.
// Falha em qualquer etapa não deixa usuário/barbearia órfãos. A filial vem no passo seguinte do wizard.
const bcrypt = require('bcryptjs');
const { sequelize, User, Barbershop } = require('../../models');
const config = require('../../config/config');
const { signAccessToken } = require('../../shared/tokens');
const { sanitizeUser } = require('../../shared/sanitizeUser');
const { assertStrongPassword } = require('../../shared/passwordPolicy');
const { normalizePhone } = require('../../shared/phone');
const { isValidSlug } = require('../../shared/slug');
const mailer = require('../../shared/mailer');
const templates = require('../../shared/emailTemplates');
const { TRIAL_DAYS } = require('../../shared/plans');
const { pickFields } = require('../../shared/pickFields');
const subscriptionService = require('../subscription/subscriptionService');
const logger = require('../../utils/logger');
const { ConflictError, ValidationError, CODES } = require('../../utils/errorHandler');

const BCRYPT_ROUNDS = config.isTest ? 4 : 12;

// Gancho para BE-27 (verificação de e-mail): enviado depois do commit.
const afterRegisterHooks = [];
const onOwnerRegistered = (fn) => afterRegisterHooks.push(fn);

const sendWelcome = (user, barbershop) =>
  mailer.send({
    to: user.email,
    ...templates.render('welcome', {
      first_name: user.name.split(' ')[0],
      barbershop_name: barbershop.name,
      trial_days: TRIAL_DAYS,
      dashboard_url: `${process.env.APP_URL || 'http://localhost:5173'}/dashboard`,
    }),
  });

const registerOwner = async (input) => {
  // Campos fora da lista (role, owner_id...) → 400 em vez de ignorados.
  const data = pickFields(input, ['name', 'email', 'password', 'phone', 'barbershop', 'plan_code', 'terms_version']);
  pickFields(data.barbershop, ['name', 'slug']);
  const email = String(data.email).trim().toLowerCase();
  const name = String(data.name).trim();
  assertStrongPassword(data.password, { email, name });
  const phone = normalizePhone(data.phone);
  const shopName = String(data.barbershop.name).trim();
  if (data.barbershop.slug && !isValidSlug(data.barbershop.slug)) {
    throw new ValidationError('Slug inválido', undefined, CODES.INVALID_SLUG);
  }

  if (await User.findOne({ where: { email }, attributes: ['id'] })) {
    throw new ConflictError('E-mail já está em uso', CODES.EMAIL_IN_USE);
  }
  if (data.barbershop.slug && (await Barbershop.count({ where: { slug: data.barbershop.slug } }))) {
    throw new ConflictError('Este endereço já está em uso por outra barbearia', CODES.SLUG_TAKEN);
  }

  const password = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  return createOwnerAccount({ name, email, password, phone, shopName, slug: data.barbershop.slug, planCode: data.plan_code, termsVersion: data.terms_version });
};

/**
 * Cria dono + barbearia + trial numa transação e dispara os e-mails pós-cadastro.
 * `password` nulo = conta só-Google (BE-28); `emailVerifiedAt` vem do Google quando aplicável.
 */
const createOwnerAccount = async ({ name, email, password, phone, shopName, slug, planCode, emailVerifiedAt = null, identity, termsVersion }) => {
  const data = { barbershop: { slug }, plan_code: planCode };
  const { user, barbershop, subscription } = await sequelize.transaction(async (transaction) => {
    const createdUser = await User.create(
      {
        name,
        email,
        password,
        phone,
        role: 'owner',
        email_verified_at: emailVerifiedAt,
        ...(termsVersion ? { terms_version: String(termsVersion), terms_accepted_at: new Date() } : {}),
      },
      { transaction }
    );
    if (identity) await identity(createdUser, transaction);
    const createdShop = await Barbershop.create(
      { name: shopName, owner_id: createdUser.id, ...(data.barbershop.slug ? { slug: data.barbershop.slug } : {}) },
      { transaction }
    );
    const createdSub = await subscriptionService.startTrial(createdShop.id, { planCode: data.plan_code, transaction });
    return { user: createdUser, barbershop: createdShop, subscription: createdSub };
  });

  // E-mails depois do commit e sem derrubar o cadastro se o provedor falhar.
  for (const task of [() => sendWelcome(user, barbershop), ...afterRegisterHooks.map((hook) => () => hook(user))]) {
    try {
      await task();
    } catch (error) {
      logger.warn('Falha ao enviar e-mail pós-cadastro', { user_id: user.id, message: error.message });
    }
  }

  return {
    token: signAccessToken(user),
    user: sanitizeUser(user),
    barbershop: { id: barbershop.id, name: barbershop.name, slug: barbershop.slug },
    subscription: {
      plan_code: subscription.plan_code,
      status: subscription.status,
      trial_ends_at: subscription.trial_ends_at,
    },
  };
};

module.exports = { registerOwner, createOwnerAccount, onOwnerRegistered };
