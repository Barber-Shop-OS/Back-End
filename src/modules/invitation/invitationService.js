// BE-22: convite de barbeiro.
// - Dono convida um e-mail para uma filial; link válido por 7 dias, uso único.
// - Aceite: logado com o mesmo e-mail, ou cria a conta (nome + senha) com o e-mail do convite.
// - Respeita o limite de barbeiros do plano (402 PLAN_LIMIT_REACHED).
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { sequelize, Invitation, Branch, Barbershop, User } = require('../../models');
const { assertCanManageBranch } = require('../../shared/authz');
const { generateToken, hashToken } = require('../../shared/oneTimeToken');
const { assertStrongPassword } = require('../../shared/passwordPolicy');
const { signAccessToken } = require('../../shared/tokens');
const { sanitizeUser } = require('../../shared/sanitizeUser');
const mailer = require('../../shared/mailer');
const subscriptionService = require('../subscription/subscriptionService');
const config = require('../../config/config');
const { AppError, ForbiddenError, NotFoundError, ConflictError, UnauthorizedError, CODES } = require('../../utils/errorHandler');

const TTL_DAYS = 7;
const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
const appUrl = () => process.env.APP_URL || 'http://localhost:5173';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const statusOf = (invitation, now = new Date()) => {
  if (invitation.accepted_at) return 'accepted';
  if (invitation.revoked_at) return 'revoked';
  if (new Date(invitation.expires_at) <= now) return 'expired';
  return 'pending';
};

const serialize = (invitation) => ({
  id: invitation.id,
  branch_id: invitation.branch_id,
  email: invitation.email,
  display_name: invitation.display_name,
  status: statusOf(invitation),
  expires_at: invitation.expires_at,
  created_at: invitation.created_at,
});

const sendInvite = (invitation, token, branch) =>
  mailer.send({
    to: invitation.email,
    subject: `Convite para trabalhar na ${branch.Barbershop.name}`,
    text: `Você foi convidado para atender na filial ${branch.name} da ${branch.Barbershop.name}. Aceite em: ${appUrl()}/convite/${token} (válido por ${TTL_DAYS} dias).`,
  });

const issue = async (invitation, branch, transaction) => {
  const { token, hash } = generateToken();
  await invitation.update({ token_hash: hash, expires_at: new Date(Date.now() + TTL_DAYS * 86400000) }, { transaction });
  return token;
};

/** POST /api/branch/:id/invitations. Convite pendente para o mesmo e-mail é substituído. */
const create = async (branchId, data, currentUser) => {
  const branch = await assertCanManageBranch(currentUser, branchId);
  await subscriptionService.assertWithinLimit(branch.barbershop_id, 'barbers');
  const email = normalizeEmail(data.email);

  const existingBarber = await User.findOne({
    where: { email },
    include: [{ association: 'barberProfiles', where: { branch_id: branch.id, active: true }, required: true }],
  });
  if (existingBarber) throw new ConflictError('Este usuário já é barbeiro desta filial', CODES.BARBER_ALREADY_EXISTS);

  const { token, invitation } = await sequelize.transaction(async (transaction) => {
    await Invitation.update(
      { revoked_at: new Date() },
      { where: { branch_id: branch.id, email, accepted_at: null, revoked_at: null }, transaction }
    );
    const created = await Invitation.create(
      {
        barbershop_id: branch.barbershop_id,
        branch_id: branch.id,
        email,
        display_name: data.display_name ? String(data.display_name).trim() : null,
        token_hash: generateToken().hash,
        expires_at: new Date(Date.now() + TTL_DAYS * 86400000),
        invited_by: currentUser.id,
      },
      { transaction }
    );
    return { invitation: created, token: await issue(created, branch, transaction) };
  });

  await sendInvite(invitation, token, branch);
  return serialize(invitation);
};

const list = async (branchId, currentUser) => {
  await assertCanManageBranch(currentUser, branchId);
  const rows = await Invitation.findAll({ where: { branch_id: branchId }, order: [['created_at', 'DESC']] });
  return rows.map(serialize);
};

