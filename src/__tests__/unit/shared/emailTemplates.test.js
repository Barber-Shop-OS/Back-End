// BE-16: templates de e-mail pt-BR, .ics e backoff da fila.
const templates = require('../../../shared/emailTemplates');
const ics = require('../../../shared/ics');
const queue = require('../../../jobs/queue');

const appointmentData = {
  client_name: 'Ana',
  barbershop_name: 'Navalha & Cia',
  branch_name: 'Centro',
  service_name: 'Corte',
  barber_name: 'João',
  duration_min: 30,
  price_label: '50,00',
  date_label: 'quinta-feira, 10/12/2026',
  time_label: '14:00',
  address_label: 'Rua A, 100 — Centro — São Paulo/SP',
  can_cancel_until_label: '09/12/2026 às 14:00',
  can_still_cancel: true,
  manage_url: 'https://app.test/user-home',
  booking_url: 'https://app.test/b/navalha',
  reason: '',
  when_label: 'amanhã',
  previous_date_label: 'quarta-feira, 09/12/2026',
  previous_time_label: '10:00',
};

const SAMPLES = {
  'appointment-confirmation': appointmentData,
  'appointment-cancellation': appointmentData,
  'appointment-reschedule': appointmentData,
  'appointment-reminder': appointmentData,
  welcome: { first_name: 'Carlos', barbershop_name: 'Navalha', trial_days: 14, dashboard_url: 'https://app.test/dashboard' },
  invitation: { barbershop_name: 'Navalha', branch_name: 'Centro', accept_url: 'https://app.test/convite/abc', ttl_days: 7 },
  'account-notice': { first_name: 'Ana', title: 'Sua senha foi alterada', message: 'A senha da sua conta foi alterada.', app_url: 'https://app.test' },
  'email-change': { first_name: 'Ana', confirm_url: 'https://app.test/confirmar-email?token=x', ttl_hours: 24 },
  'password-reset': { first_name: 'Ana', reset_url: 'https://app.test/reset/xyz', ttl_minutes: 30 },
  'email-verification': { first_name: 'Ana', verify_url: 'https://app.test/verify/xyz', ttl_hours: 24 },
  billing: { title: 'Pagamento recusado', barbershop_name: 'Navalha', first_name: 'Carlos', message: 'Atualize o cartão.', amount_label: '199,00', due_date_label: '', billing_url: 'https://app.test/dashboard' },
};

describe('BE-16 — templates de e-mail', () => {
  it('existem os 9 templates do backlog e todos renderizam assunto, HTML e texto', () => {
    expect(templates.TEMPLATES).toHaveLength(11);
    for (const name of templates.TEMPLATES) {
      const mail = templates.render(name, SAMPLES[name]);
      expect(mail.subject).not.toMatch(/\{\{|\}\}/);
      expect(mail.html).toContain('<!doctype html>');
      expect(mail.html).toContain('lang="pt-BR"');
      expect(mail.html).not.toMatch(/\{\{|\}\}/);
      expect(mail.text.length).toBeGreaterThan(20);
      expect(mail.text).not.toMatch(/<[^>]+>/);
    }
  });

  it('confirmação traz os dados do agendamento e o prazo de cancelamento', () => {
    const mail = templates.render('appointment-confirmation', appointmentData);
    expect(mail.subject).toBe('Agendamento confirmado: Corte em quinta-feira, 10/12/2026 às 14:00');
    expect(mail.text).toContain('Profissional: João');
    expect(mail.text).toContain('cancelar ou reagendar até 09/12/2026 às 14:00');
    expect(mail.text).toContain('Ver meus agendamentos: https://app.test/user-home');
  });

  it('valores são escapados no HTML (sem injeção) e o assunto fica legível', () => {
    const mail = templates.render('appointment-confirmation', { ...appointmentData, client_name: '<script>x</script>' });
    expect(mail.html).not.toContain('<script>x</script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain('<script>x</script>'); // texto puro
    expect(templates.render('welcome', SAMPLES.welcome).subject).toBe('Bem-vindo ao BarberOS, Carlos!');
    expect(templates.render('appointment-cancellation', { ...appointmentData, barbershop_name: 'A & B' }).text).toContain('A & B');
  });

  it('blocos {{#if}} aparecem só com valor', () => {
    const without = templates.render('appointment-cancellation', appointmentData);
    expect(without.text).not.toContain('Motivo');
    const withReason = templates.render('appointment-cancellation', { ...appointmentData, reason: 'Barbeiro doente' });
    expect(withReason.text).toContain('Motivo: Barbeiro doente');
  });

  it('variável ausente ou template desconhecido → erro', () => {
    expect(() => templates.render('welcome', { first_name: 'A' })).toThrow(/ausente/);
    expect(() => templates.render('nao-existe', {})).toThrow(/desconhecido/);
  });
});

describe('BE-16 — .ics', () => {
  const event = {
    uid: 'appointment-7@barberos.app',
    start: '2026-12-10T17:00:00.000Z',
    end: '2026-12-10T17:30:00.000Z',
    summary: 'Corte — Navalha, Cia; e mais',
    location: 'Rua A, 100',
    now: new Date('2026-12-01T12:00:00.000Z'),
  };

  it('VEVENT em UTC com CRLF e texto escapado', () => {
    const content = ics.buildEvent(event);
    expect(content).toContain('BEGIN:VCALENDAR\r\n');
    expect(content).toContain('DTSTART:20261210T170000Z');
    expect(content).toContain('DTEND:20261210T173000Z');
    expect(content).toContain('DTSTAMP:20261201T120000Z');
    expect(content).toContain('SUMMARY:Corte — Navalha\\, Cia\\; e mais');
    expect(content).toContain('METHOD:PUBLISH');
    expect(content.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('linhas longas são dobradas em 75 octetos; cancelamento usa METHOD:CANCEL', () => {
    const content = ics.buildEvent({ ...event, description: 'á'.repeat(200), cancelled: true, sequence: 2 });
    for (const line of content.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(content).toContain('METHOD:CANCEL');
    expect(content).toContain('STATUS:CANCELLED');
    expect(content).toContain('SEQUENCE:2');
  });
});

describe('BE-16 — backoff da fila', () => {
  it('2, 4, 8, 16 minutos', () => {
    expect([1, 2, 3, 4].map((n) => queue.backoffMs(n) / 60000)).toEqual([2, 4, 8, 16]);
  });
});
