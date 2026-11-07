// BE-38 / SEC-09 / SEC-10: validação de entrada, limites de paginação e normalização de e-mail.
const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  loginAs,
  bearer,
  sequelize,
} = require('../helpers/factories');
const { Barbershop, User } = require('../../models');

describe('BE-38 — validação de entrada', () => {
  beforeEach(resetDatabase);
  afterAll(() => sequelize.close());

  describe('paginação (SEC-09)', () => {
    it('pageSize enorme é limitado a 100', async () => {
      const owner = await createUser({ role: 'owner' });
      await Barbershop.bulkCreate(
        Array.from({ length: 120 }, (_, i) => ({ name: `Barbearia ${i}`, owner_id: owner.id }))
      );

      const res = await request(app).get('/api/barbershop?pageSize=1000000');
      expect(res.status).toBe(200);
      expect(res.body.pageSize).toBe(100);
      expect(res.body.items.length).toBeLessThanOrEqual(100);
      expect(res.body.total).toBe(120);
    });

    it.each(['0', '-5', 'abc', '1.5'])('page/pageSize inválido (%s) → 400', async (value) => {
      const res = await request(app).get(`/api/barbershop?pageSize=${value}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('parâmetros de query desconhecidos são descartados', async () => {
      const res = await request(app).get('/api/barbershop?hack[$gt]=1&foo=bar');
      expect(res.status).toBe(200);
    });
  });

  describe('ids e datas', () => {
    it.each(['abc', '0', '-1', '1.5', '1;DROP TABLE users'])('id inválido na URL (%s) → 400', async (value) => {
      const res = await request(app).get(`/api/barbershop/${encodeURIComponent(value)}`);
      expect(res.status).toBe(400);
    });

    it('data inválida no filtro de agendamentos → 400', async () => {
      const token = await loginAs(await createUser());
      const res = await request(app).get('/api/appointment?from=ontem').set(bearer(token));
      expect(res.status).toBe(400);
    });
  });

  describe('corpo da requisição', () => {
    it('corpo acima de 100kb → 413', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@a.com', password: 'x'.repeat(150 * 1024) });
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('erro de validação devolve detalhes por campo', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'invalido' });
      expect(res.status).toBe(400);
      const fields = res.body.details.map((detail) => detail.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });
  });

  describe('cadastro e login (SEC-10)', () => {
    it('e-mail é normalizado no cadastro e no login', async () => {
      const register = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Carla', email: '  Carla@Example.COM ', password: 'Senha@123' });
      expect(register.status).toBe(201);
      expect(register.body.user.email).toBe('carla@example.com');

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'CARLA@example.com', password: 'Senha@123' });
      expect(login.status).toBe(200);
    });

    it('não permite duas contas que só diferem em maiúsculas', async () => {
      await request(app).post('/api/auth/register').send({ name: 'Ana', email: 'ana@x.com', password: 'Senha@123' });
      const dup = await request(app).post('/api/auth/register').send({ name: 'Ana 2', email: 'ANA@x.com', password: 'Senha@123' });
      expect(dup.status).toBe(409);
      expect(await User.count()).toBe(1);
    });

    it.each([
      ['curta (7)', '1234567'],
      ['longa (73)', 'a'.repeat(73)],
    ])('senha %s → 400', async (_label, password) => {
      const res = await request(app).post('/api/auth/register').send({ name: 'Leo', email: 'leo@x.com', password });
      expect(res.status).toBe(400);
    });

    it('senha igual ao e-mail → 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Leo', email: 'leo@exemplo.com', password: 'leo@exemplo.com' });
      expect(res.status).toBe(400);
    });

    it('conta antiga com senha de 6 caracteres ainda consegue logar', async () => {
      const legacy = await createUser({ email: 'antigo@x.com', password: '123456' });
      const res = await request(app).post('/api/auth/login').send({ email: legacy.email, password: '123456' });
      expect(res.status).toBe(200);
    });
  });

  describe('endereço', () => {
    let tenant;
    let ownerToken;

    beforeEach(async () => {
      tenant = await createTenant();
      ownerToken = await loginAs(tenant.owner);
    });

    it.each(['01001-000', '01001000'])('CEP %s é aceito', async (cep) => {
      const res = await request(app)
        .post('/api/branch')
        .set(bearer(ownerToken))
        .send({ name: 'Nova', barbershop_id: tenant.barbershop.id, cep, number: 1, city: 'São Paulo', state: 'sp' });
      expect(res.status).toBe(201);
      expect(res.body.branch.Address.state).toBe('SP');
    });

    it.each([
      ['CEP inválido', { cep: '123' }],
      ['UF inexistente', { state: 'XX' }],
      ['número negativo', { number: -3 }],
    ])('%s → 400', async (_label, override) => {
      const res = await request(app)
        .post('/api/branch')
        .set(bearer(ownerToken))
        .send({
          name: 'Nova',
          barbershop_id: tenant.barbershop.id,
          cep: '01001-000',
          number: 1,
          city: 'São Paulo',
          state: 'SP',
          ...override,
        });
      expect(res.status).toBe(400);
    });
  });

  describe('serviço', () => {
    it.each([
      ['duração menor que 5 min', { duration: 2 }],
      ['duração maior que 8 h', { duration: 600 }],
      ['preço zero', { price: 0 }],
    ])('%s → 400', async (_label, override) => {
      const tenant = await createTenant();
      const token = await loginAs(tenant.owner);
      const res = await request(app)
        .post('/api/services')
        .set(bearer(token))
        .send({
          name: 'Barba',
          description: 'Barba completa',
          price: 30,
          duration: 30,
          barbershop_id: tenant.barbershop.id,
          ...override,
        });
      expect(res.status).toBe(400);
    });
  });
});
