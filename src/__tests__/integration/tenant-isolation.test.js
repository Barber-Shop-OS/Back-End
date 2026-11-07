// BE-03 / SEC-03 (+ parte de SEC-02): isolamento entre barbearias (tenants).
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
const { Barbershop, Branch, Barber, Service, Address, Payment } = require('../../models');

describe('BE-03 — isolamento entre tenants', () => {
  let a; // tenant do atacante
  let b; // tenant vítima
  let ownerA;
  let ownerB;
  let admin;
  let client;
  let clientToken;

  beforeEach(async () => {
    await resetDatabase();
    a = await createTenant({ name: 'Barbearia A' });
    b = await createTenant({ name: 'Barbearia B' });
    ownerA = await loginAs(a.owner);
    ownerB = await loginAs(b.owner);
    admin = await loginAs(await createUser({ role: 'admin' }));
    client = await createUser();
    clientToken = await loginAs(client);
  });

  afterAll(() => sequelize.close());

  describe('barbearia', () => {
    it('dono A não edita a barbearia B (403) e nada muda', async () => {
      const res = await request(app)
        .put(`/api/barbershop/${b.barbershop.id}`)
        .set(bearer(ownerA))
        .send({ name: 'Tomada' });
      expect(res.status).toBe(403);
      expect((await Barbershop.findByPk(b.barbershop.id)).name).toBe('Barbearia B');
    });

    it('dono não transfere a própria barbearia via owner_id (400)', async () => {
      const res = await request(app)
        .put(`/api/barbershop/${a.barbershop.id}`)
        .set(bearer(ownerA))
        .send({ owner_id: b.owner.id });
      expect(res.status).toBe(400);
      expect((await Barbershop.findByPk(a.barbershop.id)).owner_id).toBe(a.owner.id);
    });

    it('dono renomeia a própria barbearia', async () => {
      const res = await request(app)
        .put(`/api/barbershop/${a.barbershop.id}`)
        .set(bearer(ownerA))
        .send({ name: 'Barbearia A Nova' });
      expect(res.status).toBe(200);
      expect(res.body.barbershop.name).toBe('Barbearia A Nova');
    });

    it('admin edita qualquer barbearia', async () => {
      const res = await request(app)
        .put(`/api/barbershop/${b.barbershop.id}`)
        .set(bearer(admin))
        .send({ name: 'Ajuste do suporte' });
      expect(res.status).toBe(200);
    });
  });

  describe('filial', () => {
    const address = { cep: '01001-000', number: 10, city: 'São Paulo', state: 'SP' };

    it('dono A não cria filial na barbearia B (403) e não sobra endereço órfão', async () => {
      const before = await Address.count();
      const res = await request(app)
        .post('/api/branch')
        .set(bearer(ownerA))
        .send({ name: 'Invasora', barbershop_id: b.barbershop.id, ...address });
      expect(res.status).toBe(403);
      expect(await Address.count()).toBe(before);
    });

    it('dono A não edita nem exclui filial de B (403)', async () => {
      const put = await request(app).put(`/api/branch/${b.branch.id}`).set(bearer(ownerA)).send({ name: 'Invasão' });
      const del = await request(app).delete(`/api/branch/${b.branch.id}`).set(bearer(ownerA));
      expect(put.status).toBe(403);
      expect(del.status).toBe(403);
      expect(await Branch.findByPk(b.branch.id)).not.toBeNull();
    });

    it('dono não move a própria filial para outra barbearia (400)', async () => {
      const res = await request(app)
        .put(`/api/branch/${a.branch.id}`)
        .set(bearer(ownerA))
        .send({ barbershop_id: b.barbershop.id });
      expect(res.status).toBe(400);
      expect((await Branch.findByPk(a.branch.id)).barbershop_id).toBe(a.barbershop.id);
    });

    it('dono não aponta a filial para o endereço de outra (400)', async () => {
      const res = await request(app)
        .put(`/api/branch/${a.branch.id}`)
        .set(bearer(ownerA))
        .send({ address_id: b.address.id });
      expect(res.status).toBe(400);
      expect((await Branch.findByPk(a.branch.id)).address_id).toBe(a.address.id);
    });

    it('dono edita nome e endereço da própria filial', async () => {
      const res = await request(app)
        .put(`/api/branch/${a.branch.id}`)
        .set(bearer(ownerA))
        .send({ name: 'Centro', city: 'Campinas', state: 'sp' });
      expect(res.status).toBe(200);
      expect(res.body.branch.name).toBe('Centro');
      expect(res.body.branch.Address.city).toBe('Campinas');
      expect(res.body.branch.Address.state).toBe('SP');
    });
  });

  describe('barbeiro', () => {
    it('dono A não cadastra barbeiro na filial de B (403)', async () => {
      const someone = await createUser();
      const res = await request(app)
        .post('/api/barber')
        .set(bearer(ownerA))
        .send({ user_id: someone.id, branch_id: b.branch.id, bio: 'Infiltrado' });
      expect(res.status).toBe(403);
    });

    it('dono A não edita nem exclui barbeiro de B (403)', async () => {
      const put = await request(app).put(`/api/barber/${b.barber.id}`).set(bearer(ownerA)).send({ bio: 'Alterada' });
      const del = await request(app).delete(`/api/barber/${b.barber.id}`).set(bearer(ownerA));
      expect(put.status).toBe(403);
      expect(del.status).toBe(403);
      const barber = await Barber.findByPk(b.barber.id);
      expect(barber.bio).toBe('Especialista');
    });

    it('dono A não puxa o barbeiro de B para a própria filial (403)', async () => {
      const res = await request(app)
        .put(`/api/barber/${b.barber.id}`)
        .set(bearer(ownerA))
        .send({ branch_id: a.branch.id });
      expect(res.status).toBe(403);
    });

    it('dono não troca o usuário vinculado ao barbeiro (400)', async () => {
      const other = await createUser();
      const res = await request(app)
        .put(`/api/barber/${a.barber.id}`)
        .set(bearer(ownerA))
        .send({ user_id: other.id });
      expect(res.status).toBe(400);
    });

    it('dono não transfere barbeiro para filial de outra barbearia', async () => {
      const res = await request(app)
        .put(`/api/barber/${a.barber.id}`)
        .set(bearer(ownerA))
        .send({ branch_id: b.branch.id });
      expect(res.status).toBe(403);
      expect((await Barber.findByPk(a.barber.id)).branch_id).toBe(a.branch.id);
    });

    it('dono edita a bio do próprio barbeiro', async () => {
      const res = await request(app).put(`/api/barber/${a.barber.id}`).set(bearer(ownerA)).send({ bio: 'Degradê' });
      expect(res.status).toBe(200);
      expect(res.body.barber.bio).toBe('Degradê');
    });
  });

  describe('serviço', () => {
    it('dono A não cria serviço na barbearia B (403)', async () => {
      const res = await request(app)
        .post('/api/services')
        .set(bearer(ownerA))
        .send({ name: 'Falso', description: 'x', price: 1, duration: 30, barbershop_id: b.barbershop.id });
      expect(res.status).toBe(403);
    });

    it('dono A não altera preço nem exclui serviço de B (403)', async () => {
      const put = await request(app).put(`/api/services/${b.service.id}`).set(bearer(ownerA)).send({ price: 1 });
      const del = await request(app).delete(`/api/services/${b.service.id}`).set(bearer(ownerA));
      expect(put.status).toBe(403);
      expect(del.status).toBe(403);
      expect(Number((await Service.findByPk(b.service.id)).price)).toBe(50);
    });

    it('dono não move serviço para outra barbearia (400)', async () => {
      const res = await request(app)
        .put(`/api/services/${a.service.id}`)
        .set(bearer(ownerA))
        .send({ barbershop_id: b.barbershop.id });
      expect(res.status).toBe(400);
    });

    it('dono altera preço do próprio serviço', async () => {
      const res = await request(app).put(`/api/services/${a.service.id}`).set(bearer(ownerA)).send({ price: 65 });
      expect(res.status).toBe(200);
      expect(Number(res.body.service.price)).toBe(65);
    });
  });

  describe('endereço', () => {
    it('dono A não lê nem edita endereço da filial de B (404)', async () => {
      const get = await request(app).get(`/api/address/${b.address.id}`).set(bearer(ownerA));
      const put = await request(app)
        .put(`/api/address/${b.address.id}`)
        .set(bearer(ownerA))
        .send({ cep: '20000000', number: 1, city: 'Rio', state: 'RJ' });
      expect(get.status).toBe(404);
      expect(put.status).toBe(404);
      expect((await Address.findByPk(b.address.id)).city).toBe('São Paulo');
    });

    it('cliente não lê endereço por id (404)', async () => {
      const res = await request(app).get(`/api/address/${a.address.id}`).set(bearer(clientToken));
      expect(res.status).toBe(404);
    });

    it('dono lê o endereço da própria filial', async () => {
      const res = await request(app).get(`/api/address/${a.address.id}`).set(bearer(ownerA));
      expect(res.status).toBe(200);
    });
  });

  describe('pagamento (SEC-02)', () => {
    let appointmentB;
    let paymentB;
    let barberBToken;

    beforeEach(async () => {
      appointmentB = await createAppointment({ tenant: b, client });
      paymentB = await Payment.create({ appointment_id: appointmentB.id, amount: 50, method: 'PIX' });
      barberBToken = await loginAs(b.barberUser);
    });

    it('dono A não lê pagamento de B por id nem por agendamento (404)', async () => {
      const byId = await request(app).get(`/api/payment/${paymentB.id}`).set(bearer(ownerA));
      const byAppt = await request(app).get(`/api/payment/appointment/${appointmentB.id}`).set(bearer(ownerA));
      expect(byId.status).toBe(404);
      expect(byAppt.status).toBe(404);
    });

    it('barbeiro de A não marca pagamento de B como pago (404)', async () => {
      const barberAToken = await loginAs(a.barberUser);
      const res = await request(app)
        .put(`/api/payment/${paymentB.id}/status`)
        .set(bearer(barberAToken))
        .send({ status: 'PAID' });
      expect(res.status).toBe(404);
      expect((await Payment.findByPk(paymentB.id)).status).toBe('PENDING');
    });

    it('usuário qualquer não registra pagamento em agendamento alheio (404)', async () => {
      const appointmentA = await createAppointment({ tenant: a, client });
      const stranger = await loginAs(await createUser());
      const res = await request(app)
        .post('/api/payment')
        .set(bearer(stranger))
        .send({ appointment_id: appointmentA.id, amount: 50, method: 'PIX' });
      expect(res.status).toBe(404);
    });

    it('cliente lê o pagamento do próprio agendamento, mas não o registra (403)', async () => {
      const read = await request(app).get(`/api/payment/${paymentB.id}`).set(bearer(clientToken));
      expect(read.status).toBe(200);

      const appointmentA = await createAppointment({ tenant: a, client });
      const create = await request(app)
        .post('/api/payment')
        .set(bearer(clientToken))
        .send({ appointment_id: appointmentA.id, amount: 1, method: 'PIX' });
      expect(create.status).toBe(403);
    });

    it('barbeiro que atendeu e dono da barbearia operam o pagamento', async () => {
      const byBarber = await request(app)
        .put(`/api/payment/${paymentB.id}/status`)
        .set(bearer(barberBToken))
        .send({ status: 'PAID' });
      expect(byBarber.status).toBe(200);

      const read = await request(app).get(`/api/payment/${paymentB.id}`).set(bearer(ownerB));
      expect(read.status).toBe(200);
      expect(read.body.status).toBe('PAID');
    });
  });
});
