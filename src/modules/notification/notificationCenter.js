// BE-51: central de notificações in-app (sino). Gravação feita pelo mesmo job que envia e-mail/push
// do agendamento (appointmentNotifications.handle): falha aqui só vai para o log e não impede o
// e-mail. source_key (job + destinatário) evita duplicar quando o job é reprocessado.
const { UserNotification, Barbershop, BarbershopMember } = require('../../models');
const { parsePagination, paginated } = require('../../shared/query');
const { NotFoundError } = require('../../utils/errorHandler');
const logger = require('../../utils/logger');

const TYPES = Object.freeze({
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  APPOINTMENT_RESCHEDULED: 'appointment.rescheduled',
});

const present = (row) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link || null,
  data: row.data || null,
  read: Boolean(row.read_at),
  read_at: row.read_at || null,
  created_at: row.created_at,
});

const unreadCount = (userId) => UserNotification.count({ where: { user_id: userId, read_at: null } });

/** GET /api/me/notifications — mais recentes primeiro; unread=true filtra as não lidas. */
const list = async (userId, query = {}) => {
  const pagination = parsePagination(query);
  const where = { user_id: userId };
  if (query.unread === true || query.unread === 'true') where.read_at = null;
  const result = await UserNotification.findAndCountAll({
    where,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: pagination.limit,
    offset: pagination.offset,
  });
  const page = paginated(result, pagination);
  return { ...page, items: page.items.map(present), unread_count: await unreadCount(userId) };
};

/** PATCH /api/me/notifications/:id/read — só o dono da notificação (senão 404). Idempotente. */
const markRead = async (userId, id, now = new Date()) => {
  const row = await UserNotification.findOne({ where: { id, user_id: userId } });
  if (!row) throw new NotFoundError('Notificação não encontrada');
  if (!row.read_at) await row.update({ read_at: now });
  return { notification: present(row), unread_count: await unreadCount(userId) };
};

/** POST /api/me/notifications/read-all */
const markAllRead = async (userId, now = new Date()) => {
  const [updated] = await UserNotification.update({ read_at: now }, { where: { user_id: userId, read_at: null } });
  return { updated, unread_count: 0 };
};

/** Cria uma notificação por destinatário (sem repetir usuário). Retorna as criadas. */
const notifyUsers = async (userIds, { type, title, body, link = null, data = null, sourceKey = null }) => {
  const unique = [...new Set(userIds.filter((id) => id !== null && id !== undefined).map(Number))];
  const created = [];
  for (const userId of unique) {
    const source_key = sourceKey ? `${sourceKey}:${userId}`.slice(0, 100) : null;
    if (source_key && (await UserNotification.count({ where: { user_id: userId, source_key } }))) continue;
    created.push(
      await UserNotification.create({ user_id: userId, type, title: title.slice(0, 150), body: body.slice(0, 500), link, data, source_key })
    );
  }
  return created;
};

/** Dono + gerentes que cobrem a filial + recepcionistas da filial. */
const branchStaffUserIds = async (branch) => {
  const shop = await Barbershop.findByPk(branch.barbershop_id, { attributes: ['id', 'owner_id'] });
  const members = await BarbershopMember.findAll({ where: { barbershop_id: branch.barbershop_id }, attributes: ['user_id', 'role', 'branch_ids'] });
  const covering = members.filter((member) => {
    const ids = member.branch_ids;
    if (member.role === 'receptionist') return Array.isArray(ids) && ids.map(Number).includes(Number(branch.id));
    return !ids || ids.map(Number).includes(Number(branch.id));
  });
  return [...(shop ? [shop.owner_id] : []), ...covering.map((member) => member.user_id)];
};

const KIND_TO_TYPE = {
  confirmation: TYPES.APPOINTMENT_CREATED,
  cancellation: TYPES.APPOINTMENT_CANCELLED,
  reschedule: TYPES.APPOINTMENT_RESCHEDULED,
};
const CLIENT_TITLES = {
  [TYPES.APPOINTMENT_CREATED]: 'Agendamento confirmado',
  [TYPES.APPOINTMENT_CANCELLED]: 'Agendamento cancelado',
  [TYPES.APPOINTMENT_RESCHEDULED]: 'Agendamento remarcado',
};
const STAFF_TITLES = {
  [TYPES.APPOINTMENT_CREATED]: 'Novo agendamento',
  [TYPES.APPOINTMENT_CANCELLED]: 'Agendamento cancelado',
  [TYPES.APPOINTMENT_RESCHEDULED]: 'Agendamento remarcado',
};

/**
 * Notificações de um evento de agendamento (criado, cancelado, reagendado) para o cliente com conta,
 * o barbeiro e a equipe da filial (dono, gerentes, recepcionistas), exceto o autor da ação.
 * `appointment` vem carregado com client/customer, barber e Branch.Barbershop (loadForEmail).
 */
const notifyAppointment = async (appointment, payload, { when, jobId } = {}) => {
  const type = KIND_TO_TYPE[payload.kind];
  if (!type) return [];
  try {
    const actorId = payload.actor_id !== undefined && payload.actor_id !== null ? Number(payload.actor_id) : null;
    const branch = appointment.Branch;
    const shop = branch.Barbershop ? branch.Barbershop.name : '';
    const barber = appointment.barber || appointment.Barber;
    const who = (appointment.customer && appointment.customer.name) || (appointment.client && appointment.client.name) || 'Cliente';
    const data = { appointment_id: appointment.id, branch_id: branch.id, barbershop_id: branch.barbershop_id, start_at: new Date(appointment.start_at).toISOString() };
    const sourceKey = jobId ? `job:${jobId}` : null;
    const notActor = (id) => id !== null && id !== undefined && Number(id) !== actorId;

    const created = [];
    const clientIds = [appointment.user_id].filter(notActor);
    if (clientIds.length) {
      created.push(
        ...(await notifyUsers(clientIds, { type, title: CLIENT_TITLES[type], body: `${appointment.service_name_snapshot} — ${when} · ${shop}`, data, sourceKey }))
      );
    }
    const staffIds = [barber && barber.user_id, ...(await branchStaffUserIds(branch))]
      .filter(notActor)
      .filter((id) => !clientIds.includes(id));
    created.push(
      ...(await notifyUsers(staffIds, { type, title: STAFF_TITLES[type], body: `${who} — ${appointment.service_name_snapshot} · ${when}`, data, sourceKey }))
    );
    return created;
  } catch (error) {
    logger.warn('[notifications] falha ao gravar notificação in-app', { appointment_id: appointment.id, message: error.message });
    return [];
  }
};

module.exports = { list, markRead, markAllRead, notifyUsers, notifyAppointment, branchStaffUserIds, TYPES, present };
