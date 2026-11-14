// SEC-23: mass assignment em TODAS as rotas de escrita. Cada caso envia campos que o cliente nunca
// pode controlar, com um usuário que TEM permissão na rota, e confere que nada disso foi gravado.
// Aceita duas respostas seguras: 400 (campo recusado) ou 2xx com o campo ignorado.
const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  createAppointment,
  loginAs,
  bearer,
  sequelize,
} = require('../helpers/factories');
const { User, Barbershop, Branch, Barber, Service, Appointment, Payment, Address } = require('../../models');

const LONG_AGO = '2000-01-01T00:00:00.000Z';
const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const address = { cep: '01001-000', number: 10, city: 'São Paulo', state: 'SP' };

describe('SEC-23 — mass assignment', () => {
  let tenant;
  let other;
  let ownerToken;
  let client;
  let clientToken;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    other = await createTenant();
    ownerToken = await loginAs(tenant.owner);
    client = await createUser();
    clientToken = await loginAs(client);
  });

  afterAll(() => sequelize.close());

  const expectSafe = (res) => {
    expect([200, 201, 204, 400]).toContain(res.status);
    return res.status < 300;
  };

  it('POST /api/auth/register: role, token_version, id e created_at são ignorados', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Novo',
      email: 'novo@x.com',
      password: 'Tesoura#Navalha9',
      role: 'admin',
      token_version: 99,
      id: 424242,
      created_at: LONG_AGO,
    });
    expectSafe(res);
    const user = await User.findOne({ where: { email: 'novo@x.com' } });
    if (user) {
      expect(user.role).toBe('cliente');
      expect(user.token_version).toBe(0);
      expect(user.id).not.toBe(424242);
      expect(new Date(user.created_at).getFullYear()).toBeGreaterThan(2000);
    }
  });

  it.each(['put', 'patch'])('%s /api/user/:id: role/password/token_version/id recusados', async (method) => {
    const res = await request(app)[method](`/api/user/${client.id}`)
      .set(bearer(clientToken))
      .send({ name: 'Ok', role: 'admin', password: 'x', token_version: 5, id: 999, created_at: LONG_AGO });
    expect(res.status).toBe(400);
    const fresh = await User.findByPk(client.id);
    expect(fresh.role).toBe('cliente');
    expect(fresh.token_version).toBe(0);
    expect(fresh.name).not.toBe('Ok');
  });

  it('POST /api/barbershop: owner_id e id do body são ignorados', async () => {
    const res = await request(app)
      .post('/api/barbershop')
      .set(bearer(ownerToken))
      .send({ name: 'Minha Nova', owner_id: other.owner.id, id: 777777 });
    expectSafe(res);
    const shop = await Barbershop.findOne({ where: { name: 'Minha Nova' } });
    if (shop) {
      expect(shop.owner_id).toBe(tenant.owner.id);
      expect(shop.id).not.toBe(777777);
    }
  });

  it('PUT /api/barbershop/:id: owner_id, id e created_at recusados', async () => {
    const res = await request(app)
      .put(`/api/barbershop/${tenant.barbershop.id}`)
      .set(bearer(ownerToken))
      .send({ name: 'Renomeada', owner_id: other.owner.id, created_at: LONG_AGO });
    expect(res.status).toBe(400);
    const shop = await Barbershop.findByPk(tenant.barbershop.id);
    expect(shop.owner_id).toBe(tenant.owner.id);
  });

  it('POST /api/branch: address_id e id do body são ignorados', async () => {
    const res = await request(app)
      .post('/api/branch')
      .set(bearer(ownerToken))
      .send({ name: 'Filial Nova', barbershop_id: tenant.barbershop.id, address_id: other.address.id, id: 888888, ...address });
    expectSafe(res);
    const branch = await Branch.findOne({ where: { name: 'Filial Nova' } });
    if (branch) {
      expect(branch.address_id).not.toBe(other.address.id);
      expect(branch.id).not.toBe(888888);
    }
  });

  it('PUT /api/branch/:id: barbershop_id e address_id recusados', async () => {
    const res = await request(app)
      .put(`/api/branch/${tenant.branch.id}`)
      .set(bearer(ownerToken))
      .send({ name: 'Ok', barbershop_id: other.barbershop.id, address_id: other.address.id });
    expect(res.status).toBe(400);
    const branch = await Branch.findByPk(tenant.branch.id);
    expect(branch.barbershop_id).toBe(tenant.barbershop.id);
    expect(branch.address_id).toBe(tenant.address.id);
  });

  it('POST /api/barber: id e created_at do body são ignorados', async () => {
    const person = await createUser();
    const res = await request(app)
      .post('/api/barber')
      .set(bearer(ownerToken))
      .send({ user_id: person.id, branch_id: tenant.branch.id, bio: 'Bio', id: 555555, created_at: LONG_AGO });
    expectSafe(res);
    const barber = await Barber.findOne({ where: { user_id: person.id } });
    if (barber) {
      expect(barber.id).not.toBe(555555);
      expect(new Date(barber.created_at).getFullYear()).toBeGreaterThan(2000);
    }
  });

  it('PUT /api/barber/:id: user_id e id recusados', async () => {
    const res = await request(app)
      .put(`/api/barber/${tenant.barber.id}`)
      .set(bearer(ownerToken))
      .send({ bio: 'Ok', user_id: client.id, id: 1234 });
    expect(res.status).toBe(400);
    expect((await Barber.findByPk(tenant.barber.id)).user_id).toBe(tenant.barberUser.id);
  });

  it('POST /api/services: id e created_at do body são ignorados', async () => {
    const res = await request(app)
      .post('/api/services')
      .set(bearer(ownerToken))
      .send({ name: 'Pezinho', description: 'Acabamento', price: 15, duration: 15, barbershop_id: tenant.barbershop.id, id: 666666, created_at: LONG_AGO });
    expectSafe(res);
    const service = await Service.findOne({ where: { name: 'Pezinho' } });
    if (service) expect(service.id).not.toBe(666666);
  });

  it('PUT /api/services/:id: barbershop_id e id recusados', async () => {
    const res = await request(app)
      .put(`/api/services/${tenant.service.id}`)
      .set(bearer(ownerToken))
      .send({ price: 10, barbershop_id: other.barbershop.id });
    expect(res.status).toBe(400);
    const service = await Service.findByPk(tenant.service.id);
    expect(service.barbershop_id).toBe(tenant.barbershop.id);
    expect(Number(service.price)).toBe(50);
  });

  it('POST /api/address: id do body é ignorado', async () => {
    const res = await request(app).post('/api/address').set(bearer(ownerToken)).send({ ...address, id: 999999 });
    expectSafe(res);
    expect(await Address.findByPk(999999)).toBeNull();
  });

  it('PUT /api/address/:id: id recusado', async () => {
    const res = await request(app)
      .put(`/api/address/${tenant.address.id}`)
      .set(bearer(ownerToken))
      .send({ city: 'Campinas', id: 999999 });
    expect(res.status).toBe(400);
    expect((await Address.findByPk(tenant.address.id)).city).toBe('São Paulo');
  });

  it('POST /api/appointment: status, created_at e id são ignorados; user_id de terceiro ignorado para cliente', async () => {
    const res = await request(app)
      .post('/api/appointment')
      .set(bearer(clientToken))
      .send({
        barber_id: tenant.barber.id,
        service_id: tenant.service.id,
        branch_id: tenant.branch.id,
        appointment_date: inDays(2),
        user_id: tenant.owner.id,
        status: 'cancelado',
        created_at: LONG_AGO,
        id: 313131,
      });
    expectSafe(res);
    const appointment = await Appointment.findOne({ where: { barber_id: tenant.barber.id } });
    expect(appointment.user_id).toBe(client.id);
    expect(appointment.status).toBe('confirmado');
    expect(appointment.id).not.toBe(313131);
  });

  it('PUT /api/appointment/:id: só status muda; barbeiro, filial, cliente e data ficam', async () => {
    const appointment = await createAppointment({ tenant, client });
    const originalDate = new Date(appointment.start_at).getTime();
    const res = await request(app)
      .put(`/api/appointment/${appointment.id}`)
      .set(bearer(ownerToken))
      .send({
        status: 'concluido',
        user_id: other.owner.id,
        barber_id: other.barber.id,
        branch_id: other.branch.id,
        start_at: inDays(30),
      });
    expectSafe(res);
    const fresh = await Appointment.findByPk(appointment.id);
    expect(fresh.user_id).toBe(client.id);
    expect(fresh.barber_id).toBe(tenant.barber.id);
    expect(fresh.branch_id).toBe(tenant.branch.id);
    expect(new Date(fresh.start_at).getTime()).toBe(originalDate);
  });

  it('POST /api/payment: status, paid_at e transaction_id do body são ignorados', async () => {
    const appointment = await createAppointment({ tenant, client });
    const res = await request(app)
      .post('/api/payment')
      .set(bearer(ownerToken))
      .send({ appointment_id: appointment.id, amount: 50, method: 'PIX', status: 'PAID', paid_at: LONG_AGO, transaction_id: 'forjado' });
    expectSafe(res);
    const payment = await Payment.findOne({ where: { appointment_id: appointment.id } });
    expect(payment.status).toBe('PENDING');
    expect(payment.paid_at).toBeNull();
    expect(payment.transaction_id).toBeNull();
  });

  it('PUT /api/payment/:id/status: valor e agendamento não mudam', async () => {
    const appointment = await createAppointment({ tenant, client });
    const payment = await Payment.create({ appointment_id: appointment.id, amount: 50, method: 'PIX' });
    const res = await request(app)
      .put(`/api/payment/${payment.id}/status`)
      .set(bearer(ownerToken))
      .send({ status: 'PAID', amount: 0.01, appointment_id: 999, method: 'CASH' });
    expectSafe(res);
    const fresh = await Payment.findByPk(payment.id);
    expect(Number(fresh.amount)).toBe(50);
    expect(fresh.appointment_id).toBe(appointment.id);
    expect(fresh.method).toBe('PIX');
  });

  it('PATCH /api/admin/users/:id/role: token_version e outros campos não são aceitos junto', async () => {
    const adminToken = await loginAs(await createUser({ role: 'admin' }));
    const res = await request(app)
      .patch(`/api/admin/users/${client.id}/role`)
      .set(bearer(adminToken))
      .send({ role: 'owner', email: 'trocado@x.com', password: 'x' });
    expectSafe(res);
    const fresh = await User.findByPk(client.id);
    expect(fresh.email).not.toBe('trocado@x.com');
  });
});
