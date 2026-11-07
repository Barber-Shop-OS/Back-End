// BE-03 / SEC-03: autorização por tenant (Barbershop). Todo service que lê ou escreve recurso de
// uma barbearia passa por aqui. Regras:
//   - admin passa sempre;
//   - owner gerencia apenas barbearias em que barbershops.owner_id = user.id;
//   - barbeiro só enxerga/atua nos próprios atendimentos;
//   - cliente só enxerga os próprios agendamentos/pagamentos.
// Recursos públicos (barbearia, filial, barbeiro, serviço) → 403 em escrita de outro tenant.
// Recursos privados (endereço por id, agendamento, pagamento) → 404, para não revelar existência.
const { Barbershop, Branch, Barber, Service, Appointment } = require('../models');
const { ForbiddenError, NotFoundError } = require('../utils/errorHandler');

const isAdmin = (user) => Boolean(user) && user.role === 'admin';
const sameId = (a, b) => a !== null && a !== undefined && String(a) === String(b);

const ownsBarbershop = (user, barbershop) => isAdmin(user) || sameId(barbershop.owner_id, user && user.id);

/** Barbearia que o usuário gerencia. 404 se não existe, 403 se é de outro dono. */
const assertCanManageBarbershop = async (user, barbershopId) => {
  const barbershop = await Barbershop.findByPk(barbershopId);
  if (!barbershop) throw new NotFoundError('Barbearia não encontrada');
  if (!ownsBarbershop(user, barbershop)) {
    throw new ForbiddenError('Sem permissão para gerenciar esta barbearia');
  }
  return barbershop;
};

const loadBranchWithBarbershop = (branchId) =>
  Branch.findByPk(branchId, { include: [{ model: Barbershop }] });

/** Filial de uma barbearia que o usuário gerencia. */
const assertCanManageBranch = async (user, branchId) => {
  const branch = await loadBranchWithBarbershop(branchId);
  if (!branch) throw new NotFoundError('Filial não encontrada');
  if (!ownsBarbershop(user, branch.Barbershop)) {
    throw new ForbiddenError('Sem permissão para gerenciar esta filial');
  }
  return branch;
};

/** Barbeiro lotado em filial de uma barbearia que o usuário gerencia. */
const assertCanManageBarber = async (user, barberId) => {
  const barber = await Barber.findByPk(barberId, {
    include: [{ model: Branch, include: [{ model: Barbershop }] }],
  });
  if (!barber) throw new NotFoundError('Barbeiro não encontrado');
  if (!barber.Branch || !ownsBarbershop(user, barber.Branch.Barbershop)) {
    throw new ForbiddenError('Sem permissão para gerenciar este barbeiro');
  }
  return barber;
};

/** Serviço de uma barbearia que o usuário gerencia. */
const assertCanManageService = async (user, serviceId) => {
  const service = await Service.findByPk(serviceId, { include: [{ model: Barbershop }] });
  if (!service) throw new NotFoundError('Serviço não encontrado');
  if (!ownsBarbershop(user, service.Barbershop)) {
    throw new ForbiddenError('Sem permissão para gerenciar este serviço');
  }
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
      { model: Branch, include: [{ model: Barbershop }] },
    ],
  });

// O model de barbeiro é definido como 'barbers', então o include aparece como `appointment.barber`.
const appointmentBarber = (appointment) => appointment.barber || appointment.Barber || null;

const isAppointmentStaff = (user, appointment) => {
  const barber = appointmentBarber(appointment);
  return (
    isAdmin(user) ||
    Boolean(appointment.Branch && ownsBarbershop(user, appointment.Branch.Barbershop)) ||
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
const assertCanOperateAppointment = async (user, appointmentId) => {
  const appointment = await loadAppointmentContext(appointmentId);
  if (!appointment) throw new NotFoundError('Agendamento não encontrado');
  if (isAppointmentStaff(user, appointment)) return appointment;
  if (isAppointmentClient(user, appointment)) {
    throw new ForbiddenError('Apenas a barbearia pode realizar esta ação');
  }
  throw new NotFoundError('Agendamento não encontrado');
};

module.exports = {
  isAdmin,
  ownsBarbershop,
  assertCanManageBarbershop,
  assertCanManageBranch,
  assertCanManageBarber,
  assertCanManageService,
  assertCanAccessAddress,
  assertCanViewAppointment,
  assertCanOperateAppointment,
  isAppointmentStaff,
  isAppointmentClient,
};
