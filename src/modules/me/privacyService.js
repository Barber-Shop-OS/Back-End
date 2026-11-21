// BE-40 / SEC-20: LGPD — exportar meus dados e excluir minha conta.
// Exclusão = anonimização: nome "Usuário removido", e-mail deleted+<id>@deleted.invalid, telefone nulo, sem
// senha, sessões e vínculos externos apagados, soft delete. Agendamentos e pagamentos ficam (registro
// financeiro da barbearia), mas sem dados pessoais. Dono com assinatura vigente precisa cancelar antes.
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  sequelize,
  User,
  Barbershop,
  Subscription,
  Appointment,
  Payment,
  Branch,
  BarbershopClient,
  Barber,
  UserIdentity,
  UserToken,
  RefreshToken,
} = require('../../models');
const audit = require('../audit/auditService');
const { sanitizeUser } = require('../../shared/sanitizeUser');
const { ValidationError, ConflictError, NotFoundError, CODES } = require('../../utils/errorHandler');

const CURRENT_TERMS_VERSION = process.env.TERMS_VERSION || '2026-11';
const OPEN_SUBSCRIPTION = ['trialing', 'pending', 'active', 'past_due'];

/** GET /api/me/export — tudo que guardamos sobre a pessoa, em JSON. */
const exportData = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('Usuário não encontrado');
  const [identities, appointments, barbershops, customerRecords, barberProfiles] = await Promise.all([
    UserIdentity.findAll({ where: { user_id: userId }, attributes: ['provider', 'email', 'created_at'] }),
    Appointment.findAll({
      where: { user_id: userId },
      attributes: ['id', 'start_at', 'end_at', 'status', 'service_name_snapshot', 'price_snapshot', 'notes', 'source', 'created_at', 'cancelled_at', 'cancel_reason'],
      include: [
        { model: Branch, attributes: ['id', 'name'], paranoid: false, include: [{ model: Barbershop, attributes: ['id', 'name'], paranoid: false }] },
        { model: Payment, attributes: ['amount', 'method', 'status', 'paid_at'] },
      ],
      order: [['start_at', 'DESC']],
    }),
    Barbershop.findAll({ where: { owner_id: userId }, attributes: ['id', 'name', 'slug', 'created_at'] }),
    BarbershopClient.findAll({ where: { user_id: userId }, attributes: ['barbershop_id', 'name', 'phone', 'email', 'notes', 'created_at'] }),
    Barber.findAll({ where: { user_id: userId }, attributes: ['id', 'branch_id', 'display_name', 'bio', 'active'] }),
  ]);
  return {
    exported_at: new Date().toISOString(),
    profile: sanitizeUser(user),
    linked_accounts: identities.map((row) => row.toJSON()),
    appointments: appointments.map((row) => row.toJSON()),
    barbershops_owned: barbershops.map((row) => row.toJSON()),
    barbershop_customer_records: customerRecords.map((row) => row.toJSON()),
    barber_profiles: barberProfiles.map((row) => row.toJSON()),
    // BE-58: histórico das escolhas do banner de cookies.
    cookie_consents: await require('../consent/consentService').listForUser(userId),
  };
};

/** DELETE /api/me {password} — anonimiza e desativa a conta. */
const deleteAccount = async (userId, { password } = {}) => {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('Usuário não encontrado');
  if (user.password && !(password && (await bcrypt.compare(String(password), user.password)))) {
    throw new ValidationError('Senha incorreta', undefined, CODES.INVALID_CURRENT_PASSWORD);
  }

  const shops = await Barbershop.findAll({ where: { owner_id: userId }, attributes: ['id'] });
  if (shops.length) {
    const open = await Subscription.count({
      where: { barbershop_id: { [Op.in]: shops.map((shop) => shop.id) }, status: { [Op.in]: OPEN_SUBSCRIPTION } },
    });
    if (open) {
      throw new ConflictError('Cancele a assinatura da barbearia antes de excluir a conta', CODES.ACTIVE_SUBSCRIPTION, {
        barbershop_ids: shops.map((shop) => shop.id),
      });
    }
  }

  await sequelize.transaction(async (transaction) => {
    const opts = { transaction };
    await user.update(
      {
        name: 'Usuário removido',
        email: `deleted+${user.id}@deleted.invalid`,
        phone: null,
        password: null,
        email_verified_at: null,
        token_version: Number(user.token_version || 0) + 1,
      },
      opts
    );
    await UserIdentity.destroy({ where: { user_id: user.id }, ...opts });
    await UserToken.destroy({ where: { user_id: user.id }, ...opts });
    await RefreshToken.destroy({ where: { user_id: user.id }, ...opts });
    // BE-51: notificações in-app citam nomes de terceiros — apagadas com a conta.
    await require('../../models').UserNotification.destroy({ where: { user_id: user.id }, ...opts });
    // Ficha do cliente nas barbearias: sem dados pessoais e sem vínculo com a conta.
    await BarbershopClient.update(
      { name: 'Cliente removido', phone: null, email: null, notes: null, user_id: null },
      { where: { user_id: user.id }, ...opts }
    );
    await Appointment.update({ notes: null }, { where: { user_id: user.id }, ...opts });
    await Barber.update({ active: false, bio: '', photo_url: null, display_name: null }, { where: { user_id: user.id }, ...opts });
    // Barbearias (já sem assinatura) saem do ar; dados financeiros ficam no período de retenção.
    if (shops.length) await Barbershop.destroy({ where: { id: { [Op.in]: shops.map((shop) => shop.id) } }, ...opts });
    await user.destroy(opts);
  });
  await audit.record({ action: 'user.self_deleted', entity: 'user', entityId: user.id, actor: { id: user.id, role: user.role } });
  return { message: 'Conta excluída. Seus dados pessoais foram removidos.' };
};

module.exports = { exportData, deleteAccount, CURRENT_TERMS_VERSION };
