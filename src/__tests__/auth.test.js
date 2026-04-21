// Validates auth flows for register, login, and current user retrieval.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../../app');
const { sequelize } = require('../models');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/auth/register', () => {
  it('deve criar um novo usuário com sucesso (201)', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@test.com', password: '123456' });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      id: expect.any(Number),
      name: 'Test User',
      email: 'test@test.com',
      role: 'cliente',
    });
    expect(response.body.user.password).toBeUndefined();
  });

  it('deve retornar 409 se e-mail já estiver em uso', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Duplicate User', email: 'dup@test.com', password: '123456' });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Duplicate User 2', email: 'dup@test.com', password: '123456' });

    expect(response.status).toBe(409);
  });

  it('deve retornar 400 se campos obrigatórios estiverem ausentes', async () => {
    const response = await request(app).post('/api/auth/register').send({});
    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await sequelize.sync({ force: true });
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Login User', email: 'login@test.com', password: '123456' });
  });

  it('deve retornar token JWT com credenciais válidas (200)', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: '123456' });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.role).toBeDefined();
  });

  it('deve retornar 401 com credenciais inválidas', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'senha_errada' });

    expect(response.status).toBe(401);
  });

  it('deve retornar 401 com e-mail inexistente', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'naoexiste@test.com', password: '123456' });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let token;

  beforeEach(async () => {
    await sequelize.sync({ force: true });

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Me User', email: 'me@test.com', password: '123456' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'me@test.com', password: '123456' });

    token = login.body.token;
  });

  it('deve retornar dados do usuário autenticado (200)', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('me@test.com');
    expect(response.body.password).toBeUndefined();
  });

  it('deve retornar 401 sem token', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });
});