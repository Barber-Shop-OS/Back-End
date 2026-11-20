// Payment service: pagamento presencial (PIX, dinheiro, cartão na maquininha) de um agendamento (BE-07).
// Criar/alterar: equipe da barbearia (dono, barbeiro que atendeu) ou admin.
// Ler: os mesmos + o cliente do agendamento. Qualquer outro usuário recebe 404.
// Listar (financeiro): dono (barbearias dele), barbeiro (próprios atendimentos) ou admin.
const { Op } = require('sequelize');
const audit = () => require('../audit/auditService');
const { Appointment, Barbershop } = require('../../models');
const { METHODS } = require('../../models/payment');
const paymentRepository = require('./paymentRepository');
const {
  assertCanViewAppointment,
  assertCanOperateAppointment,
  assertCanManageBarbershop,
  assertCanManageBranch,
  isAdmin,
} = require('../../shared/authz');
const { parsePagination, paginated } = require('../../shared/query');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError, CODES } = require('../../utils/errorHandler');

const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (cents) => (cents / 100).toFixed(2);

const create = async (data, currentUser) => {
  const { appointment_id, method } = data;
  const status = data.status === 'PAID' ? 'PAID' : 'PENDING';

  if (!METHODS.includes(method)) {
    throw new ValidationError(`Método inválido. Use ${METHODS.join(', ')}`);
  }

  const appointment = await assertCanOperateAppointment(currentUser, appointment_id);

  const amount = data.amount === undefined || data.amount === null ? appointment.price_snapshot : data.amount;
  if (isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new ValidationError('amount deve ser um número positivo');
  }

  const existingPayment = await paymentRepository.findByAppointmentId(appointment_id);
  if (existingPayment) {
    throw new ConflictError('Pagamento já registrado para este agendamento', CODES.PAYMENT_ALREADY_REGISTERED);
  }

  const payment = await paymentRepository.create({
    appointment_id: Number(appointment_id),
    amount: fromCents(toCents(amount)),
    method,
    status,
    paid_at: status === 'PAID' ? new Date() : null,
    recorded_by: currentUser.id,
    branch_id: appointment.branch_id,
    barbershop_id: appointment.Branch ? appointment.Branch.barbershop_id : null,
  });
  await audit().record({ action: 'payment.created', entity: 'payment', entityId: payment.id, barbershopId: payment.barbershop_id, after: payment });
  return payment;
};

const findById = async (id, currentUser) => {
  const payment = await paymentRepository.findById(id, [Appointment]);
  if (!payment) {
    throw new NotFoundError('Pagamento não encontrado');
  }
  try {
    await assertCanViewAppointment(currentUser, payment.appointment_id);
  } catch (error) {
    if (error instanceof NotFoundError) throw new NotFoundError('Pagamento não encontrado');
    throw error;
  }
  return payment;
};

const updateStatus = async (id, status, currentUser) => {
  if (!['PAID', 'FAILED'].includes(status)) {
    throw new ValidationError('Status inválido. Use PAID ou FAILED');
  }

  const currentPayment = await paymentRepository.findById(id);
  if (!currentPayment) {
    throw new NotFoundError('Pagamento não encontrado');
  }
  try {
    await assertCanOperateAppointment(currentUser, currentPayment.appointment_id);
  } catch (error) {
    if (error instanceof NotFoundError) throw new NotFoundError('Pagamento não encontrado');
    throw error;
  }

  const payload = { status };
  if (status === 'PAID') {
    payload.paid_at = new Date();
  }

  const updated = await paymentRepository.update(id, payload);
  await audit().recordChange({
    action: 'payment.status_changed',
    entity: 'payment',
    entityId: id,
    barbershopId: currentPayment.barbershop_id,
    before: { status: currentPayment.status },
    after: { status: updated.status },
  });
  return updated;
};

const findByAppointmentId = async (appointmentId, currentUser) => {
  await assertCanViewAppointment(currentUser, appointmentId);
  const payment = await paymentRepository.findByAppointmentId(appointmentId, [Appointment]);
  if (!payment) {
    throw new NotFoundError('Nenhum pagamento encontrado para este agendamento');
  }
  return payment;
};