const loadOwned = async (branchId, invitationId, currentUser) => {
  const branch = await assertCanManageBranch(currentUser, branchId);
  const invitation = await Invitation.findOne({ where: { id: invitationId, branch_id: branchId } });
  if (!invitation) throw new NotFoundError('Convite não encontrado');
  return { branch, invitation };
};

/** Reenviar = novo token e novo prazo (o link anterior deixa de valer). */
const resend = async (branchId, invitationId, currentUser) => {
  const { branch, invitation } = await loadOwned(branchId, invitationId, currentUser);
  if (invitation.accepted_at || invitation.revoked_at) {
    throw new AppError('Convite já aceito ou revogado', 410, CODES.INVITATION_GONE);
  }
  const token = await issue(invitation, branch);
  await sendInvite(invitation, token, branch);
  return serialize(invitation);
};

const revoke = async (branchId, invitationId, currentUser) => {
  const { invitation } = await loadOwned(branchId, invitationId, currentUser);
  if (!invitation.accepted_at && !invitation.revoked_at) await invitation.update({ revoked_at: new Date() });
  return true;
};

/** Convite pendente pelo token; usado/revogado/expirado → 410; inexistente → 404. */
const findPending = async (token, options = {}) => {
  const invitation = await Invitation.findOne({
    where: { token_hash: hashToken(token) },
    include: [{ model: Branch, include: [{ model: Barbershop }] }],
    ...options,
  });
  if (!invitation) throw new NotFoundError('Convite não encontrado');
  if (statusOf(invitation) !== 'pending') {
    throw new AppError('Convite expirado ou já utilizado', 410, CODES.INVITATION_GONE);
  }
  return invitation;
};

/** GET /api/invitations/:token (público): só o necessário para a tela de aceite. */
const preview = async (token) => {
  const invitation = await findPending(token);
  const hasAccount = Boolean(await User.count({ where: { email: invitation.email } }));
  return {
    barbershop: { name: invitation.Branch.Barbershop.name, slug: invitation.Branch.Barbershop.slug },
    branch: { id: invitation.Branch.id, name: invitation.Branch.name },
    email: invitation.email,
    has_account: hasAccount,
    expires_at: invitation.expires_at,
  };
};

/** POST /api/invitations/:token/accept. */
const accept = async (token, data, currentUser) => {
  const invitation = await findPending(token);
  // require tardio: barberService depende de authz/models, evita ciclo no boot.
  const barberService = require('../barber/barberService');

  let user;
  let issuedToken = null;
  if (currentUser) {
    if (normalizeEmail(currentUser.email) !== invitation.email) {
      throw new ForbiddenError('Este convite foi enviado para outro e-mail');
    }
    user = await User.findByPk(currentUser.id);
  } else {
    if (await User.count({ where: { email: invitation.email } })) {
      throw new UnauthorizedError('Já existe conta com este e-mail: entre para aceitar o convite', CODES.LOGIN_REQUIRED);
    }
    const name = String(data.name || '').trim();
    if (name.length < 2) throw new AppError("Campo 'name' é obrigatório para criar a conta", 400);
    assertStrongPassword(data.password, { email: invitation.email, name });
    user = await User.create({
      name,
      email: invitation.email,
      password: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
      role: 'cliente',
    });
    issuedToken = true;
  }

  await subscriptionService.assertWithinLimit(invitation.barbershop_id, 'barbers');
  const barber = await barberService.attachUserToBranch({
    user,
    branchId: invitation.branch_id,
    display_name: invitation.display_name,
  });

  // Uso único: marca aceito só se ainda estava pendente (corrida de dois cliques).
  const [updated] = await Invitation.update(
    { accepted_at: new Date() },
    { where: { id: invitation.id, accepted_at: null, revoked_at: null, expires_at: { [Op.gt]: new Date() } } }
  );
  if (!updated) throw new AppError('Convite expirado ou já utilizado', 410, CODES.INVITATION_GONE);

  const fresh = await User.findByPk(user.id);
  return {
    barber,
    user: sanitizeUser(fresh),
    ...(issuedToken ? { token: signAccessToken(fresh) } : {}),
  };
};

module.exports = { create, list, resend, revoke, preview, accept, statusOf, TTL_DAYS };
