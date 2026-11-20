// BE-16: e-mails do agendamento via fila persistida.
//   criação      → confirmação (com .ics) + lembretes 24 h e 2 h antes
//   cancelamento → remove lembretes pendentes + e-mail de cancelamento (.ics METHOD:CANCEL)
//   reagendamento→ remove lembretes, agenda os novos + e-mail com o novo horário (.ics atualizado)
//   conclusão/falta → remove lembretes pendentes
// Os jobs são enfileirados dentro da transação do agendamento: rollback não deixa e-mail órfão.
// O e-mail é montado na hora do envio com os dados atuais; lembrete de horário que mudou é ignorado.
require('dayjs/locale/pt-br');
const { Appointment, User, Barber, Branch, Barbershop, Address, AppointmentEvent, BarbershopClient } = require('../../models');
const queue = require('../../jobs/queue');
const worker = require('../../jobs/worker');
const mailer = require('../../shared/mailer');
const templates = require('../../shared/emailTemplates');
const ics = require('../../shared/ics');
const time = require('../../shared/time');
const booking = require('../appointment/bookingService');
const lifecycle = require('../appointment/appointmentLifecycleService');
const stateMachine = require('../appointment/appointmentStateMachine');

const JOB_TYPE = 'appointment.email';
const KINDS = Object.freeze({
  CONFIRMATION: 'confirmation',
  CANCELLATION: 'cancellation',
  RESCHEDULE: 'reschedule',
  REMINDER_24H: 'reminder_24h',
  REMINDER_2H: 'reminder_2h',
});
const REMINDERS = [
  { kind: KINDS.REMINDER_24H, beforeMs: 24 * 3600000, when: 'amanhã' },
  { kind: KINDS.REMINDER_2H, beforeMs: 2 * 3600000, when: 'daqui a pouco' },
];
const TEMPLATE_BY_KIND = {
  [KINDS.CONFIRMATION]: 'appointment-confirmation',
  [KINDS.CANCELLATION]: 'appointment-cancellation',
  [KINDS.RESCHEDULE]: 'appointment-reschedule',
  [KINDS.REMINDER_24H]: 'appointment-reminder',
  [KINDS.REMINDER_2H]: 'appointment-reminder',
};

const appUrl = () => process.env.APP_URL || 'http://localhost:5173';
const reference = (appointmentId) => `appointment:${appointmentId}`;
const isReminder = (payload) => Boolean(payload && String(payload.kind).startsWith('reminder_'));

// ---------------------------------------------------------------------------------------------
// Agendamento dos jobs
// ---------------------------------------------------------------------------------------------

const scheduleReminders = async (appointment, { now = new Date(), transaction } = {}) => {
  const start = new Date(appointment.start_at);
  for (const reminder of REMINDERS) {
    const runAt = new Date(start.getTime() - reminder.beforeMs);
    if (runAt <= now) continue; // agendado em cima da hora: lembrete já passou
    await queue.enqueue(
      JOB_TYPE,
      { appointment_id: appointment.id, kind: reminder.kind, start_at: start.toISOString() },
      { runAt, reference: reference(appointment.id), transaction }
    );
  }
};

const cancelReminders = (appointmentId, transaction) =>
  queue.cancelByReference(reference(appointmentId), { types: [JOB_TYPE], match: isReminder, transaction });

const enqueueEmail = (appointmentId, kind, extra, transaction) =>
  queue.enqueue(JOB_TYPE, { appointment_id: appointmentId, kind, ...extra }, { reference: reference(appointmentId), transaction });

const onCreate = async ({ appointment, transaction }) => {
  await enqueueEmail(appointment.id, KINDS.CONFIRMATION, {}, transaction);
  await scheduleReminders(appointment, { transaction });
};

const onTransition = async ({ action, appointment, payload, transaction }) => {
  await cancelReminders(appointment.id, transaction);
  if (action === stateMachine.ACTIONS.CANCEL) {
    await enqueueEmail(appointment.id, KINDS.CANCELLATION, {}, transaction);
  }
  if (action === stateMachine.ACTIONS.RESCHEDULE) {
    await scheduleReminders(appointment, { transaction });
    await enqueueEmail(appointment.id, KINDS.RESCHEDULE, { previous_start_at: payload.from.start_at }, transaction);
  }
};

// ---------------------------------------------------------------------------------------------
// Montagem e envio (executado pelo worker)
// ---------------------------------------------------------------------------------------------

