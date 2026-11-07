// Validates appointment creation and status updates with branch consistency checks.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../app');
const {
  sequelize,
  User,
  Barbershop,
  Address,
  Branch,
  Barber,
  Service,
  Appointment,
} = require('../models');

describe('Appointment integration', () => {
  let clientToken;
  let clientUser;
  let barberUser;
  let branch;
  let otherBranch;
  let barber;
  let service;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await sequelize.sync({ force: true });

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Client', email: 'client@app.com', password: '123456' });
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Barber User', email: 'barber@app.com', password: '123456' });

    clientUser = await User.findOne({ where: { email: 'client@app.com' } });
    barberUser = await User.findOne({ where: { email: 'barber@app.com' } });
    barberUser.role = 'barbeiro';
    await barberUser.save();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'client@app.com', password: '123456' });
    clientToken = login.body.token;

    const barbershop = await Barbershop.create({ name: 'Shop', owner_id: clientUser.id });
    const address = await Address.create({ cep: '01001000', number: 100, city: 'SP', state: 'SP' });
    const address2 = await Address.create({ cep: '02002000', number: 200, city: 'SP', state: 'SP' });

    branch = await Branch.create({ name: 'Centro', barbershop_id: barbershop.id, address_id: address.id });
    otherBranch = await Branch.create({ name: 'Zona Sul', barbershop_id: barbershop.id, address_id: address2.id });

    barber = await Barber.create({ user_id: barberUser.id, branch_id: branch.id, bio: 'Especialista' });
    service = await Service.create({
      name: 'Corte',
      description: 'Corte masculino',
      price: 40,
      duration: 30,
      barbershop_id: barbershop.id,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/appointment', () => {
    it('cliente autenticado deve criar agendamento (201)', async () => {
      const response = await request(app)
        .post('/api/appointment')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          user_id: clientUser.id,
          barber_id: barber.id,
          service_id: service.id,
          branch_id: branch.id,
          appointment_date: '2026-06-10T10:00:00.000Z',
          status: 'pendente',
        });

      expect(response.status).toBe(201);
      expect(response.body.appointment).toBeDefined();
    });

    it('deve retornar 400 se barbeiro não pertencer à filial', async () => {
      const response = await request(app)
        .post('/api/appointment')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          user_id: clientUser.id,
          barber_id: barber.id,
          service_id: service.id,
          branch_id: otherBranch.id,
          appointment_date: '2026-06-10T10:00:00.000Z',
          status: 'pendente',
        });

      expect(response.status).toBe(400);
    });

    it('deve retornar 401 se não autenticado', async () => {
      const response = await request(app).post('/api/appointment').send({});
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/appointment/:id', () => {
    it('deve atualizar status do agendamento (200)', async () => {
      const appointment = await Appointment.create({
        user_id: clientUser.id,
        barber_id: barber.id,
        service_id: service.id,
        branch_id: branch.id,
        appointment_date: '2026-06-10T10:00:00.000Z',
        status: 'pendente',
      });

      const response = await request(app)
        .put(`/api/appointment/${appointment.id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ status: 'confirmado' });

      expect(response.status).toBe(200);
      expect(response.body.appointment.status).toBe('confirmado');
    });

    it('deve retornar 404 para agendamento inexistente', async () => {
      const response = await request(app)
        .put('/api/appointment/999999')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ status: 'confirmado' });

      expect(response.status).toBe(404);
    });
  });
});