// BE-26 / SEC-26: recuperação de senha.
//   forgot: resposta sempre igual (não revela se a conta existe); e-mail enviado fora do caminho da
//           resposta para o tempo não denunciar a existência da conta.
//   reset:  token de uso único (1 h), nova senha pela política, token_version+1 derruba as sessões,
//           os demais links pendentes deixam de valer.
const bcrypt = require('bcryptjs');
const { User, sequelize } = require('../../models');
const { PURPOSES } = require('../../models/userToken');
const accountTokens = require('./accountTokenService');
const templates = require('../../shared/emailTemplates');
const mailer = require('../../shared/mailer');
const { assertStrongPassword } = require('../../shared/passwordPolicy');
const config = require('../../config/config');
const logger = require('../../utils/logger');

const TTL_MS = 60 * 60 * 1000;
const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
const NEUTRAL_MESSAGE = 'Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.';
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

const sendResetEmail = async (user, token) => {
  const resetUrl = `${appUrl()}/recuperar-senha?token=${encodeURIComponent(token)}`;
  const { subject, html, text } = templates.render('password-reset', {
    app_url: appUrl(),
    first_name: String(user.name).split(' ')[0],
    reset_url: resetUrl,
    ttl_minutes: TTL_MS / 60000,
  });
  // Envio direto (não pela fila): o token não pode ser gravado no banco em texto.
  await mailer.send({ to: user.email, subject, html, text });
};

/** POST /api/auth/forgot-password. `onSent` só para testes aguardarem o envio. */
const forgotPassword = async (rawEmail, { now = new Date(), onSent } = {}) => {
  const email = String(rawEmail || '').trim().toLowerCase();
  const user = email ? await User.findOne({ where: { email }, attributes: ['id', 'name', 'email'] }) : null;
  if (user) {
    const token = await accountTokens.issue(user.id, PURPOSES.PASSWORD_RESET, { ttlMs: TTL_MS, now });
    const sending = sendResetEmail(user, token).catch((error) => {
      logger.warn('[auth] falha ao enviar e-mail de redefinição', { user_id: user.id, message: error.message });
    });
    if (onSent) await sending;
  }
  return { message: NEUTRAL_MESSAGE };
};

/** POST /api/auth/reset-password. */
const resetPassword = async ({ token, password }, { now = new Date() } = {}) =>
  sequelize.transaction(async (transaction) => {
    const row = await accountTokens.consume(token, PURPOSES.PASSWORD_RESET, { now, transaction });
    const user = await User.findByPk(row.user_id, { transaction });
    if (!user) throw accountTokens.gone();
    assertStrongPassword(password, { email: user.email, name: user.name });
    await user.update(
      { password: await bcrypt.hash(password, BCRYPT_ROUNDS), token_version: Number(user.token_version || 0) + 1 },
      { transaction }
    );
    await accountTokens.revokeAll(user.id, [PURPOSES.PASSWORD_RESET], { now, transaction });
    return { message: 'Senha redefinida. Entre com a nova senha.' };
  });

module.exports = { forgotPassword, resetPassword, NEUTRAL_MESSAGE, TTL_MS };
