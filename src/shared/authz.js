// BE-03 / SEC-03: autorização por tenant (Barbershop). Todo service que lê ou escreve recurso de
// uma barbearia passa por aqui. Regras:
//   - admin passa sempre;
//   - owner gerencia apenas barbearias em que barbershops.owner_id = user.id;
//   - barbeiro só enxerga/atua nos próprios atendimentos;
//   - cliente só enxerga os próprios agendamentos/pagamentos.
// Recursos públicos (barbearia, filial, barbeiro, serviço) → 403 em escrita de outro tenant.
// Recursos privados (endereço por id, agendamento, pagamento) → 404, para não revelar existência.
const { Barbershop, Branch, Barber, Service, Appointment, Subscription } = require('../models');
const { ForbiddenError, NotFoundError, AppError, CODES } = require('../utils/errorHandler');
const entitlements = require('./entitlements');

const isAdmin = (user) => Boolean(user) && user.role === 'admin';
const sameId = (a, b) => a !== null && a !== undefined && String(a) === String(b);

const ownsBarbershop = (user, barbershop) => isAdmin(user) || sameId(barbershop.owner_id, user && user.id);

/** BE-47: gerência do usuário nesta barbearia (ou undefined). */
const membershipFor = (user, barbershopId) =>
  user && Array.isArray(user.memberships) ? user.memberships.find((item) => sameId(item.barbershop_id, barbershopId)) : undefined;

/**
 * Filiais que o usuário administra numa barbearia: null = todas (dono, admin ou gerente geral),
 * array = só essas (gerente de filial), [] = nenhuma.
 */
const managedBranchIds = (user, barbershop) => {
  if (ownsBarbershop(user, barbershop)) return null;
  const membership = membershipFor(user, barbershop.id);
  if (!membership) return [];
  return membership.branch_ids === null || membership.branch_ids === undefined ? null : membership.branch_ids.map(Number);
};

/** Dono/admin ou gerente que cobre esta filial. */
const canManageBranch = (user, branch) => {
  if (!branch || !branch.Barbershop) return false;
  const ids = managedBranchIds(user, branch.Barbershop);
  return ids === null || ids.includes(Number(branch.id));
};


/**
 * BE-35: escrita no painel exige assinatura com acesso (trial válido, ativa ou em carência).
 * Senão 402 SUBSCRIPTION_INACTIVE — painel em modo leitura, dados preservados. Admin passa sempre.
 * Barbearia sem linha de assinatura (só dados legados; toda criação abre um trial) não é bloqueada.
 * `options.access = 'read'` desliga a checagem (consultas, cobrança, exclusões para caber no plano).
 */
const assertWritable = async (user, barbershopId, options = {}) => {
  if ((options && options.access === 'read') || isAdmin(user)) return;
  const subscription = await Subscription.findOne({ where: { barbershop_id: barbershopId } });
  if (!subscription) return;
  const access = entitlements.accessLevel(subscription);
  if (access === 'read_only') {
    throw new AppError(
      'Assinatura inativa: o painel está em modo leitura. Regularize a assinatura para voltar a editar.',
      402,
      CODES.SUBSCRIPTION_INACTIVE,
      { status: subscription.status, access }
    );
  }
};

/** Barbearia que o usuário gerencia. 404 se não existe, 403 se é de outro dono. */
const assertCanManageBarbershop = async (user, barbershopId, options) => {
  const barbershop = await Barbershop.findByPk(barbershopId);
  if (!barbershop) throw new NotFoundError('Barbearia não encontrada');
  if (!ownsBarbershop(user, barbershop)) {
    throw new ForbiddenError('Sem permissão para gerenciar esta barbearia');
  }
  await assertWritable(user, barbershop.id, options);
  return barbershop;
};

const loadBranchWithBarbershop = (branchId) =>
  Branch.findByPk(branchId, { include: [{ model: Barbershop }] });

/** Filial de uma barbearia que o usuário gerencia. */
const assertCanManageBranch = async (user, branchId, options) => {
  const branch = await loadBranchWithBarbershop(branchId);
  if (!branch) throw new NotFoundError('Filial não encontrada');
  if (!canManageBranch(user, branch)) {
    throw new ForbiddenError('Sem permissão para gerenciar esta filial');
  }
  await assertWritable(user, branch.barbershop_id, options);
  return branch;
};

