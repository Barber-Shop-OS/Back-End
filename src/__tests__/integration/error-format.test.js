// BE-37: contrato de erro { message, code } nas respostas HTTP reais.
const { app, request, resetDatabase, createUser, sequelize } = require('../helpers/factories');

describe('BE-37 — formato de erro da API', () => {
  beforeEach(resetDatabase);
  afterAll(() => sequelize.close());

  it('rota inexistente → 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Rota não encontrada', code: 'NOT_FOUND' });
  });

  it('JSON malformado → 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });

  it('login inválido → 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'errada' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('cadastro com e-mail em uso → 409 EMAIL_IN_USE', async () => {
    await createUser({ email: 'dup@test.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dup', email: 'dup@test.com', password: 'Tesoura#Navalha9' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
  });

  it('especificação OpenAPI disponível fora de produção (alvo do OWASP ZAP — SEC-23)', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(20);
  });

  it('sem token → 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
