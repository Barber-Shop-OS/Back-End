// Covers barbershop creation and listing permissions with authenticated and public scenarios.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../app');
const { sequelize, User } = require('../models');

const registerAndLogin = async ({ name, email, password, role }) => {
  await request(app).post('/api/auth/register').send({ name, email, password });
  if (role) {
    const user = await User.findOne({ where: { email } });
    user.role = role;
    await user.save();
  }
  const login = await request(app).post('/api/auth/login').send({ email, password });
  return login.body.token;
};

describe('Barbershop integration', () => {
  let ownerToken;
  let clientToken;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    ownerToken = await registerAndLogin({
      name: 'Owner User',
      email: 'owner@shop.com',
      password: 'Senha@123',
      role: 'owner',
    });
    clientToken = await registerAndLogin({
      name: 'Client User',
      email: 'client@shop.com',
      password: 'Senha@123',
      role: 'cliente',
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/barbershop', () => {
    it('owner autenticado deve criar barbearia (201)', async () => {
      const response = await request(app)
        .post('/api/barbershop')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Barber Prime' });

      expect(response.status).toBe(201);
      expect(response.body.barbershop.name).toBe('Barber Prime');
    });

    it('deve retornar 403 se role não for owner ou admin', async () => {
      const response = await request(app)
        .post('/api/barbershop')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ name: 'Barber Restrita' });

      expect(response.status).toBe(403);
    });

    it('deve retornar 401 se não autenticado', async () => {
      const response = await request(app).post('/api/barbershop').send({ name: 'Sem Auth' });
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/barbershop', () => {
    it('deve listar barbearias sem autenticação (200)', async () => {
      await request(app)
        .post('/api/barbershop')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Barber Public' });

      const response = await request(app).get('/api/barbershop');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('deve retornar array paginado com page e pageSize', async () => {
      const response = await request(app).get('/api/barbershop?page=1&pageSize=5');
      expect(response.status).toBe(200);
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(5);
      expect(Array.isArray(response.body.items)).toBe(true);
    });
  });

  describe('GET /api/barbershop/:id', () => {
    it('deve retornar barbearia com branches e owner', async () => {
      const created = await request(app)
        .post('/api/barbershop')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Barber Detail' });

      const response = await request(app).get(`/api/barbershop/${created.body.barbershop.id}`);
      expect(response.status).toBe(200);
      expect(response.body.owner).toBeDefined();
      expect(response.body.Branches).toBeDefined();
    });

    it('deve retornar 404 para id inexistente', async () => {
      const response = await request(app).get('/api/barbershop/999999');
      expect(response.status).toBe(404);
    });
  });
});