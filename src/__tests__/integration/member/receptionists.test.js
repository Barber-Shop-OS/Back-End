// BE-49: recepcionista (atendimento/balcão) — opera agenda, clientes e pagamentos presenciais só da
// filial dele; sem financeiro, gestão de filiais/barbeiros/serviços/equipe, cobrança ou configurações.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, createAppointment, loginAs, bearer, openAllWeek, slotAt, sequelize } = require('../../helpers/factories');
const { Address, Branch, Barber, BarberService, BarbershopMember } = require('../../../models');

describe('BE-49 — recepcionista', () => {
  let tenant;
  let branchY;
  let ownerToken;
  let reception;
  let receptionToken;
  let client;
  let apX;
  let apY;

  beforeAll(async () => {
    await resetDatabase();
    // Plano Essencial: recepcionista não depende do plano Rede.
    tenant = await createTenant({ subscription: { status: 'active', plan_code: 'essencial' } });
    await openAllWeek(tenant.branch);
    const address = await Address.create({ cep: '01001-000', number: 2, city: 'SP', state: 'SP' });
    branchY = await Branch.create({ name: 'Filial Y', barbershop_id: tenant.barbershop.id, address_id: address.id });
    const barberY = await Barber.create({ user_id: (await createUser({ role: 'barbeiro' })).id, branch_id: branchY.id });
    await BarberService.create({ barber_id: barberY.id, service_id: tenant.service.id });
    ownerToken = await loginAs(tenant.owner);
    reception = await createUser({ email: 'recepcao@x.com', name: 'Rita Recepção' });
    client = await createUser({ name: 'Cliente Balcão' });
    apX = await createAppointment({ tenant, client });
    apY = await createAppointment({ tenant, client, barber: barberY, branch_id: branchY.id });
  });
  afterAll(() => sequelize.close());

  it('dono adiciona recepcionista numa filial (sem plano Rede); valida filial', async () => {
    const base = `/api/barbershop/${tenant.barbershop.id}/members`;
    expect((await request(app).post(base).set(bearer(ownerToken)).send({ email: 'recepcao@x.com', role: 'receptionist' })).status).toBe(400);
    expect((await request(app).post(base).set(bearer(ownerToken)).send({ email: 'recepcao@x.com', role: 'receptionist', branch_ids: [tenant.branch.id, branchY.id] })).status).toBe(400);
    const other = await createTenant();
    expect((await request(app).post(base).set(bearer(ownerToken)).send({ email: 'recepcao@x.com', role: 'receptionist', branch_id: other.branch.id })).status).toBe(400);
    expect((await request(app).post(base).set(bearer(ownerToken)).send({ email: 'recepcao@x.com', role: 'chefe', branch_id: tenant.branch.id })).status).toBe(400);

    const res = await request(app).post(base).set(bearer(ownerToken)).send({ email: 'recepcao@x.com', role: 'receptionist', branch_id: tenant.branch.id });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ role: 'receptionist', branch_id: tenant.branch.id, branch_ids: [tenant.branch.id], user: { email: 'recepcao@x.com' } });
    expect((await request(app).post(base).set(bearer(ownerToken)).send({ email: 'recepcao@x.com', role: 'receptionist', branch_id: tenant.branch.id })).status).toBe(409);
    const list = await request(app).get(base).set(bearer(ownerToken)).query({ role: 'receptionist' });
    expect(list.body.items).toHaveLength(1);
    receptionToken = await loginAs(reception);
  });

  it('/api/me e /api/auth/me expõem o papel (roles + front_desk), sem virar área de gestão', async () => {
    for (const path of ['/api/me', '/api/auth/me']) {
      const me = await request(app).get(path).set(bearer(receptionToken));
      expect(me.status).toBe(200);
      expect(me.body.roles).toEqual(['cliente', 'receptionist']);
      expect(me.body.barbershops).toEqual([]);
      expect(me.body.front_desk).toEqual([
        expect.objectContaining({
          role: 'receptionist',
          barbershop_id: tenant.barbershop.id,
          branch_id: tenant.branch.id,
          barbershop: expect.objectContaining({ id: tenant.barbershop.id, name: tenant.barbershop.name }),
          branch: expect.objectContaining({ id: tenant.branch.id, name: tenant.branch.name }),
        }),
      ]);
    }
  });

  it('agenda: lista só a filial dele e agenda no balcão para cliente', async () => {
    const agenda = await request(app).get('/api/appointment').set(bearer(receptionToken));
    expect(agenda.status).toBe(200);
    expect(agenda.body.items.map((item) => item.id)).toEqual([apX.id]);
    expect(agenda.body.items[0].allowed_actions).toEqual(expect.arrayContaining(['cancel', 'reschedule']));

    const quick = await request(app)
      .post(`/api/barbershop/${tenant.barbershop.id}/clients`)
      .set(bearer(receptionToken))
      .send({ name: 'João Balcão', phone: '11988887777' });
    expect(quick.status).toBe(201);
    const booked = await request(app)
      .post('/api/appointment')
      .set(bearer(receptionToken))
      .send({ branch_id: tenant.branch.id, service_id: tenant.service.id, barber_id: tenant.barber.id, client_id: quick.body.client.id, start_at: slotAt(2, '11:00') });
    expect(booked.status).toBe(201);
    expect(booked.body.appointment).toMatchObject({ client_id: quick.body.client.id, branch_id: tenant.branch.id });

    const patched = await request(app).patch(`/api/barbershop/${tenant.barbershop.id}/clients/${quick.body.client.id}`).set(bearer(receptionToken)).send({ notes: 'Prefere máquina 2' });
    expect(patched.status).toBe(200);
    expect((await request(app).get(`/api/barbershop/${tenant.barbershop.id}/clients`).set(bearer(receptionToken))).status).toBe(200);

    const moved = await request(app).post(`/api/appointment/${booked.body.appointment.id}/reschedule`).set(bearer(receptionToken)).send({ start_at: slotAt(2, '15:00') });
    expect(moved.status).toBe(200);
    const cancelled = await request(app).post(`/api/appointment/${booked.body.appointment.id}/cancel`).set(bearer(receptionToken)).send({ reason: 'Cliente ligou' });
    expect(cancelled.status).toBe(200);
  });

  it('conclui, registra pagamento presencial e marca falta só na filial dele', async () => {
    const past = await createAppointment({ tenant, client, date: new Date(Date.now() - 3600000) });
    expect((await request(app).post(`/api/appointment/${past.id}/complete`).set(bearer(receptionToken))).status).toBe(200);
    const paid = await request(app).post('/api/payment').set(bearer(receptionToken)).send({ appointment_id: past.id, method: 'PIX', status: 'PENDING' });
    expect(paid.status).toBe(201);
    expect((await request(app).put(`/api/payment/${paid.body.payment ? paid.body.payment.id : paid.body.id}/status`).set(bearer(receptionToken)).send({ status: 'PAID' })).status).toBe(200);

    const missed = await createAppointment({ tenant, client, date: new Date(Date.now() - 2 * 3600000) });
    expect((await request(app).post(`/api/appointment/${missed.id}/no-show`).set(bearer(receptionToken))).status).toBe(200);

    // Filial Y (mesma barbearia) — não é dele.
    expect((await request(app).get(`/api/appointment/${apY.id}`).set(bearer(receptionToken))).status).toBe(404);
    expect((await request(app).post(`/api/appointment/${apY.id}/cancel`).set(bearer(receptionToken)).send({})).status).toBe(404);
    expect((await request(app).post('/api/payment').set(bearer(receptionToken)).send({ appointment_id: apY.id, method: 'PIX' })).status).toBe(404);
  });

  it('sem financeiro, gestão, equipe, cobrança nem configurações', async () => {
    const shop = tenant.barbershop.id;
    const denied = [
      request(app).get('/api/dashboard/summary').set(bearer(receptionToken)).query({ barbershop_id: shop }),
      request(app).get('/api/payment').set(bearer(receptionToken)),
      request(app).get(`/api/barbershop/${shop}/members`).set(bearer(receptionToken)),
      request(app).post(`/api/barbershop/${shop}/members`).set(bearer(receptionToken)).send({ email: 'x@x.com', role: 'receptionist', branch_id: tenant.branch.id }),
      request(app).put(`/api/barber/${tenant.barber.id}`).set(bearer(receptionToken)).send({ bio: 'x' }),
      request(app).post('/api/services').set(bearer(receptionToken)).send({ name: 'X', price: 1, duration: 30, barbershop_id: shop }),
      request(app).put(`/api/branch/${tenant.branch.id}/opening-hours`).set(bearer(receptionToken)).send({ opening_hours: [] }),
      request(app).put(`/api/barbershop/${shop}`).set(bearer(receptionToken)).send({ description: 'x' }),
      request(app).post('/api/billing/cancel').set(bearer(receptionToken)).send({ barbershop_id: shop }),
      request(app).get(`/api/barbershop/${shop}/subscription`).set(bearer(receptionToken)),
    ];
    for (const res of await Promise.all(denied)) expect(res.status).toBe(403);
  });

  it('recepcionista de outro tenant → 404/403', async () => {
    const other = await createTenant();
    const stranger = await createUser({ email: 'recepcao2@x.com' });
    await BarbershopMember.create({ barbershop_id: other.barbershop.id, user_id: stranger.id, role: 'receptionist', branch_ids: [other.branch.id] });
    const token = await loginAs(stranger);
    expect((await request(app).get(`/api/appointment/${apX.id}`).set(bearer(token))).status).toBe(404);
    expect((await request(app).post(`/api/appointment/${apX.id}/complete`).set(bearer(token))).status).toBe(404);
    expect((await request(app).get(`/api/barbershop/${tenant.barbershop.id}/clients`).set(bearer(token))).status).toBe(403);
    const agenda = await request(app).get('/api/appointment').set(bearer(token));
    expect(agenda.body.total).toBe(0);
  });

  it('gerente da filial adiciona/remove recepcionista só nas filiais dele', async () => {
    await tenant.barbershop.reload();
    const { Subscription } = require('../../../models');
    await Subscription.update({ plan_code: 'rede' }, { where: { barbershop_id: tenant.barbershop.id } });
    const manager = await createUser({ email: 'gerente-y@x.com' });
    await request(app).post(`/api/barbershop/${tenant.barbershop.id}/members`).set(bearer(ownerToken)).send({ email: 'gerente-y@x.com', branch_ids: [branchY.id] }).expect(201);
    const managerToken = await loginAs(manager);
    const base = `/api/barbershop/${tenant.barbershop.id}/members`;
    await createUser({ email: 'recepcao-y@x.com' });
    await createUser({ email: 'recepcao-x@x.com' });
    expect((await request(app).post(base).set(bearer(managerToken)).send({ email: 'recepcao-x@x.com', role: 'receptionist', branch_id: tenant.branch.id })).status).toBe(403);
    const added = await request(app).post(base).set(bearer(managerToken)).send({ email: 'recepcao-y@x.com', role: 'receptionist', branch_id: branchY.id });
    expect(added.status).toBe(201);

    const visible = await request(app).get(base).set(bearer(managerToken));
    expect(visible.body.items.map((item) => item.user.email)).toEqual(['recepcao-y@x.com']);
    // Recepcionista da filial X não é visível nem editável pelo gerente da Y.
    const xMember = await BarbershopMember.findOne({ where: { user_id: reception.id } });
    expect((await request(app).delete(`${base}/${xMember.id}`).set(bearer(managerToken))).status).toBe(404);
    expect((await request(app).patch(`${base}/${added.body.member.id}`).set(bearer(managerToken)).send({ branch_id: tenant.branch.id })).status).toBe(403);
    expect((await request(app).delete(`${base}/${added.body.member.id}`).set(bearer(managerToken))).status).toBe(204);

    // Dono move a recepcionista X para a filial Y: o acesso muda na hora.
    const moved = await request(app).patch(`${base}/${xMember.id}`).set(bearer(ownerToken)).send({ branch_id: branchY.id });
    expect(moved.status).toBe(200);
    expect(moved.body.member.branch_id).toBe(branchY.id);
    expect((await request(app).get(`/api/appointment/${apY.id}`).set(bearer(receptionToken))).status).toBe(200);
    expect((await request(app).get(`/api/appointment/${apX.id}`).set(bearer(receptionToken))).status).toBe(404);
  });
});
