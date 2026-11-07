// BE-02 / SEC-05 / SEC-08: JWT endurecido, revogação por token_version e CORS restrito.
const jwt = require('jsonwebtoken');
const {
  app,
  request,
  resetDatabase,
  createUser,
  loginAs,
  bearer,
  sequelize,
} = require('../helpers/factories');
const config = require('../../config/config');

const signWith = (payload, secret = config.jwt.secret, options = {}) =>
  jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn: '1h',
    ...options,
  });

describe('BE-02 — autenticação JWT', () => {
  let user;
  let admin;

  beforeEach(async () => {
    await resetDatabase();
    user = await createUser({ email: 'user@test.com' });
    admin = await createUser({ role: 'admin', email: 'admin@test.com' });
  });

  afterAll(() => sequelize.close());

  it('token emitido no login é aceito e não expõe token_version', async () => {
    const token = await loginAs(user);
    const res = await request(app).get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.password).toBeUndefined();
    expect(res.body.token_version).toBeUndefined();
  });

  it('payload do token tem sub/role/tv, iss e aud', async () => {
    const token = await loginAs(user);
    const decoded = jwt.decode(token);
    expect(decoded).toMatchObject({
      sub: String(user.id),
      role: 'cliente',
      tv: 0,
      iss: 'barberos-api',
      aud: 'barberos-app',
    });
    expect(decoded.email).toBeUndefined();
  });

  it.each([
    ['sem prefixo Bearer', (t) => ({ Authorization: t })],
    ['prefixo minúsculo', (t) => ({ Authorization: `bearer ${t}` })],
    ['lixo após o token', (t) => ({ Authorization: `Bearer ${t} extra` })],
  ])('rejeita header %s', async (_label, headerFor) => {
    const token = await loginAs(user);
    const res = await request(app).get('/api/auth/me').set(headerFor(token));
    expect(res.status).toBe(401);
  });

  it('rejeita token assinado com segredo de exemplo (your_jwt_secret)', async () => {
    const forged = signWith({ sub: String(admin.id), role: 'admin', tv: 0 }, 'your_jwt_secret');
    const res = await request(app).get('/api/user').set(bearer(forged));
    expect(res.status).toBe(401);
  });

  it('rejeita token com alg none', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: String(admin.id), role: 'admin', tv: 0, iss: 'barberos-api', aud: 'barberos-app' })
    ).toString('base64url');
    const res = await request(app).get('/api/user').set({ Authorization: `Bearer ${header}.${body}.` });
    expect(res.status).toBe(401);
  });

  it('rejeita token de outro emissor ou audiência', async () => {
    const wrongIss = signWith({ sub: String(user.id), tv: 0 }, config.jwt.secret, { issuer: 'outro' });
    const wrongAud = signWith({ sub: String(user.id), tv: 0 }, config.jwt.secret, { audience: 'outro' });
    expect((await request(app).get('/api/auth/me').set(bearer(wrongIss))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer(wrongAud))).status).toBe(401);
  });

  it('rejeita token expirado', async () => {
    const expired = signWith({ sub: String(user.id), tv: 0 }, config.jwt.secret, { expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set(bearer(expired));
    expect(res.status).toBe(401);
  });

  it('rejeita token de usuário que não existe mais', async () => {
    const token = await loginAs(user);
    await user.destroy();
    const res = await request(app).get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(401);
  });

  it('papel vem do banco: role "admin" forjada no payload não dá acesso', async () => {
    const forgedRole = signWith({ sub: String(user.id), role: 'admin', tv: 0 });
    const res = await request(app).get('/api/user').set(bearer(forgedRole));
    expect(res.status).toBe(403);
  });

  it('troca de papel derruba as sessões antigas do usuário (token_version)', async () => {
    const oldToken = await loginAs(user);
    const adminToken = await loginAs(admin);

    const change = await request(app)
      .patch(`/api/admin/users/${user.id}/role`)
      .set(bearer(adminToken))
      .send({ role: 'owner' });
    expect(change.status).toBe(200);

    expect((await request(app).get('/api/auth/me').set(bearer(oldToken))).status).toBe(401);

    const newToken = await loginAs(user);
    const me = await request(app).get('/api/auth/me').set(bearer(newToken));
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('owner');
  });

  describe('SEC-08 — CORS', () => {
    it('origem autorizada recebe Access-Control-Allow-Origin', async () => {
      const res = await request(app).get('/').set('Origin', 'http://localhost:5173');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('origem desconhecida não recebe Access-Control-Allow-Origin', async () => {
      const res = await request(app).get('/').set('Origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