/** Barbeiro lotado em filial de uma barbearia que o usuário gerencia. */
const assertCanManageBarber = async (user, barberId, options) => {
  const barber = await Barber.findByPk(barberId, {
    include: [{ model: Branch, include: [{ model: Barbershop }] }],
  });
  if (!barber) throw new NotFoundError('Barbeiro não encontrado');
  if (!barber.Branch || !canManageBranch(user, barber.Branch)) {
    throw new ForbiddenError('Sem permissão para gerenciar este barbeiro');
  }
  await assertWritable(user, barber.Branch.barbershop_id, options);
  return barber;
};

/**
 * Agenda do barbeiro (bloqueios): o dono da barbearia ou o próprio barbeiro. BE-11.
 * Jornada semanal continua só com o dono (assertCanManageBarber).
 */
const assertCanManageBarberAgenda = async (user, barberId, options) => {
  const barber = await Barber.findByPk(barberId, {
    include: [{ model: Branch, include: [{ model: Barbershop }] }],
  });
  if (!barber) throw new NotFoundError('Barbeiro não encontrado');
  const isSelfBarber = sameId(barber.user_id, user && user.id);
  if (!isSelfBarber && !(barber.Branch && canManageBranch(user, barber.Branch))) {
    throw new ForbiddenError('Sem permissão para gerenciar a agenda deste barbeiro');
  }
  if (barber.Branch) await assertWritable(user, barber.Branch.barbershop_id, options);
  return barber;
};

/** Serviço de uma barbearia que o usuário gerencia. */
const assertCanManageService = async (user, serviceId, options) => {
  const service = await Service.findByPk(serviceId, { include: [{ model: Barbershop }] });
  if (!service) throw new NotFoundError('Serviço não encontrado');
  if (!ownsBarbershop(user, service.Barbershop)) {
    throw new ForbiddenError('Sem permissão para gerenciar este serviço');
  }
  await assertWritable(user, service.barbershop_id, options);
  return service;
};

/**
 * Endereço só é acessível por id para quem gerencia a filial que o usa (ou admin).
 * Endereço sem filial (órfão) só para admin.
 */
const assertCanAccessAddress = async (user, addressId) => {
  const branch = await Branch.findOne({
    where: { address_id: addressId },
    include: [{ model: Barbershop }],
  });
  if (isAdmin(user)) return branch;
  if (!branch || !ownsBarbershop(user, branch.Barbershop)) {
    throw new NotFoundError('Endereço não encontrado');
  }
  return branch;
};

const loadAppointmentContext = (appointmentId) =>
  Appointment.findByPk(appointmentId, {
    include: [
      { model: Barber },
      { model: Branch, paranoid: false, include: [{ model: Barbershop, paranoid: false }] },
    ],
  });

// O model de barbeiro é definido como 'barbers', então o include aparece como `appointment.barber`.
const appointmentBarber = (appointment) => appointment.barber || appointment.Barber || null;

const isAppointmentStaff = (user, appointment) => {
  const barber = appointmentBarber(appointment);
  return (
    isAdmin(user) ||
    Boolean(appointment.Branch && canManageBranch(user, appointment.Branch)) ||
    Boolean(barber && sameId(barber.user_id, user && user.id))
  );
};

const isAppointmentClient = (user, appointment) => sameId(appointment.user_id, user && user.id);

/** Cliente dono do agendamento, barbeiro que atende, dono da barbearia ou admin. Senão 404. */
const assertCanViewAppointment = async (user, appointmentId) => {
  const appointment = await loadAppointmentContext(appointmentId);
  if (!appointment || !(isAppointmentStaff(user, appointment) || isAppointmentClient(user, appointment))) {
    throw new NotFoundError('Agendamento não encontrado');
  }
  return appointment;
};

/** Ações de equipe (pagamento, concluir, falta): barbeiro que atende, dono ou admin. */
const assertCanOperateAppointment = async (user, appointmentId, options) => {
  const appointment = await loadAppointmentContext(appointmentId);
  if (!appointment) throw new NotFoundError('Agendamento não encontrado');
  if (isAppointmentStaff(user, appointment)) {
    if (appointment.Branch) await assertWritable(user, appointment.Branch.barbershop_id, options);
    return appointment;
  }
  if (isAppointmentClient(user, appointment)) {
    throw new ForbiddenError('Apenas a barbearia pode realizar esta ação');
  }
  throw new NotFoundError('Agendamento não encontrado');
};

module.exports = {
  isAdmin,
  membershipFor,
  managedBranchIds,
  canManageBranch,
  assertWritable,
  ownsBarbershop,
  assertCanManageBarbershop,
  assertCanManageBranch,
  assertCanManageBarber,
  assertCanManageBarberAgenda,
  assertCanManageService,
  assertCanAccessAddress,
  assertCanViewAppointment,
  assertCanOperateAppointment,
  isAppointmentStaff,
  isAppointmentClient,
};
