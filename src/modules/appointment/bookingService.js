// BE-14: criação de agendamento à prova de concorrência.
//
// Dentro de uma transação READ COMMITTED (MySQL — ver src/shared/transaction.js):
//   1. trava a linha do cliente (serializa o limite de agendamentos ativos e o Idempotency-Key);
//   2. trava as linhas dos barbeiros candidatos (ordem por id → sem deadlock);
//   3. revalida o horário com o mesmo computeSlots do GET /availability (BE-13);
//   4. confere sobreposição com agendamentos confirmados e cria.
// READ COMMITTED garante que, ao conseguir o lock do barbeiro, as leituras seguintes enxergam o
// agendamento que outra transação acabou de gravar (em REPEATABLE READ o snapshot seria antigo).
// SQLite (testes) serializa escritas sozinho e ignora FOR UPDATE.
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, Barber, Branch, Appointment, AppointmentEvent, IdempotencyKey, BarbershopClient } = require('../../models');
const clientService = require('../client/clientService');
const availability = require('../availability/availabilityService');
const { performsService } = require('../barber/barberRepository');
const { canOperateBranch } = require('../../shared/authz');
const { present } = require('./appointmentPresenter');
const { lockingTransaction } = require('../../shared/transaction');
const time = require('../../shared/time');
const { ValidationError, NotFoundError, ConflictError, AppError, CODES } = require('../../utils/errorHandler');

const MAX_ACTIVE_PER_BARBERSHOP = 3;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_SCOPE = 'appointment.create';
// A equipe agenda no balcão: sem antecedência mínima, grade de 5 min e horizonte maior.
const STAFF_POLICY = Object.freeze({ minNoticeMin: 0, stepMin: 5, horizonDays: 365 });

// Ganchos executados dentro da transação após criar (BE-16: e-mail de confirmação e lembretes).
const createHooks = [];
const onCreate = (fn) => createHooks.push(fn);

const isPositiveInt = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

const parseFutureDate = (value, now) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new ValidationError("Campo 'start_at' deve ser uma data válida (ISO 8601)");
  }
  if (date.getTime() <= now.getTime()) {
    throw new ValidationError('Não é possível agendar para uma data no passado');
  }
  return date;
};

const hashRequest = (data) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

const findIdempotent = async (userId, key, now, transaction) => {
  const row = await IdempotencyKey.findOne({ where: { user_id: userId, scope: IDEMPOTENCY_SCOPE, key }, transaction });
  if (!row) return null;
  if (new Date(row.expires_at) <= now) {
    await row.destroy({ transaction });
    return null;
  }
  return row;
};

/** Mesma chave + mesmo corpo → reaproveita a resposta. Mesma chave + corpo diferente → 409. */
const replayOrReject = (row, requestHash) => {
  if (row.request_hash !== requestHash) {
    throw new ConflictError('Idempotency-Key já usada com outros dados', CODES.IDEMPOTENCY_KEY_REUSED);
  }
  const body = typeof row.response_body === 'string' ? JSON.parse(row.response_body) : row.response_body;
  return { appointment: body, replayed: true };
};

/** Agendamentos confirmados futuros do cliente nesta barbearia. */
const countActiveInBarbershop = async (userId, barbershopId, now, transaction) => {
  const branches = await Branch.findAll({ where: { barbershop_id: barbershopId }, attributes: ['id'], transaction });
  return Appointment.count({
    where: {
      user_id: userId,
      status: Appointment.STATUS.CONFIRMED,
      start_at: { [Op.gt]: now },
      branch_id: { [Op.in]: branches.map((branch) => branch.id) },
    },
    transaction,
  });
};

/** Barbeiro escolhido (validado) ou candidatos do "sem preferência". */
const resolveCandidates = async ({ barberId, branch, service }) => {
  if (barberId === undefined || barberId === null || barberId === '') {
    const barbers = await availability.findEligibleBarbers(branch.id, service.id);
    if (!barbers.length) throw new ValidationError('Nenhum barbeiro desta filial realiza o serviço selecionado');
    return { chosen: null, candidates: barbers };
  }
  if (!isPositiveInt(barberId)) throw new ValidationError("Campo 'barber_id' deve ser um inteiro positivo");
  const barber = await Barber.findByPk(barberId);
  if (!barber || !barber.active) throw new NotFoundError('Barbeiro não encontrado');
  if (String(barber.branch_id) !== String(branch.id)) {
    throw new ValidationError('Este barbeiro não pertence à filial selecionada');
  }
  if (!(await performsService(barber.id, service.id))) {
    throw new ValidationError('Este barbeiro não realiza o serviço selecionado');
  }
  return { chosen: barber, candidates: [barber] };
};

