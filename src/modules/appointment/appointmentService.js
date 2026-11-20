// Appointment service (BE-04 / SEC-02 / SEC-04): identidade, status e escopo definidos pelo servidor.
//
// Quem agenda:
//   - "modo equipe": quem gerencia a filial (dono/admin) ou o próprio barbeiro escolhido agenda
//     PARA um cliente → `user_id` obrigatório no body;
//   - "modo cliente": qualquer outro usuário agenda para si → `user_id` do body é ignorado.
// O status inicial é sempre `confirmado` (decisão de produto de 2026-10-23).
const { Op } = require('sequelize');
const { parsePagination } = require('../../shared/query');
const { Barber, Branch, Barbershop, Appointment } = require('../../models');
const appointmentRepository = require('./appointmentRepository');
const bookingService = require('./bookingService');
const lifecycle = require('./appointmentLifecycleService');
const { present } = require('./appointmentPresenter');
const { isAdmin, assertCanViewAppointment } = require('../../shared/authz');
const { ValidationError, NotFoundError, ConflictError, CODES } = require('../../utils/errorHandler');

const { STATUS, STATUSES } = Appointment;
const INITIAL_STATUS = STATUS.CONFIRMED;

/** Condições que limitam a listagem ao que o usuário pode ver. Admin vê tudo. */
const buildVisibilityScope = async (currentUser) => {
  if (isAdmin(currentUser)) return null;

  const [ownedBarbershops, barberProfiles] = await Promise.all([
    Barbershop.findAll({ where: { owner_id: currentUser.id }, attributes: ['id'] }),
    Barber.findAll({ where: { user_id: currentUser.id }, attributes: ['id'] }),
  ]);

  const scopes = [{ user_id: currentUser.id }];

  if (ownedBarbershops.length) {
    const branches = await Branch.findAll({
      where: { barbershop_id: ownedBarbershops.map((shop) => shop.id) },
      attributes: ['id'],
    });
    if (branches.length) scopes.push({ branch_id: branches.map((branch) => branch.id) });
  }

  if (barberProfiles.length) {
    scopes.push({ barber_id: barberProfiles.map((barber) => barber.id) });
  }

  // BE-47: gerente vê a agenda das filiais que administra.
  for (const membership of currentUser.memberships || []) {
    if (membership.branch_ids && membership.branch_ids.length) {
      scopes.push({ branch_id: membership.branch_ids.map(Number) });
    } else if (!membership.branch_ids) {
      const managed = await Branch.findAll({ where: { barbershop_id: membership.barbershop_id }, attributes: ['id'] });
      if (managed.length) scopes.push({ branch_id: managed.map((branch) => branch.id) });
    }
  }

  return { [Op.or]: scopes };
};

const findAll = async (query = {}, currentUser) => {
  const { page, pageSize, offset } = parsePagination(query);
  const filters = {};

  if (query.status) filters.status = query.status;
  if (query.user_id) filters.user_id = Number(query.user_id);
  if (query.barber_id) filters.barber_id = Number(query.barber_id);
  if (query.service_id) filters.service_id = Number(query.service_id);
  if (query.branch_id) filters.branch_id = Number(query.branch_id);

  if (query.from || query.to) {
    filters.start_at = {};
    if (query.from) filters.start_at[Op.gte] = new Date(query.from);
    if (query.to) filters.start_at[Op.lte] = new Date(query.to);
  }

  const scope = await buildVisibilityScope(currentUser);
  const where = scope ? { [Op.and]: [filters, scope] } : filters;

  const allowedSortFields = ['start_at', 'status', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'start_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const result = await appointmentRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
  });

  const now = new Date();
  return {
    items: result.rows.map((row) => present(row, currentUser, now)),
    page,
    pageSize,
    total: result.count,
    totalPages: Math.ceil(result.count / pageSize),
  };
};

const findById = async (id, currentUser) => {
  await assertCanViewAppointment(currentUser, id);
  const appointment = await appointmentRepository.findById(id);
  if (!appointment) {
    throw new NotFoundError('Agendamento não encontrado');
  }
  return present(appointment, currentUser);
};

/** BE-14: criação com lock, revalidação do horário e Idempotency-Key (ver bookingService). */
const create = (payload, currentUser, options) => bookingService.create(payload, currentUser, options);

// PUT /api/appointment/:id {status} — mantido por compatibilidade; usa a máquina de estados do BE-15.
const ACTION_BY_STATUS = {
  [STATUS.CANCELLED]: lifecycle.cancel,
  [STATUS.COMPLETED]: (id, input, user) => lifecycle.complete(id, user),
  [STATUS.NO_SHOW]: (id, input, user) => lifecycle.noShow(id, user),
};

const updateStatus = async (id, status, currentUser) => {
  if (!STATUSES.includes(status)) {
    throw new ValidationError('Status inválido');
  }
  if (status === STATUS.CONFIRMED) {
    const appointment = await findById(id, currentUser);
    if (appointment.status === STATUS.CONFIRMED) return appointment;
    throw new ConflictError('Agendamento finalizado não volta a ser confirmado', CODES.INVALID_STATUS_TRANSITION);
  }
  return ACTION_BY_STATUS[status](id, {}, currentUser);
};

// Exclusão física apenas para admin (suporte). Os demais usam status `cancelado`.
const remove = async (id) => {
  const ok = await appointmentRepository.delete(id);
  if (!ok) {
    throw new NotFoundError('Agendamento não encontrado');
  }
  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  updateStatus,
  cancel: lifecycle.cancel,
  reschedule: lifecycle.reschedule,
  complete: lifecycle.complete,
  noShow: lifecycle.noShow,
  listEvents: lifecycle.listEvents,
  remove,
  INITIAL_STATUS,
};
