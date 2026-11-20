// BE-35: limites do plano, modo leitura por inadimplência/trial vencido, página pública, aviso no
// /api/me, recursos por plano e ciclo diário dos trials. Agendamentos existentes nunca são apagados.
jest.setTimeout(120000);

const {
  app,
  request,
  resetDatabase,
  createTenant,
  createUser,
  createAppointment,
  loginAs,
  bearer,
  openAllWeek,
  slotAt,
  sequelize,
} = require('../../helpers/factories');
const { Subscription, SubscriptionEvent, Appointment, Barber, Job, BarbershopClient } = require('../../../models');
const entitlements = require('../../../shared/entitlements');
const accessControl = require('../../../modules/subscription/accessControl');

const DAY = 86400000;
const branchBody = (barbershopId, n) => ({ name: `Filial ${n}`, barbershop_id: barbershopId, cep: '01001-000', number: n, city: 'São Paulo', state: 'SP' });

describe('BE-35 — limites e bloqueio por inadimplência', () => {
  beforeAll(() => resetDatabase());
  afterAll(() => sequelize.close());

  describe('accessLevel (unitário)', () => {
    const now = new Date('2026-12-10T12:00:00Z');
    it.each([
      [{ status: 'active' }, 'full'],
      [{ status: 'trialing', trial_ends_at: new Date(now.getTime() + DAY) }, 'full'],
      [{ status: 'trialing', trial_ends_at: new Date(now.getTime() - 1) }, 'read_only'],
      [{ status: 'past_due', past_due_since: new Date(now.getTime() - 6 * DAY) }, 'grace'],
      [{ status: 'past_due', past_due_since: new Date(now.getTime() - 8 * DAY) }, 'read_only'],
      [{ status: 'past_due', past_due_since: null }, 'grace'],
      [{ status: 'pending' }, 'read_only'],
      [{ status: 'canceled' }, 'read_only'],
      [{ status: 'expired' }, 'read_only'],
      [null, 'read_only'],
    ])('%j → %s', (subscription, expected) => {
      expect(entitlements.accessLevel(subscription, now)).toBe(expected);
    });
  });

  describe('limites do plano (402 PLAN_LIMIT_REACHED)', () => {
    it('Essencial: 1 filial — a segunda é recusada com limite, uso e upgrade', async () => {
      const tenant = await createTenant({ subscription: { status: 'active', plan_code: 'essencial' } });
      const token = await loginAs(tenant.owner);
      const res = await request(app).post('/api/branch').set(bearer(token)).send(branchBody(tenant.barbershop.id, 2));
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
      expect(res.body.details).toMatchObject({ resource: 'branches', limit: 1, used: 1, upgrade_to: 'profissional' });
    });

    it('Essencial: 3 barbeiros — o quarto é recusado; barbeiro já da casa mudando de filial não conta', async () => {
      const tenant = await createTenant({ subscription: { status: 'active', plan_code: 'essencial' } });
      const token = await loginAs(tenant.owner);
      for (let i = 0; i < 2; i += 1) {
        const user = await createUser();
        const ok = await request(app).post(`/api/branch/${tenant.branch.id}/barbers`).set(bearer(token)).send({ user_id: user.id });
        expect(ok.status).toBe(201);
      }
      const fourth = await createUser();
      const res = await request(app).post(`/api/branch/${tenant.branch.id}/barbers`).set(bearer(token)).send({ user_id: fourth.id });
      expect(res.status).toBe(402);
      expect(res.body.details).toMatchObject({ resource: 'barbers', limit: 3, used: 3, upgrade_to: 'profissional' });
      expect(await Barber.count({ where: { user_id: fourth.id } })).toBe(0);
    });

    it('trial usa os limites do Profissional (3 filiais)', async () => {
      const tenant = await createTenant();
      const token = await loginAs(tenant.owner);
      expect((await request(app).post('/api/branch').set(bearer(token)).send(branchBody(tenant.barbershop.id, 2))).status).toBe(201);
      expect((await request(app).post('/api/branch').set(bearer(token)).send(branchBody(tenant.barbershop.id, 3))).status).toBe(201);
      expect((await request(app).post('/api/branch').set(bearer(token)).send(branchBody(tenant.barbershop.id, 4))).status).toBe(402);
    });
  });

  describe('modo leitura', () => {
    let blocked;
    let token;
    let existing;

    beforeAll(async () => {
      blocked = await createTenant({ subscription: { status: 'past_due', past_due_since: new Date(Date.now() - 8 * DAY) } });
      await openAllWeek(blocked.branch);
      blocked.barbershop.slug && (await blocked.barbershop.reload());
      existing = await createAppointment({ tenant: blocked, client: await createUser() });
      token = await loginAs(blocked.owner);
    });

    it('escritas do painel → 402 SUBSCRIPTION_INACTIVE; leituras continuam', async () => {
      const write = await request(app).put(`/api/services/${blocked.service.id}`).set(bearer(token)).send({ price: 99 });
      expect(write.status).toBe(402);
      expect(write.body).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE', details: { status: 'past_due', access: 'read_only' } });
      expect((await request(app).post('/api/branch').set(bearer(token)).send(branchBody(blocked.barbershop.id, 9))).status).toBe(402);
      expect((await request(app).post(`/api/barbershop/${blocked.barbershop.id}/clients`).set(bearer(token)).send({ name: 'X Y', phone: '11977776666' })).status).toBe(402);

      expect((await request(app).get(`/api/barbershop/${blocked.barbershop.id}/subscription`).set(bearer(token))).status).toBe(200);
      expect((await request(app).get('/api/appointment').set(bearer(token))).status).toBe(200);
      expect((await request(app).get('/api/payment').set(bearer(token))).status).toBe(200);
    });

    it('cobrança continua acessível (cancelar/regularizar) e exclusão para caber no plano é permitida', async () => {
      expect((await request(app).post('/api/billing/cancel').set(bearer(token)).send({ barbershop_id: blocked.barbershop.id })).status).toBe(200);
      const extra = await Barber.create({ user_id: (await createUser({ role: 'barbeiro' })).id, branch_id: blocked.branch.id });
      expect([200, 204]).toContain((await request(app).delete(`/api/barber/${extra.id}`).set(bearer(token))).status);
    });

    it('agendamento público desligado e página pública indisponível; dados preservados', async () => {
      const client = await loginAs(await createUser());
      const booking = await request(app)
        .post('/api/appointment')
        .set(bearer(client))
        .send({ branch_id: blocked.branch.id, service_id: blocked.service.id, start_at: slotAt(2, '10:00') });
      expect(booking.status).toBe(404);
      expect(booking.body.code).toBe('BARBERSHOP_UNAVAILABLE');
      const slots = await request(app).get('/api/availability').query({ branch_id: blocked.branch.id, service_id: blocked.service.id, date: slotAt(2).slice(0, 10) });
      expect(slots.status).toBe(404);
      const shop = await blocked.barbershop.reload();
      expect((await request(app).get(`/api/barbershop/slug/${shop.slug}`)).status).toBe(404);
      expect(await Appointment.findByPk(existing.id)).not.toBeNull();
    });

    it('barbeiro da casa não opera atendimento (concluir) em modo leitura', async () => {
      const barberToken = await loginAs(blocked.barberUser);
      const past = await createAppointment({ tenant: blocked, client: await createUser(), date: new Date(Date.now() - 3600000) });
      const res = await request(app).post(`/api/appointment/${past.id}/complete`).set(bearer(barberToken));
      expect(res.status).toBe(402);
    });

    it('em carência (past_due há 2 dias) tudo funciona', async () => {
      const grace = await createTenant({ subscription: { status: 'past_due', past_due_since: new Date(Date.now() - 2 * DAY) } });
      const res = await request(app).put(`/api/services/${grace.service.id}`).set(bearer(await loginAs(grace.owner))).send({ price: 45 });
      expect(res.status).toBe(200);
    });

    it('admin não é bloqueado', async () => {
      const admin = await loginAs(await createUser({ role: 'admin' }));
      expect((await request(app).put(`/api/services/${blocked.service.id}`).set(bearer(admin)).send({ price: 70 })).status).toBe(200);
    });
  });

  describe('aviso de cobrança no /api/me', () => {
    it('trial terminando em 2 dias → trial_ending; carência → past_due com dias restantes', async () => {
      const trial = await createTenant({ subscription: { trial_ends_at: new Date(Date.now() + 2 * DAY - 60000) } });
      const me = await request(app).get('/api/me').set(bearer(await loginAs(trial.owner)));
      expect(me.body.billing_banner).toMatchObject({ type: 'trial_ending', days_left: 2, barbershop_id: trial.barbershop.id });

      const late = await createTenant({ subscription: { status: 'past_due', past_due_since: new Date(Date.now() - 3 * DAY) } });
      const meLate = await request(app).get('/api/me').set(bearer(await loginAs(late.owner)));
      expect(meLate.body.billing_banner).toMatchObject({ type: 'past_due', severity: 'warning', days_left: 4 });
    });

    it('assinatura em dia → sem aviso; cliente sem barbearia → null', async () => {
      const ok = await createTenant({ subscription: { status: 'active' } });
      expect((await request(app).get('/api/me').set(bearer(await loginAs(ok.owner)))).body.billing_banner).toBeNull();
      expect((await request(app).get('/api/me').set(bearer(await loginAs(await createUser())))).body.billing_banner).toBeNull();
    });
  });

  describe('recursos por plano', () => {
    it('Essencial: lista de clientes sem estatísticas e detalhe → 402 FEATURE_NOT_IN_PLAN', async () => {
      const tenant = await createTenant({ subscription: { status: 'active', plan_code: 'essencial' } });
      const token = await loginAs(tenant.owner);
      const client = await BarbershopClient.create({ barbershop_id: tenant.barbershop.id, name: 'Cliente', phone: '+5511900001111' });
      const list = await request(app).get(`/api/barbershop/${tenant.barbershop.id}/clients`).set(bearer(token));
      expect(list.status).toBe(200);
      expect(list.body.crm).toBe(false);
      expect(list.body.items[0]).toMatchObject({ name: 'Cliente', visits: null, total_spent: null });
      const detail = await request(app).get(`/api/barbershop/${tenant.barbershop.id}/clients/${client.id}`).set(bearer(token));
      expect(detail.status).toBe(402);
      expect(detail.body).toMatchObject({ code: 'FEATURE_NOT_IN_PLAN', details: { feature: 'clients_crm', upgrade_to: 'profissional' } });
    });

    it('Essencial: dashboard sem detalhamento financeiro', async () => {
      const tenant = await createTenant({ subscription: { status: 'active', plan_code: 'essencial' } });
      const res = await request(app).get('/api/dashboard/summary').set(bearer(await loginAs(tenant.owner))).query({ barbershop_id: tenant.barbershop.id });
      expect(res.status).toBe(200);
      expect(res.body.revenue).toBeDefined();
      expect(res.body.revenue_by_barber).toBeUndefined();
      expect(res.body.locked_features).toEqual(['financial_reports']);
    });
  });

  describe('ciclo diário dos trials', () => {
    it('avisa D-3 e D-1 uma vez cada e expira no D0 com e-mail; agendamentos preservados', async () => {
      const now = new Date('2026-12-10T12:00:00Z');
      const d3 = await createTenant({ subscription: { trial_ends_at: new Date(now.getTime() + 2.5 * DAY) } });
      const d1 = await createTenant({ subscription: { trial_ends_at: new Date(now.getTime() + 0.5 * DAY) } });
      const d0 = await createTenant({ subscription: { trial_ends_at: new Date(now.getTime() - 60000) } });
      const appointment = await createAppointment({ tenant: d0, client: await createUser() });
      await Subscription.update({ status: 'active' }, { where: { status: 'trialing', barbershop_id: { [require('sequelize').Op.notIn]: [d3, d1, d0].map((t) => t.barbershop.id) } } });

      const emailsBefore = await Job.count({ where: { type: 'email.send' } });
      const stats = await accessControl.runTrialCycle(now);
      expect(stats).toEqual({ reminders: 2, expired: 1 });
      expect(await Job.count({ where: { type: 'email.send' } })).toBe(emailsBefore + 3);

      const sub = (t) => Subscription.findOne({ where: { barbershop_id: t.barbershop.id } });
      expect((await sub(d0)).status).toBe('expired');
      expect(await SubscriptionEvent.count({ where: { subscription_id: (await sub(d3)).id, type: 'trial.reminder.d3' } })).toBe(1);
      expect(await SubscriptionEvent.count({ where: { subscription_id: (await sub(d1)).id, type: 'trial.reminder.d1' } })).toBe(1);
      expect(await Appointment.findByPk(appointment.id)).not.toBeNull();

      // Rodar de novo no mesmo dia não repete e-mails.
      expect(await accessControl.runTrialCycle(now)).toEqual({ reminders: 0, expired: 0 });
    });
  });
});