/** Escopo de tenant da listagem: monta o `where` e, para barbeiro, o filtro pelos próprios atendimentos. */
const resolveListScope = async (query, currentUser) => {
  const where = {};
  let barberUserId = null;

  if (query.branch_id) {
    if (currentUser.role === 'barbeiro') {
      where.branch_id = query.branch_id;
    } else {
      const branch = await assertCanManageBranch(currentUser, query.branch_id, { access: 'read' });
      where.branch_id = branch.id;
    }
  }
  if (query.barbershop_id) {
    const membership = (currentUser.memberships || []).find((item) => String(item.barbershop_id) === String(query.barbershop_id));
    if (membership && membership.branch_ids && !query.branch_id) {
      where.branch_id = { [Op.in]: membership.branch_ids.map(Number) };
    } else if (!membership && currentUser.role !== 'barbeiro') {
      await assertCanManageBarbershop(currentUser, query.barbershop_id, { access: 'read' });
    }
    where.barbershop_id = query.barbershop_id;
  }

  if (isAdmin(currentUser)) return { where, barberUserId };

  // BE-47: gerente — só as filiais que administra (somadas às barbearias próprias, se houver).
  const memberships = currentUser.memberships || [];
  if (currentUser.role === 'owner' || memberships.length) {
    if (!where.barbershop_id && !where.branch_id) {
      const owned = await Barbershop.findAll({ where: { owner_id: currentUser.id }, attributes: ['id'] });
      const or = [];
      if (owned.length) or.push({ barbershop_id: { [Op.in]: owned.map((shop) => shop.id) } });
      for (const membership of memberships) {
        or.push(
          membership.branch_ids
            ? { branch_id: { [Op.in]: membership.branch_ids.map(Number) } }
            : { barbershop_id: membership.barbershop_id }
        );
      }
      where[Op.or] = or.length ? or : [{ id: null }];
    }
    return { where, barberUserId };
  }

  if (currentUser.role === 'barbeiro') {
    barberUserId = currentUser.id;
    return { where, barberUserId };
  }

  throw new ForbiddenError('Apenas a barbearia pode consultar pagamentos');
};

const buildTotals = (groups) => {
  const totals = {
    count: 0,
    amount: '0.00',
    paid: { count: 0, amount: '0.00' },
    pending: { count: 0, amount: '0.00' },
    failed: { count: 0, amount: '0.00' },
    paid_by_method: Object.fromEntries(METHODS.map((method) => [method, '0.00'])),
  };
  const cents = { all: 0, PAID: 0, PENDING: 0, FAILED: 0 };
  const methodCents = Object.fromEntries(METHODS.map((method) => [method, 0]));

  for (const group of groups) {
    const count = Number(group.count);
    const sum = toCents(group.sum);
    totals.count += count;
    cents.all += sum;
    cents[group.status] += sum;
    const bucket = totals[group.status.toLowerCase()];
    bucket.count += count;
    if (group.status === 'PAID') methodCents[group.method] += sum;
  }

  totals.amount = fromCents(cents.all);
  totals.paid.amount = fromCents(cents.PAID);
  totals.pending.amount = fromCents(cents.PENDING);
  totals.failed.amount = fromCents(cents.FAILED);
  METHODS.forEach((method) => {
    totals.paid_by_method[method] = fromCents(methodCents[method]);
  });
  return totals;
};

/** GET /api/payment — financeiro paginado com filtros e totais (FE-16). */
const list = async (query, currentUser) => {
  const { where, barberUserId } = await resolveListScope(query, currentUser);
  if (query.status) where.status = query.status;
  if (query.method) where.method = query.method;
  if (query.from || query.to) {
    where.created_at = {};
    if (query.from) where.created_at[Op.gte] = new Date(query.from);
    if (query.to) where.created_at[Op.lt] = new Date(query.to);
  }

  const pagination = parsePagination(query);
  const { result, groups } = await paymentRepository.list({
    where,
    barberUserId,
    offset: pagination.offset,
    limit: pagination.limit,
  });
  return { ...paginated(result, pagination), totals: buildTotals(groups) };
};

module.exports = {
  create,
  findById,
  updateStatus,
  findByAppointmentId,
  list,
  buildTotals,
};
