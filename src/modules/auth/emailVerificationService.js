// BE-27: verificação de e-mail.
//   - Cadastro (cliente/dono) envia o link (48 h, uso único). Convite aceito já prova o e-mail.
//   - Dono não verificado usa o trial normalmente, mas a página pública, a busca e o agendamento
//     online ficam desligados até verificar (decisão aprovada em 2026-11-14).
//   - Clientes de balcão só são vinculados à conta depois da verificação (BE-23).
const { User, Barbershop } = require('../../models');
const { PURPOSES } = require('../../models/userToken');
const accountTokens = require('./accountTokenService');
const templates = require('../../shared/emailTemplates');
const mailer = require('../../shared/mailer');
const logger = require('../../utils/logger');
const { NotFoundError } = require('../../utils/errorHandler');

const TTL_MS = 48 * 60 * 60 * 1000;
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

const isVerified = (user) => Boolean(user && user.email_verified_at);

/** Emite o token e envia o e-mail (envio direto: o token não vai para a fila/banco). */
const sendVerification = async (user, { now = new Date() } = {}) => {
  const token = await accountTokens.issue(user.id, PURPOSES.EMAIL_VERIFICATION, { ttlMs: TTL_MS, now });
  const { subject, html, text } = templates.render('email-verification', {
    app_url: appUrl(),
    first_name: String(user.name).split(' ')[0],
    verify_url: `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`,
    ttl_hours: TTL_MS / 3600000,
  });
  await mailer.send({ to: user.email, subject, html, text });
};

/** Após o cadastro: nunca derruba o cadastro se o e-mail falhar. */
const afterSignup = async (user) => {
  if (isVerified(user)) return;
  try {
    await sendVerification(user);
  } catch (error) {
    logger.warn('[auth] falha ao enviar verificação de e-mail', { user_id: user.id, message: error.message });
  }
};

/** POST /api/auth/verify-email. Expirado/usado → 410 (o front oferece reenviar). */
const verify = async (token, { now = new Date() } = {}) => {
  const row = await accountTokens.consume(token, PURPOSES.EMAIL_VERIFICATION, { now });
  const user = await User.findByPk(row.user_id);
  if (!user) throw accountTokens.gone();
  if (!user.email_verified_at) await user.update({ email_verified_at: now });
  // BE-23: agora que o e-mail é comprovado, clientes de balcão com o mesmo e-mail viram desta conta.
  await require('../client/clientService').linkAccount(user);
  return { message: 'E-mail confirmado', email_verified_at: user.email_verified_at };
};

/** POST /api/auth/resend-verification (logado). */
const resend = async (userId) => {
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'email_verified_at'] });
  if (!user) throw new NotFoundError('Usuário não encontrado');
  if (isVerified(user)) return { already_verified: true, message: 'E-mail já confirmado' };
  await sendVerification(user);
  return { already_verified: false, message: 'Enviamos um novo link de confirmação' };
};

/** Dono da barbearia confirmou o e-mail? (página pública/agendamento online dependem disso). */
const ownerVerified = async (barbershop) => {
  const shop = barbershop.owner_id ? barbershop : await Barbershop.findByPk(barbershop.id, { attributes: ['id', 'owner_id'] });
  if (!shop) return false;
  const owner = await User.findByPk(shop.owner_id, { attributes: ['id', 'email_verified_at'] });
  return isVerified(owner);
};

let registered = false;
/** Liga o envio da verificação ao cadastro do dono (o de cliente chama afterSignup direto). */
const register = () => {
  if (registered) return;
  registered = true;
  require('./registerOwnerService').onOwnerRegistered(afterSignup);
};

module.exports = { register, sendVerification, afterSignup, verify, resend, ownerVerified, isVerified, TTL_MS };
