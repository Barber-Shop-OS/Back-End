// BE-07: pagamento presencial — cartão, valor padrão do agendamento, registro já pago, escopo por
// tenant e listagem financeira com totais.
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
  sequelize,
} = require('../../helpers/factories');
const { Payment, Barber, Branch, Address } = require('../../../models');
const paymentService = require('../../../modules/payment/paymentService');

describe('BE-07 — pagamento presencial', () => {
  let a;
  let b;
  let client;
  let tokens;

  beforeAll(async () => {
    await resetDatabase();
    a = await createTenant({ name: 'Navalha A' });
    b = await createTenant({ name: 'Navalha B' });
    client = await createUser();
    tokens = {
      ownerA: await loginAs(a.owner),
      ownerB: await loginAs(b.owner),
      barberA: await loginAs(a.barberUser),
      barberB: await loginAs(b.barberUser),
      client: await loginAs(client),
      admin: await loginAs(await createUser({ role: 'admin' })),
    };
  });

  afterAll(() => sequelize.close());

  const pay = (token, body) => request(app).post('/api/payment').set(bearer(token)).send(body);
  const list = (token, query = {}) => request(app).get('/api/payment').set(bearer(token)).query(query);

  describe('POST /api/payment', () => {
    it('cartão, valor padrão = price_snapshot, já pago e com quem registrou', async () => {
      const appointment = await createAppointment({ tenant: a, client });
      const res = await pay(tokens.barberA, { appointment_id: appointment.id, method: 'CARD', status: 'PAID' });
      expect(res.status).toBe(201);
      expect(res.body.payment).toMatchObject({
        method: 'CARD',
        status: 'PAID',
        amount: '50.00',
        recorded_by: a.barberUser.id,
        branch_id: a.branch.id,
        barbershop_id: a.barbershop.id,
      });
      expect(res.body.payment.paid_at).toBeTruthy();
    });

    it('valor informado prevalece e status padrão é PENDING', async () => {
      const appointment = await createAppointment({ tenant: a, client });
      const res = await pay(tokens.ownerA, { appointment_id: appointment.id, method: 'CASH', amount: 45.5 });
      expect(res.status).toBe(201);
      expect(res.body.payment).toMatchObject({ amount: '45.50', status: 'PENDING', paid_at: null });
    });

    it('barbeiro de outra barbearia não registra (404 sem revelar) e cliente recebe 403', async () => {
      const appointment = await createAppointment({ tenant: a, client });
      expect((await pay(tokens.barberB, { appointment_id: appointment.id, method: 'PIX' })).status).toBe(404);
      expect((await pay(tokens.ownerB, { appointment_id: appointment.id, method: 'PIX' })).status).toBe(404);
      expect((await pay(tokens.client, { appointment_id: appointment.id, method: 'PIX' })).status).toBe(403);
      expect(await Payment.count({ where: { appointment_id: appointment.id } })).toBe(0);
    });

    it('status FAILED não é aceito na criação e método desconhecido → 400', async () => {
      const appointment = await createAppointment({ tenant: a, client });
      expect((await pay(tokens.ownerA, { appointment_id: appointment.id, method: 'PIX', status: 'FAILED' })).status).toBe(400);
      expect((await pay(tokens.ownerA, { appointment_id: appointment.id, method: 'BOLETO' })).status).toBe(400);
    });
  });

  describe('GET /api/payment', () => {
    let secondBarber;

    beforeAll(async () => {
      await Payment.destroy({ where: {} });
      // Segunda filial e segundo barbeiro na barbearia A.
      const address = await Address.create({ cep: '01001-000', number: 2, city: 'São Paulo', state: 'SP' });
      const branch2 = await Branch.create({ name: 'A Filial 2', barbershop_id: a.barbershop.id, address_id: address.id });
      const otherBarberUser = await createUser({ role: 'barbeiro' });
      secondBarber = await Barber.create({ user_id: otherBarberUser.id, branch_id: branch2.id });

      const make = async (tenant, method, status, amount, extra = {}) => {
        const appointment = await createAppointment({ tenant, client, ...extra });
        await Payment.create({
          appointment_id: appointment.id,
          amount,
          method,
          status,
          branch_id: extra.branch_id || tenant.branch.id,
          barbershop_id: tenant.barbershop.id,
          paid_at: status === 'PAID' ? new Date() : null,
        });
      };
      await make(a, 'PIX', 'PAID', 50);
      await make(a, 'CASH', 'PAID', 30.1);
      await make(a, 'CARD', 'PAID', 20.2);
      await make(a, 'PIX', 'PENDING', 15);
      await make(a, 'CASH', 'FAILED', 10);
      await make(a, 'CARD', 'PAID', 99.99, { barber: secondBarber, branch_id: branch2.id });
      await make(b, 'PIX', 'PAID', 1000);
    });

    it('dono vê só a própria barbearia; totais batem com a soma', async () => {
      const res = await list(tokens.ownerA);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(6);
      expect(res.body.items.every((item) => item.barbershop_id === a.barbershop.id)).toBe(true);
      expect(res.body.totals).toEqual({
        count: 6,
        amount: '225.29',
        paid: { count: 4, amount: '200.29' },
        pending: { count: 1, amount: '15.00' },
        failed: { count: 1, amount: '10.00' },
        paid_by_method: { PIX: '50.00', CASH: '30.10', CARD: '120.19' },
      });
      const sum = res.body.items.reduce((acc, item) => acc + Math.round(Number(item.amount) * 100), 0);
      expect((sum / 100).toFixed(2)).toBe(res.body.totals.amount);
      expect(res.body.items[0].appointment).toMatchObject({ client: expect.any(Object) });
    });

    it('filtros por filial, método e status', async () => {
      const byBranch = await list(tokens.ownerA, { branch_id: a.branch.id });
      expect(byBranch.body.total).toBe(5);
      const card = await list(tokens.ownerA, { method: 'CARD', status: 'PAID' });
      expect(card.body.total).toBe(2);
      expect(card.body.totals.paid.amount).toBe('120.19');
    });

    it('filtro de período', async () => {
      const future = await list(tokens.ownerA, { from: new Date(Date.now() + 86400000).toISOString() });
      expect(future.body.total).toBe(0);
      expect(future.body.totals.amount).toBe('0.00');
    });

    it('barbeiro vê só os próprios atendimentos', async () => {
      const res = await list(tokens.barberA);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(5);
      expect(res.body.totals.paid.amount).toBe('100.30');
    });

    it('dono de outra barbearia recebe 403 ao filtrar por barbearia/filial alheia', async () => {
      expect((await list(tokens.ownerB, { barbershop_id: a.barbershop.id })).status).toBe(403);
      expect((await list(tokens.ownerB, { branch_id: a.branch.id })).status).toBe(403);
      const own = await list(tokens.ownerB);
      expect(own.body.total).toBe(1);
    });

    it('cliente → 403; admin vê tudo; paginação', async () => {
      expect((await list(tokens.client)).status).toBe(403);
      const all = await list(tokens.admin, { pageSize: 2 });
      expect(all.body.total).toBe(7);
      expect(all.body.items).toHaveLength(2);
      expect(all.body.totalPages).toBe(4);
    });

    it('filial inexistente → 404; query inválida → 400', async () => {
      expect((await list(tokens.ownerA, { branch_id: 999999 })).status).toBe(404);
      expect((await list(tokens.ownerA, { method: 'BOLETO' })).status).toBe(400);
    });
  });

  describe('buildTotals (unitário)', () => {
    it('soma em centavos sem erro de ponto flutuante', () => {
      const totals = paymentService.buildTotals([
        { status: 'PAID', method: 'PIX', count: 3, sum: '0.10' },
        { status: 'PAID', method: 'PIX', count: 1, sum: 0.2 },
        { status: 'PENDING', method: 'CARD', count: '2', sum: null },
      ]);
      expect(totals.paid).toEqual({ count: 4, amount: '0.30' });
      expect(totals.pending).toEqual({ count: 2, amount: '0.00' });
      expect(totals.paid_by_method.PIX).toBe('0.30');
      expect(totals.count).toBe(6);
    });
  });
});