/**
 * Revalida [start, start+duração) para os barbeiros candidatos, dentro da transação.
 * Retorna os ids livres (ordem: menos agendamentos no dia, depois menor id).
 * Horário fora da agenda → 400 SLOT_UNAVAILABLE; horário ocupado → 409 SLOT_TAKEN.
 */
const freeBarbersAt = async ({ branch, service, barberIds, start, policy, now, excludeAppointmentId, transaction }) => {
  const date = time.toLocalParts(start, branch.timezone).date;
  const input = await availability.loadDayInput({ branch, date, barberIds, excludeAppointmentId, transaction });
  const base = { ...input, durationMin: service.duration, now, policy };
  const iso = start.toISOString();

  const slot = availability.computeSlots(base).find((item) => item.start_at === iso);
  if (!slot) {
    const free = availability.computeSlots({ ...base, barbers: input.barbers.map((b) => ({ ...b, busy: [] })) });
    if (!free.some((item) => item.start_at === iso)) {
      throw new ValidationError('Horário fora da agenda disponível', undefined, CODES.SLOT_UNAVAILABLE);
    }
    throw new ConflictError('Este horário acabou de ser reservado. Escolha outro.', CODES.SLOT_TAKEN);
  }

  const counts = new Map(input.barbers.map((barber) => [barber.id, barber.appointmentCount]));
  return [...slot.barber_ids].sort((a, b) => counts.get(a) - counts.get(b) || a - b);
};

/** Checagem explícita de sobreposição (independe do dia local). */
const assertNoOverlap = async (barberId, start, end, { excludeAppointmentId, transaction } = {}) => {
  const where = {
    barber_id: barberId,
    status: Appointment.STATUS.CONFIRMED,
    start_at: { [Op.lt]: end },
    end_at: { [Op.gt]: start },
  };
  if (excludeAppointmentId) where.id = { [Op.ne]: excludeAppointmentId };
  if (await Appointment.count({ where, transaction })) {
    throw new ConflictError('Este horário acabou de ser reservado. Escolha outro.', CODES.SLOT_TAKEN);
  }
};

/** Trava as linhas dos barbeiros (ordem crescente de id). */
const lockBarbers = (ids, transaction) =>
  Barber.findAll({
    where: { id: { [Op.in]: ids } },
    order: [['id', 'ASC']],
    lock: transaction.LOCK.UPDATE,
    transaction,
  });

/**
 * POST /api/appointment.
 * @returns {{ appointment: object, replayed: boolean }} appointment já serializado (JSON).
 */
