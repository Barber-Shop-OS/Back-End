// SEC-21: agendar online exige e-mail verificado OU telefone; a barbearia pode bloquear um cliente.
jest.setTimeout(120000);

const { app, request, resetDatabase, createUser, loginAs, bearer, createTenant, openAllWeek, slotAt, sequelize } = require('../../helpers/factories');
const { BarbershopMember } = require('../../../models');

describe('SEC-21 — abuso da agenda pública', () => {
  let tenant;
  let ownerToken;

  const book = (token, hhmm, days = 4) =>
    request(app)
      .post('/api/appointment')
      .set(bearer(token))
      .send({ branch_id: tenant.branch.id, service_id: tenant.service.id, start_at: slotAt(days, hhmm) });

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant();
    await openAllWeek(tenant.branch);
    ownerToken = await loginAs(tenant.owner);
  });
  afterAll(() => sequelize.close());

  it('sem e-mail verificado e sem telefone → 403 CONTACT_REQUIRED; com telefone agenda', async () => {
    const user = await createUser({ verified: false });
    const token = await loginAs(user);
    const blocked = await book(token, '09:00');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('CONTACT_REQUIRED');

    await user.update({ phone: '11999990000' });
    expect((await book(token, '09:00')).status).toBe(201);
  });

  it('e-mail verificado basta (sem telefone)', async () => {
    const token = await loginAs(await createUser());
    expect((await book(token, '10:00')).status).toBe(201);
  });

  it('dono bloqueia o cliente: ele não agenda online; desbloqueado volta a agendar', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const first = await book(token, '11:00');
    expect(first.status).toBe(201);
    const clientId = first.body.appointment.client_id;

    const blockRes = await request(app)
      .patch(`/api/barbershop/${tenant.barbershop.id}/clients/${clientId}`)
      .set(bearer(ownerToken))
      .send({ blocked: true, blocked_reason: 'Faltas recorrentes' });
    expect(blockRes.status).toBe(200);
    expect(blockRes.body.client).toMatchObject({ blocked: true, blocked_reason: 'Faltas recorrentes' });

    const denied = await book(token, '11:30');
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('CLIENT_BLOCKED');

    // A equipe ainda agenda para ele no balcão.
    const counter = await request(app)
      .post('/api/appointment')
      .set(bearer(ownerToken))
      .send({ branch_id: tenant.branch.id, service_id: tenant.service.id, start_at: slotAt(4, '12:00'), client_id: clientId, source: 'balcao' });
    expect(counter.status).toBe(201);

    await request(app).patch(`/api/barbershop/${tenant.barbershop.id}/clients/${clientId}`).set(bearer(ownerToken)).send({ blocked: false });
    expect((await book(token, '13:00')).status).toBe(201);
  });

  it('recepcionista e barbeiro não bloqueiam clientes', async () => {
    const user = await createUser();
    const res = await book(await loginAs(user), '14:00');
    const clientId = res.body.appointment.client_id;
    const receptionist = await createUser({ email: 'recep-sec21@test.com' });
    await BarbershopMember.create({ barbershop_id: tenant.barbershop.id, user_id: receptionist.id, role: 'receptionist', branch_ids: [tenant.branch.id] });
    for (const staff of [receptionist, tenant.barberUser]) {
      const attempt = await request(app)
        .patch(`/api/barbershop/${tenant.barbershop.id}/clients/${clientId}`)
        .set(bearer(await loginAs(staff)))
        .send({ blocked: true });
      expect(attempt.status).toBe(403);
    }
  });
});
