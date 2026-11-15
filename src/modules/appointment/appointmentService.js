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
const {
  isAdmin,
  assertCanViewAppointment,
  isAppointmentStaff,
} = require('../../shared/authz');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../utils/errorHandler');

const { STATUS, STATUSES } = Appointment;
const allowedStatus = STATUSES;
const INITIAL_STATUS = STATUS.CONFIRMED;
// Cliente só pode cancelar o próprio agendamento (regras de prazo em BE-15).
const CLIENT_ALLOWED_STATUS = ['cancelado'];

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

  return {
    items: result.rows,
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
  return appointment;
};

/** BE-14: criação com lock, revalidação do horário e Idempotency-Key (ver bookingService). */
const create = (payload, currentUser, options) => bookingService.create(payload, currentUser, options);

const updateStatus = async (id, status, currentUser) => {
  if (!allowedStatus.includes(status)) {
    throw new ValidationError('Status inválido');
  }

  const appointment = await assertCanViewAppointment(currentUser, id);
  if (!isAppointmentStaff(currentUser, appointment) && !CLIENT_ALLOWED_STATUS.includes(status)) {
    throw new ForbiddenError('O cliente só pode cancelar o próprio agendamento');
  }

  const changes = { status };
  if (status === STATUS.CANCELLED) {
    changes.cancelled_at = new Date();
    changes.cancelled_by = currentUser.id;
  }
  await appointmentRepository.update(id, changes);
  return appointmentRepository.findById(id);
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
  remove,
  INITIAL_STATUS,
};
