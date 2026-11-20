// BE-29: trocar senha e e-mail da própria conta.
//   senha: confere a atual (conta só-Google pode definir a primeira sem ela), aplica a política,
//          token_version+1 derruba as outras sessões e devolve um token novo para esta; aviso por e-mail.
//   e-mail: confere a senha, manda link ao NOVO e-mail e aviso ao antigo; a troca só acontece quando o
//          link é confirmado (token de uso único com o novo e-mail no payload).
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../../models');
const { PURPOSES } = require('../../models/userToken');
const accountTokens = require('../auth/accountTokenService');
const templates = require('../../shared/emailTemplates');
const mailer = require('../../shared/mailer');
const { assertStrongPassword } = require('../../shared/passwordPolicy');
const { signAccessToken } = require('../../shared/tokens');
const { sanitizeUser } = require('../../shared/sanitizeUser');
const config = require('../../config/config');
const logger = require('../../utils/logger');
const { ValidationError, ConflictError, NotFoundError, CODES } = require('../../utils/errorHandler');

const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const firstName = (user) => String(user.name).split(' ')[0];

const notify = async (to, user, title, message) => {
  try {
    const mail = templates.render('account-notice', { app_url: appUrl(), first_name: firstName(user), title, message });
    await mailer.send({ to, ...mail });
  } catch (error) {
    logger.warn('[me] falha ao enviar aviso de segurança', { user_id: user.id, message: error.message });
  }
};

const loadUser = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('Usuário não encontrado');
  return user;
};

const assertCurrentPassword = async (user, currentPassword) => {
  if (!user.password) return;
  const ok = currentPassword && (await bcrypt.compare(String(currentPassword), user.password));
  if (!ok) throw new ValidationError('Senha atual incorreta', undefined, CODES.INVALID_CURRENT_PASSWORD);
};

/** POST /api/me/password */
const changePassword = async (userId, { current_password: currentPassword, new_password: newPassword }) => {
  const user = await loadUser(userId);
  await assertCurrentPassword(user, currentPassword);
  assertStrongPassword(newPassword, { email: user.email, name: user.name });
  if (user.password && (await bcrypt.compare(String(newPassword), user.password))) {
    throw new ValidationError('A nova senha deve ser diferente da atual', undefined, CODES.WEAK_PASSWORD);
  }
  await user.update({
    password: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
    token_version: Number(user.token_version || 0) + 1,
  });
  await accountTokens.revokeAll(user.id, [PURPOSES.PASSWORD_RESET]);
  await notify(user.email, user, 'Sua senha foi alterada', 'A senha da sua conta BarberOS foi alterada agora. Todas as outras sessões foram encerradas.');
  return { message: 'Senha alterada', token: signAccessToken(user) };
};

/** POST /api/me/email — pede a troca; nada muda até a confirmação. */
const requestEmailChange = async (userId, { new_email: rawEmail, password }) => {
  const user = await loadUser(userId);
  if (!user.password) {
    throw new ValidationError('Defina uma senha antes de trocar o e-mail (conta criada com Google)', undefined, CODES.PASSWORD_REQUIRED);
  }
  await assertCurrentPassword(user, password);
  const newEmail = String(rawEmail).trim().toLowerCase();
  if (newEmail === user.email) throw new ValidationError('O novo e-mail é igual ao atual');
  if (await User.count({ where: { email: newEmail } })) throw new ConflictError('E-mail já está em uso', CODES.EMAIL_IN_USE);

  const token = await accountTokens.issue(user.id, PURPOSES.EMAIL_CHANGE, { ttlMs: EMAIL_CHANGE_TTL_MS, payload: { new_email: newEmail } });
  const confirmUrl = `${appUrl()}/confirmar-email?token=${encodeURIComponent(token)}`;
  const mail = templates.render('email-change', { app_url: appUrl(), first_name: firstName(user), confirm_url: confirmUrl, ttl_hours: 24 });
  await mailer.send({ to: newEmail, ...mail });
  await notify(
    user.email,
    user,
    'Pedido de troca de e-mail',
    `Pediram para trocar o e-mail da sua conta BarberOS para ${newEmail}. A troca só acontece depois da confirmação no novo endereço.`
  );
  return { message: `Enviamos um link de confirmação para ${newEmail}` };
};

/** POST /api/auth/confirm-email-change — o token prova o acesso ao novo e-mail. */
const confirmEmailChange = async (token) => {
  const { user, previous } = await sequelize.transaction(async (transaction) => {
    const row = await accountTokens.consume(token, PURPOSES.EMAIL_CHANGE, { transaction });
    const target = await User.findByPk(row.user_id, { transaction });
    if (!target) throw accountTokens.gone();
    const newEmail = row.payload && row.payload.new_email;
    if (!newEmail) throw accountTokens.gone();
    if (await User.count({ where: { email: newEmail }, transaction })) throw new ConflictError('E-mail já está em uso', CODES.EMAIL_IN_USE);
    const old = target.email;
    await target.update(
      { email: newEmail, email_verified_at: new Date(), token_version: Number(target.token_version || 0) + 1 },
      { transaction }
    );
    await accountTokens.revokeAll(target.id, [PURPOSES.EMAIL_CHANGE, PURPOSES.PASSWORD_RESET, PURPOSES.EMAIL_VERIFICATION], { transaction });
    return { user: target, previous: old };
  });
  await notify(previous, user, 'O e-mail da sua conta foi alterado', `O e-mail da sua conta BarberOS agora é ${user.email}.`);
  return { message: 'E-mail alterado. Entre novamente.', user: sanitizeUser(user) };
};

module.exports = { changePassword, requestEmailChange, confirmEmailChange };