const create = async (payload = {}, currentUser, { idempotencyKey, now = new Date(), afterCreate } = {}) => {
  const startInput = payload.start_at !== undefined ? payload.start_at : payload.appointment_date;
  if (!isPositiveInt(payload.service_id)) throw new ValidationError("Campo 'service_id' é obrigatório e deve ser um inteiro positivo");
  if (!isPositiveInt(payload.branch_id)) throw new ValidationError("Campo 'branch_id' é obrigatório e deve ser um inteiro positivo");
  const start = parseFutureDate(startInput, now);

  const { branch, service } = await availability.loadBookingContext({
    branchId: payload.branch_id,
    serviceId: payload.service_id,
  });
  const { chosen, candidates } = await resolveCandidates({ barberId: payload.barber_id, branch, service });

  const actsAsStaff =
    canOperateBranch(currentUser, branch) ||
    Boolean(chosen && String(chosen.user_id) === String(currentUser.id));

  // clientId = usuário com conta (pode ser null para cliente rápido); customerId = barbershop_clients (BE-23).
  let clientId;
  let customerId = null;
  if (actsAsStaff) {
    if (isPositiveInt(payload.client_id)) {
      // Cliente da barbearia (com ou sem conta) — precisa ser desta barbearia.
      const customer = await clientService.findInBarbershop(branch.barbershop_id, payload.client_id);
      customerId = customer.id;
      clientId = customer.user_id || null;
    } else if (isPositiveInt(payload.user_id)) {
      clientId = Number(payload.user_id);
    } else {
      throw new ValidationError("Informe 'client_id' ou 'user_id' (cliente) ao agendar pela barbearia");
    }
  } else {
    // Modo cliente: a identidade vem do token, nunca do body (SEC-04).
    clientId = currentUser.id;
    // BE-27: agendamento online só depois que o dono confirmar o e-mail.
    if (!(await require('../auth/emailVerificationService').ownerVerified(branch.Barbershop))) {
      throw new AppError('Esta barbearia ainda não está recebendo agendamentos online', 404, CODES.BARBERSHOP_UNAVAILABLE);
    }
  }

  const requestHash = hashRequest({
    branch_id: Number(payload.branch_id),
    service_id: Number(payload.service_id),
    barber_id: chosen ? chosen.id : null,
    start_at: start.toISOString(),
    user_id: clientId,
    client_id: customerId,
    notes: payload.notes || null,
    source: payload.source || null,
  });

  if (idempotencyKey) {
    const previous = await findIdempotent(currentUser.id, idempotencyKey, now);
    if (previous) return replayOrReject(previous, requestHash);
  }

  const end = time.addMinutes(start, service.duration);
  const policy = actsAsStaff ? STAFF_POLICY : availability.POLICY;

  return lockingTransaction(async (transaction) => {
    if (clientId) {
      const client = await User.findByPk(clientId, { attributes: ['id'], lock: transaction.LOCK.UPDATE, transaction });
      if (!client) throw new NotFoundError('Cliente não encontrado');
      // BE-23: todo agendamento aponta para o cliente da barbearia (cria/vincula se preciso).
      if (!customerId) {
        customerId = (await clientService.ensureForUser(branch.barbershop_id, clientId, { transaction })).id;
      }
    } else {
      await BarbershopClient.findByPk(customerId, { attributes: ['id'], lock: transaction.LOCK.UPDATE, transaction });
    }

    // Requisição idêntica que estava esperando o lock do cliente: devolve a mesma resposta.
    if (idempotencyKey) {
      const previous = await findIdempotent(currentUser.id, idempotencyKey, now, transaction);
      if (previous) return replayOrReject(previous, requestHash);
    }

    // SEC-21: o cliente agendando para si tem no máximo 3 agendamentos futuros por barbearia.
    if (!actsAsStaff) {
      const active = await countActiveInBarbershop(clientId, branch.barbershop_id, now, transaction);
      if (active >= MAX_ACTIVE_PER_BARBERSHOP) {
        throw new ConflictError(
          `Você já tem ${MAX_ACTIVE_PER_BARBERSHOP} agendamentos futuros nesta barbearia`,
          CODES.TOO_MANY_ACTIVE_APPOINTMENTS,
          { limit: MAX_ACTIVE_PER_BARBERSHOP }
        );
      }
    }

    const locked = await lockBarbers(candidates.map((barber) => barber.id), transaction);
    const active = locked.filter((barber) => barber.active).map((barber) => barber.id);
    if (!active.length) throw new NotFoundError('Barbeiro não encontrado');

    const free = await freeBarbersAt({ branch, service, barberIds: active, start, policy, now, transaction });
    const barberId = free[0];
    await assertNoOverlap(barberId, start, end, { transaction });

    const created = await Appointment.create(
      {
        user_id: clientId,
        client_id: customerId,
        barber_id: barberId,
        service_id: service.id,
        branch_id: branch.id,
        start_at: start,
        end_at: end,
        duration_min: service.duration,
        price_snapshot: service.price,
        service_name_snapshot: service.name,
        notes: payload.notes ? String(payload.notes).trim() : null,
        source: payload.source || 'web',
        status: Appointment.STATUS.CONFIRMED,
      },
      { transaction }
    );

    // BE-15: histórico começa na criação.
    await AppointmentEvent.create(
      {
        appointment_id: created.id,
        actor_user_id: currentUser.id,
        actor_role: actsAsStaff ? 'staff' : 'client',
        type: 'created',
        to_status: created.status,
        payload: { start_at: start.toISOString(), barber_id: barberId, source: created.source },
      },
      { transaction }
    );
    for (const hook of createHooks) await hook({ appointment: created, actor: currentUser, transaction });
    if (afterCreate) await afterCreate(created, { transaction, actor: currentUser });

    const appointmentRepository = require('./appointmentRepository');
    const full = await appointmentRepository.findById(created.id, [], { transaction });
    // Resposta guardada no Idempotency-Key já no formato final (com allowed_actions).
    const body = JSON.parse(JSON.stringify(present(full, currentUser, now)));

    if (idempotencyKey) {
      await IdempotencyKey.create(
        {
          user_id: currentUser.id,
          key: idempotencyKey,
          scope: IDEMPOTENCY_SCOPE,
          request_hash: requestHash,
          response_status: 201,
          response_body: body,
          expires_at: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
        { transaction }
      );
    }

    return { appointment: body, replayed: false, model: full };
  });
};

/** Remove chaves vencidas (chamado pelo worker de jobs — BE-16). */
const purgeExpiredIdempotencyKeys = (now = new Date()) =>
  IdempotencyKey.destroy({ where: { expires_at: { [Op.lte]: now } } });

module.exports = {
  create,
  onCreate,
  parseFutureDate,
  lockingTransaction,
  lockBarbers,
  freeBarbersAt,
  assertNoOverlap,
  purgeExpiredIdempotencyKeys,
  MAX_ACTIVE_PER_BARBERSHOP,
  STAFF_POLICY,
  IDEMPOTENCY_SCOPE,
};
