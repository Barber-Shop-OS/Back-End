// Ensures payment creation and status transition rules behave as expected.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  User,
  Barbershop,
  Address,
  Branch,
  Barber,
  Service,
  Appointment,
  Payment,
} = require('../models');

describe('Payment integration', () => {
  let ownerToken;
  let clientUser;
  let appointment;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await sequelize.sync({ force: true });

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Owner', email: 'owner@pay.com', password: '123456' });
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Client', email: 'client@pay.com', password: '123456' });
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Barber', email: 'barber@pay.com', password: '123456' });

    const ownerUser = await User.findOne({ where: { email: 'owner@pay.com' } });
    clientUser = await User.findOne({ where: { email: 'client@pay.com' } });
    const barberUser = await User.findOne({ where: { email: 'barber@pay.com' } });

    ownerUser.role = 'owner';
    barberUser.role = 'barbeiro';
    await ownerUser.save();
    await barberUser.save();

    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@pay.com', password: '123456' });
    ownerToken = ownerLogin.body.token;

    const barbershop = await Barbershop.create({ name: 'Pay Shop', owner_id: ownerUser.id });
    const address = await Address.create({ cep: '01001000', number: 1, city: 'SP', state: 'SP' });
    const branch = await Branch.create({ name: 'Pay Branch', barbershop_id: barbershop.id, address_id: address.id });
    const barber = await Barber.create({ user_id: barberUser.id, branch_id: branch.id, bio: 'Especialista' });
    const service = await Service.create({
      name: 'Barba',
      description: 'Barba completa',
      price: 35,
      duration: 25,
      barbershop_id: barbershop.id,
    });

    appointment = await Appointment.create({
      user_id: clientUser.id,
      barber_id: barber.id,
      service_id: service.id,
      branch_id: branch.id,
      appointment_date: '2026-06-10T11:00:00.000Z',
      status: 'pendente',
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/payment', () => {
    it('deve criar pagamento para agendamento existente (201)', async () => {
      const response = await request(app)
        .post('/api/payment')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ appointment_id: appointment.id, amount: 35, method: 'PIX' });

      expect(response.status).toBe(201);
      expect(response.body.payment.status).toBe('PENDING');
      expect(['PIX', 'CASH']).toContain(response.body.payment.method);
    });

    it('deve retornar 409 se pagamento já existe para o agendamento', async () => {
      await Payment.create({ appointment_id: appointment.id, amount: 35, method: 'PIX', status: 'PENDING' });

      const response = await request(app)
        .post('/api/payment')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ appointment_id: appointment.id, amount: 35, method: 'PIX' });

      expect(response.status).toBe(409);
    });

    it('deve retornar 404 se agendamento não existir', async () => {
      const response = await request(app)
        .post('/api/payment')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ appointment_id: 999999, amount: 35, method: 'PIX' });

      expect(response.status).toBe(404);
    });

    it('deve retornar 400 se method for inválido', async () => {
      const response = await request(app)
        .post('/api/payment')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ appointment_id: appointment.id, amount: 35, method: 'CARD' });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/payment/:id/status', () => {
    it('deve atualizar status para PAID e registrar paid_at (200)', async () => {
      const payment = await Payment.create({ appointment_id: appointment.id, amount: 35, method: 'PIX', status: 'PENDING' });

      const response = await request(app)
        .put(`/api/payment/${payment.id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'PAID' });

      expect(response.status).toBe(200);
      expect(response.body.payment.status).toBe('PAID');
      expect(response.body.payment.paid_at).toBeTruthy();
    });

    it('deve atualizar status para FAILED (200)', async () => {
      const payment = await Payment.create({ appointment_id: appointment.id, amount: 35, method: 'PIX', status: 'PENDING' });

      const response = await request(app)
        .put(`/api/payment/${payment.id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'FAILED' });

      expect(response.status).toBe(200);
      expect(response.body.payment.status).toBe('FAILED');
    });

    it('deve retornar 400 para status inválido', async () => {
      const payment = await Payment.create({ appointment_id: appointment.id, amount: 35, method: 'PIX', status: 'PENDING' });

      const response = await request(app)
        .put(`/api/payment/${payment.id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'PROCESSING' });

      expect(response.status).toBe(400);
    });
  });
});