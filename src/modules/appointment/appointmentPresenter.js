// BE-15: toda resposta de agendamento inclui `can_cancel_until` e `allowed_actions[]` calculados
// para quem está vendo. O front/mobile exibe só as ações desta lista.
const { isAppointmentStaff, isAppointmentClient } = require('../../shared/authz');
const stateMachine = require('./appointmentStateMachine');

/** Papel do usuário diante do agendamento: staff (equipe), client ou null. Equipe prevalece. */
const roleFor = (user, appointment) => {
  if (!user) return null;
  if (isAppointmentStaff(user, appointment)) return stateMachine.ROLES.STAFF;
  if (isAppointmentClient(user, appointment)) return stateMachine.ROLES.CLIENT;
  return null;
};

/**
 * Converte o agendamento (instância Sequelize com Branch.Barbershop e barber carregados) em JSON.
 * O owner_id usado no cálculo do papel não sai na resposta.
 */
const present = (appointment, user, now = new Date()) => {
  const role = roleFor(user, appointment);
  const json = typeof appointment.toJSON === 'function' ? appointment.toJSON() : { ...appointment };
  if (json.Branch && json.Branch.Barbershop) {
    json.Branch = { ...json.Branch };
    delete json.Branch.Barbershop;
  }
  return {
    ...json,
    can_cancel_until: stateMachine.canCancelUntil(json).toISOString(),
    allowed_actions: role ? stateMachine.allowedActions(json, role, now) : [],
  };
};

module.exports = { present, roleFor };
