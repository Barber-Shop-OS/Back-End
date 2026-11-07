// Appointment service (BE-04 / SEC-02 / SEC-04): identidade, status e escopo definidos pelo servidor.
//
// Quem agenda:
//   - "modo equipe": quem gerencia a filial (dono/admin) ou o próprio barbeiro escolhido agenda
//     PARA um cliente → `user_id` obrigatório no body;
//   - "modo cliente": qualquer outro usuário agenda para si → `user_id` do body é ignorado.
// O status inicial é sempre `confirmado` (decisão de produto de 2026-10-23).
const { Op } = require('sequelize');
const { User, Barber, Service, Branch, Barbershop } = require('../../models');
const appointmentRepository = require('./appointmentRepository');
const {
  isAdmin,
  ownsBarbershop,
  assertCanViewAppointment,
  isAppointmentStaff,
} = require('../../shared/authz');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../utils/errorHandler');

const allowedStatus = ['pendente', 'confirmado', 'cancelado'];
const INITIAL_STATUS = 'confirmado';
// Cliente só pode cancelar o próprio agendamento (regras de prazo em BE-15).
const CLIENT_ALLOWED_STATUS = ['cancelado'];

const isPositiveInt = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

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
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const offset = (page - 1) * pageSize;
  const filters = {};

  if (query.status) filters.status = query.status;
  if (query.user_id) filters.user_id = Number(query.user_id);
  if (query.barber_id) filters.barber_id = Number(query.barber_id);
  if (query.service_id) filters.service_id = Number(query.service_id);
  if (query.branch_id) filters.branch_id = Number(query.branch_id);

  if (query.from || query.to) {
    filters.appointment_date = {};
    if (query.from) filters.appointment_date[Op.gte] = new Date(query.from);
    if (query.to) filters.appointment_date[Op.lte] = new Date(query.to);
  }

  const scope = await buildVisibilityScope(currentUser);
  const where = scope ? { [Op.and]: [filters, scope] } : filters;

  const allowedSortFields = ['appointment_date', 'status', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'appointment_date';
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

const parseFutureDate = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new ValidationError("Campo 'appointment_date' deve ser uma data válida (ISO 8601)");
  }
  if (date.getTime() <= Date.now()) {
    throw new ValidationError('Não é possível agendar para uma data no passado');
  }
  return date;
};

const create = async (payload = {}, currentUser) => {
  const { barber_id, service_id, branch_id, appointment_date } = payload;

  if (!isPositiveInt(barber_id)) throw new ValidationError("Campo 'barber_id' é obrigatório e deve ser um inteiro positivo");
  if (!isPositiveInt(service_id)) throw new ValidationError("Campo 'service_id' é obrigatório e deve ser um inteiro positivo");
  if (!isPositiveInt(branch_id)) throw new ValidationError("Campo 'branch_id' é obrigatório e deve ser um inteiro positivo");
  const date = parseFutureDate(appointment_date);

  const branch = await Branch.findByPk(branch_id, { include: [{ model: Barbershop }] });
  if (!branch) throw new NotFoundError('Filial não encontrada');

  const barber = await Barber.findByPk(barber_id);
  if (!barber) throw new NotFoundError('Barbeiro não encontrado');
  if (String(barber.branch_id) !== String(branch_id)) {
    throw new ValidationError('Este barbeiro não pertence à filial selecionada');
  }

  const service = await Service.findByPk(service_id);
  if (!service) throw new NotFoundError('Serviço não encontrado');
  if (String(service.barbershop_id) !== String(branch.barbershop_id)) {
    throw new ValidationError('Este serviço não pertence à barbearia da filial selecionada');
  }

  const actsAsStaff =
    ownsBarbershop(currentUser, branch.Barbershop) || String(barber.user_id) === String(currentUser.id);

  let clientId;
  if (actsAsStaff) {
    if (!isPositiveInt(payload.user_id)) {
      throw new ValidationError("Campo 'user_id' (cliente) é obrigatório ao agendar pela barbearia");
    }
    clientId = Number(payload.user_id);
  } else {
    // Modo cliente: a identidade vem do token, nunca do body (SEC-04).
    clientId = currentUser.id;
  }

  const client = await User.findByPk(clientId, { attributes: ['id'] });
  if (!client) throw new NotFoundError('Cliente não encontrado');

  const appointment = await appointmentRepository.create({
    user_id: clientId,
    barber_id: Number(barber_id),
    service_id: Number(service_id),
    branch_id: Number(branch_id),
    appointment_date: date,
    status: INITIAL_STATUS,
  });

  return appointmentRepository.findById(appointment.id);
};

const updateStatus = async (id, status, currentUser) => {
  if (!allowedStatus.includes(status)) {
    throw new ValidationError('Status inválido');
  }

  const appointment = await assertCanViewAppointment(currentUser, id);
  if (!isAppointmentStaff(currentUser, appointment) && !CLIENT_ALLOWED_STATUS.includes(status)) {
    throw new ForbiddenError('O cliente só pode cancelar o próprio agendamento');
  }

  await appointmentRepository.updateStatus(id, status);
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