const loadForEmail = (appointmentId) =>
  Appointment.findByPk(appointmentId, {
    include: [
      { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
      // BE-23: cliente rápido (sem conta) recebe no e-mail cadastrado pela barbearia, se houver.
      { model: BarbershopClient, as: 'customer', attributes: ['id', 'name', 'email'] },
      { model: Barber, attributes: ['id', 'display_name'], include: [{ model: User, attributes: ['name'] }] },
      {
        model: Branch,
        attributes: ['id', 'name', 'timezone'],
        include: [{ model: Address }, { model: Barbershop, attributes: ['id', 'name', 'slug'] }],
      },
    ],
  });

const formatDate = (instant, tz) => time.dayjs(instant).tz(tz).locale('pt-br').format('dddd, DD/MM/YYYY');
const formatTime = (instant, tz) => time.dayjs(instant).tz(tz).format('HH:mm');
const formatDateTime = (instant, tz) => time.dayjs(instant).tz(tz).format('DD/MM/YYYY [às] HH:mm');

const addressLabel = (address) => {
  if (!address) return '';
  const street = [address.street, address.number].filter((part) => part !== null && part !== undefined && part !== '').join(', ');
  const place = [address.neighborhood, [address.city, address.state].filter(Boolean).join('/')].filter(Boolean).join(' — ');
  return [street, place].filter(Boolean).join(' — ');
};

const barberName = (appointment) => {
  const barber = appointment.barber || appointment.Barber;
  if (!barber) return 'a equipe';
  return barber.display_name || (barber.User && barber.User.name) || 'a equipe';
};

/** Destinatário: conta do cliente ou, sem conta, o cliente da barbearia com e-mail. */
const recipient = (appointment) => {
  if (appointment.client && appointment.client.email) return appointment.client;
  if (appointment.customer && appointment.customer.email) return appointment.customer;
  return null;
};

/** Dados comuns a todos os templates de agendamento. */
const buildData = (appointment, extra = {}, now = new Date()) => {
  const tz = appointment.Branch.timezone || time.DEFAULT_TIMEZONE;
  const shop = appointment.Branch.Barbershop;
  const until = stateMachine.canCancelUntil(appointment);
  return {
    app_url: appUrl(),
    client_name: recipient(appointment).name.split(' ')[0],
    barbershop_name: shop.name,
    branch_name: appointment.Branch.name,
    service_name: appointment.service_name_snapshot,
    barber_name: barberName(appointment),
    duration_min: appointment.duration_min,
    price_label: Number(appointment.price_snapshot).toFixed(2).replace('.', ','),
    date_label: formatDate(appointment.start_at, tz),
    time_label: formatTime(appointment.start_at, tz),
    address_label: addressLabel(appointment.Branch.Address),
    can_cancel_until_label: formatDateTime(until, tz),
    can_still_cancel: now <= until,
    manage_url: `${appUrl()}/user-home`,
    booking_url: `${appUrl()}/b/${shop.slug}`,
    reason: appointment.cancel_reason || '',
    ...extra,
  };
};

/** Número de reagendamentos: SEQUENCE do .ics para o calendário substituir o evento. */
const icsSequence = (appointmentId) => AppointmentEvent.count({ where: { appointment_id: appointmentId, type: 'rescheduled' } });

const calendarAttachment = async (appointment, { cancelled = false } = {}) => ({
  filename: 'agendamento.ics',
  contentType: `text/calendar; charset=utf-8; method=${cancelled ? 'CANCEL' : 'PUBLISH'}`,
  content: ics.buildEvent({
    uid: `appointment-${appointment.id}@barberos.app`,
    sequence: await icsSequence(appointment.id),
    start: appointment.start_at,
    end: appointment.end_at,
    summary: `${appointment.service_name_snapshot} — ${appointment.Branch.Barbershop.name}`,
    description: `Com ${barberName(appointment)}. Gerencie em ${appUrl()}/user-home`,
    location: [appointment.Branch.name, addressLabel(appointment.Branch.Address)].filter(Boolean).join(' — '),
    cancelled,
  }),
});

/**
 * Handler do job. Retorna o e-mail enviado, ou null quando não há o que enviar
 * (lembrete de agendamento cancelado/remarcado, agendamento apagado).
 */
const handle = async (payload, now = new Date()) => {
  const appointment = await loadForEmail(payload.appointment_id);
  if (!appointment || !recipient(appointment)) return null;

  if (isReminder(payload)) {
    if (appointment.status !== Appointment.STATUS.CONFIRMED) return null;
    if (new Date(appointment.start_at).toISOString() !== payload.start_at) return null;
  }

  const extra = {};
  const reminder = REMINDERS.find((item) => item.kind === payload.kind);
  if (reminder) extra.when_label = reminder.when;
  if (payload.kind === KINDS.RESCHEDULE) {
    const tz = appointment.Branch.timezone || time.DEFAULT_TIMEZONE;
    extra.previous_date_label = formatDate(payload.previous_start_at, tz);
    extra.previous_time_label = formatTime(payload.previous_start_at, tz);
  }

  const templateName = TEMPLATE_BY_KIND[payload.kind];
  if (!templateName) throw new Error(`Tipo de e-mail de agendamento desconhecido: ${payload.kind}`);
  const { subject, html, text } = templates.render(templateName, buildData(appointment, extra, now));

  const attachments = [];
  if (payload.kind === KINDS.CONFIRMATION || payload.kind === KINDS.RESCHEDULE) {
    attachments.push(await calendarAttachment(appointment));
  }
  if (payload.kind === KINDS.CANCELLATION) {
    attachments.push(await calendarAttachment(appointment, { cancelled: true }));
  }

  return mailer.send({ to: recipient(appointment).email, subject, html, text, attachments });
};

/** Job genérico: { template, to, data }. Para e-mails sem token sensível (o token não vai para o banco). */
const handleTemplateEmail = async (payload) => {
  const { subject, html, text } = templates.render(payload.template, { app_url: appUrl(), ...payload.data });
  return mailer.send({ to: payload.to, subject, html, text });
};

let registered = false;
/** Liga os ganchos e handlers. Idempotente (app.js e server.js podem chamar). */
const register = () => {
  if (registered) return;
  registered = true;
  booking.onCreate(onCreate);
  lifecycle.onTransition(onTransition);
  worker.register(JOB_TYPE, (payload) => handle(payload));
  worker.register('email.send', handleTemplateEmail);
  worker.addMaintenance((now) => booking.purgeExpiredIdempotencyKeys(now));
};

module.exports = {
  register,
  handle,
  buildData,
  addressLabel,
  scheduleReminders,
  cancelReminders,
  JOB_TYPE,
  KINDS,
  REMINDERS,
};
