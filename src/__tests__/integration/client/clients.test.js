// BE-23: clientes da barbearia — cliente rápido sem conta, busca por telefone parcial, estatísticas,
// histórico, vínculo com conta e isolamento estrito entre tenants.
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
  DEFAULT_PASSWORD,
} = require('../../helpers/factories');
const { BarbershopClient, Appointment, Payment, User } = require('../../../models');
const clientService = require('../../../modules/client/clientService');

describe('BE-23 — clientes da barbearia', () => {
  let a;
  let b;
  let tokens;
  let outsiderBarber;

  const base = (tenant) => `/api/barbershop/${tenant.barbershop.id}/clients`;

  beforeAll(async () => {
    await resetDatabase();
    a = await createTenant({ name: 'Navalha A' });
    b = await createTenant({ name: 'Navalha B' });
    await openAllWeek(a.branch);
    outsiderBarber = await createUser({ role: 'barbeiro' });
    tokens = {
      ownerA: await loginAs(a.owner),
      ownerB: await loginAs(b.owner),
      barberA: await loginAs(a.barberUser),
      barberB: await loginAs(b.barberUser),
      outsiderBarber: await loginAs(outsiderBarber),
      admin: await loginAs(await createUser({ role: 'admin' })),
    };
  });

  afterAll(() => sequelize.close());

  describe('POST /clients (cliente rápido)', () => {
    it('cria sem conta, normaliza telefone e e-mail', async () => {
      const res = await request(app)
        .post(base(a))
        .set(bearer(tokens.barberA))
        .send({ name: '  João Balcão ', phone: '(11) 98888-7777', email: 'JOAO@Mail.com', notes: 'Máquina 2' });
      expect(res.status).toBe(201);
      expect(res.body.client).toMatchObject({
        name: 'João Balcão',
        phone: '+5511988887777',
        email: 'joao@mail.com',
        has_account: false,
        visits: 0,
        total_spent: '0.00',
      });
    });

    it('telefone repetido na mesma barbearia → 409 com o id existente; em outra barbearia pode', async () => {
      const dup = await request(app).post(base(a)).set(bearer(tokens.ownerA)).send({ name: 'Outro', phone: '11988887777' });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('CLIENT_ALREADY_EXISTS');
      expect(dup.body.details.client_id).toEqual(expect.any(Number));
      const other = await request(app).post(base(b)).set(bearer(tokens.ownerB)).send({ name: 'João em B', phone: '11988887777' });
      expect(other.status).toBe(201);
    });

    it('validação: sem telefone → 400; telefone inválido → 400; campo extra → 400', async () => {
      expect((await request(app).post(base(a)).set(bearer(tokens.ownerA)).send({ name: 'Sem Fone' })).status).toBe(400);
      expect((await request(app).post(base(a)).set(bearer(tokens.ownerA)).send({ name: 'Fone', phone: '12' })).status).toBe(400);
      expect(
        (await request(app).post(base(a)).set(bearer(tokens.ownerA)).send({ name: 'X Y', phone: '11977776666', barbershop_id: b.barbershop.id })).status
      ).toBe(400);
    });

    it('com e-mail de conta existente, nasce vinculado', async () => {
      const user = await createUser({ email: 'conta@cliente.com', name: 'Maria Conta' });
      const res = await request(app).post(base(a)).set(bearer(tokens.ownerA)).send({ name: 'Maria', phone: '11955554444', email: 'conta@cliente.com' });
      expect(res.status).toBe(201);
      expect(res.body.client).toMatchObject({ user_id: user.id, has_account: true });
    });
  });

  describe('autorização', () => {
    it('barbearia de outro dono → 403; barbeiro de outra barbearia → 403; inexistente → 404; cliente → 403', async () => {
      expect((await request(app).get(base(a)).set(bearer(tokens.ownerB))).status).toBe(403);
      expect((await request(app).get(base(a)).set(bearer(tokens.barberB))).status).toBe(403);
      expect((await request(app).get(base(a)).set(bearer(tokens.outsiderBarber))).status).toBe(403);
      expect((await request(app).get('/api/barbershop/999999/clients').set(bearer(tokens.ownerA))).status).toBe(404);
      const clientToken = await loginAs(await createUser());
      expect((await request(app).get(base(a)).set(bearer(clientToken))).status).toBe(403);
      expect((await request(app).get(base(a))).status).toBe(401);
    });

    it('cliente de A não aparece nem é acessível por B', async () => {
      const clientA = await BarbershopClient.findOne({ where: { barbershop_id: a.barbershop.id, name: 'João Balcão' } });
      const list = await request(app).get(base(b)).set(bearer(tokens.ownerB));
      expect(list.body.items.map((item) => item.id)).not.toContain(clientA.id);
      // Mesmo id, barbearia errada → 404.
      expect((await request(app).get(`${base(b)}/${clientA.id}`).set(bearer(tokens.ownerB))).status).toBe(404);
      expect((await request(app).patch(`${base(b)}/${clientA.id}`).set(bearer(tokens.ownerB)).send({ notes: 'x' })).status).toBe(404);
      expect((await request(app).get(`${base(a)}/${clientA.id}`).set(bearer(tokens.admin))).status).toBe(200);
    });
  });

  describe('agendamento de balcão com client_id', () => {
    it('barbeiro agenda para cliente rápido; agendamento sem user_id e com client_id', async () => {
      const quick = await BarbershopClient.findOne({ where: { barbershop_id: a.barbershop.id, name: 'João Balcão' } });
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(tokens.barberA))
        .send({ branch_id: a.branch.id, service_id: a.service.id, barber_id: a.barber.id, start_at: slotAt(2, '10:00'), client_id: quick.id, source: 'balcao' });
      expect(res.status).toBe(201);
      expect(res.body.appointment.user_id).toBeNull();
      expect(res.body.appointment.client_id).toBe(quick.id);
      expect(res.body.appointment.customer).toMatchObject({ id: quick.id, name: 'João Balcão' });
    });

    it('client_id de outra barbearia → 404', async () => {
      const other = await BarbershopClient.findOne({ where: { barbershop_id: b.barbershop.id } });
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(tokens.ownerA))
        .send({ branch_id: a.branch.id, service_id: a.service.id, barber_id: a.barber.id, start_at: slotAt(2, '11:00'), client_id: other.id });
      expect(res.status).toBe(404);
    });

    it('equipe sem client_id nem user_id → 400', async () => {
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(tokens.ownerA))
        .send({ branch_id: a.branch.id, service_id: a.service.id, barber_id: a.barber.id, start_at: slotAt(2, '12:00') });
      expect(res.status).toBe(400);
    });

    it('cliente com conta agendando cria (ou reaproveita) o cliente da barbearia', async () => {
      const user = await createUser({ name: 'Pedro Online' });
      const token = await loginAs(user);
      const book = (hhmm) =>
        request(app)
          .post('/api/appointment')
          .set(bearer(token))
          .send({ branch_id: a.branch.id, service_id: a.service.id, barber_id: a.barber.id, start_at: slotAt(3, hhmm) });
      const first = await book('10:00');
      expect(first.status).toBe(201);
      const second = await book('11:00');
      expect(second.status).toBe(201);
      expect(first.body.appointment.client_id).toEqual(expect.any(Number));
      expect(first.body.appointment.client_id).toBe(second.body.appointment.client_id);
      expect(await BarbershopClient.count({ where: { barbershop_id: a.barbershop.id, user_id: user.id } })).toBe(1);
    });

    it('cliente rápido é vinculado quando a pessoa cria conta com o mesmo e-mail', async () => {
      const created = await request(app).post(base(a)).set(bearer(tokens.ownerA)).send({ name: 'Ana Balcão', phone: '11944443333', email: 'ana@balcao.com' });
      expect(created.body.client.has_account).toBe(false);
      const reg = await request(app).post('/api/auth/register').send({ name: 'Ana', email: 'ana@balcao.com', password: DEFAULT_PASSWORD });
      expect(reg.status).toBe(201);
      const user = await User.findOne({ where: { email: 'ana@balcao.com' } });
      // BE-27: antes de confirmar o e-mail, nada é vinculado.
      expect((await BarbershopClient.findByPk(created.body.client.id)).user_id).toBeNull();
      await require('../../../modules/auth/emailVerificationService').verify(
        require('../../../shared/mailer').outbox().map((mail) => /verify-email\?token=([A-Za-z0-9_-]+)/.exec(mail.html)).filter(Boolean).pop()[1]
      );
      const linked = await BarbershopClient.findByPk(created.body.client.id);
      expect(linked.user_id).toBe(user.id);
    });

    it('ensureForUser vincula cliente rápido pelo telefone em vez de duplicar', async () => {
      const user = await createUser({ name: 'Carlos' });
      await user.update({ phone: '+5511933332222' });
      const quick = await BarbershopClient.create({ barbershop_id: a.barbershop.id, name: 'Carlos Balcão', phone: '+5511933332222' });
      const ensured = await clientService.ensureForUser(a.barbershop.id, user.id);
      expect(ensured.id).toBe(quick.id);
      expect(ensured.user_id).toBe(user.id);
    });
  });

  describe('listagem, busca e estatísticas', () => {
    let vip;

    beforeAll(async () => {
      vip = await BarbershopClient.create({ barbershop_id: a.barbershop.id, name: 'Zeca VIP', phone: '+5521912345678' });
      const someone = await createUser();
      const past = (days) => new Date(Date.now() - days * 86400000);
      const done1 = await createAppointment({ tenant: a, client: someone, date: past(10), status: 'concluido', client_id: vip.id });
      const done2 = await createAppointment({ tenant: a, client: someone, date: past(3), status: 'concluido', client_id: vip.id });
      await createAppointment({ tenant: a, client: someone, date: past(5), status: 'nao_compareceu', client_id: vip.id });
      await Payment.create({ appointment_id: done1.id, amount: 50, method: 'PIX', status: 'PAID' });
      await Payment.create({ appointment_id: done2.id, amount: 30.5, method: 'CASH', status: 'PAID' });
      vip.lastVisit = done2.start_at;
    });

    it('busca por telefone parcial', async () => {
      const res = await request(app).get(base(a)).set(bearer(tokens.ownerA)).query({ search: '12345' });
      expect(res.status).toBe(200);
      expect(res.body.items.map((item) => item.name)).toEqual(['Zeca VIP']);
    });

    it('busca por nome e por e-mail; curinga do LIKE é literal', async () => {
      const byName = await request(app).get(base(a)).set(bearer(tokens.ownerA)).query({ search: 'balcão' });
      expect(byName.body.items.map((item) => item.name)).toEqual(expect.arrayContaining(['João Balcão', 'Ana Balcão']));
      const byEmail = await request(app).get(base(a)).set(bearer(tokens.ownerA)).query({ search: 'joao@mail' });
      expect(byEmail.body.items).toHaveLength(1);
      const wildcard = await request(app).get(base(a)).set(bearer(tokens.ownerA)).query({ search: '%' });
      expect(wildcard.body.total).toBe(0);
    });

    it('estatísticas: visitas, faltas, última visita e total gasto', async () => {
      const res = await request(app).get(base(a)).set(bearer(tokens.ownerA)).query({ sortBy: 'total_spent' });
      expect(res.body.items[0]).toMatchObject({
        id: vip.id,
        visits: 2,
        no_shows: 1,
        total_spent: '80.50',
        last_visit: new Date(vip.lastVisit).toISOString(),
      });
    });

    it('detalhe com histórico e pagamentos', async () => {
      const res = await request(app).get(`${base(a)}/${vip.id}`).set(bearer(tokens.barberA));
      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(3);
      expect(res.body.history[0].status).toBe('concluido');
      expect(res.body.history[0].payment).toMatchObject({ method: 'CASH', status: 'PAID' });
      expect(res.body.history[0].barber).toMatchObject({ id: a.barber.id });
    });

    it('PATCH atualiza observações e recusa telefone de outro cliente', async () => {
      const ok = await request(app).patch(`${base(a)}/${vip.id}`).set(bearer(tokens.ownerA)).send({ notes: 'Cliente desde 2020' });
      expect(ok.status).toBe(200);
      expect(ok.body.client.notes).toBe('Cliente desde 2020');
      const dup = await request(app).patch(`${base(a)}/${vip.id}`).set(bearer(tokens.ownerA)).send({ phone: '11988887777' });
      expect(dup.status).toBe(409);
    });

    it('paginação', async () => {
      const res = await request(app).get(base(a)).set(bearer(tokens.ownerA)).query({ pageSize: 2, page: 1 });
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBeGreaterThan(2);
    });
  });

  it('agendamentos do cliente rápido não aparecem para nenhum usuário-cliente', async () => {
    const quickAppointments = await Appointment.count({ where: { user_id: null } });
    expect(quickAppointments).toBeGreaterThan(0);
    const anyClient = await loginAs(await createUser());
    const res = await request(app).get('/api/appointment').set(bearer(anyClient));
    expect(res.body.total).toBe(0);
  });
});
