// BE-28: login com Google — validação do id_token (audience, e-mail verificado), vínculo por e-mail,
// criação de cliente/dono e conta só-Google sem senha.
jest.setTimeout(120000);

const { app, request, resetDatabase, createUser, sequelize, DEFAULT_PASSWORD } = require('../../helpers/factories');
const { User, UserIdentity, Barbershop, Subscription } = require('../../../models');
const googleAuth = require('../../../modules/auth/googleAuthService');

const CLIENT_ID = 'barberos-test.apps.googleusercontent.com';
// Token falso: "ok:<json do payload>". O verificador real (google-auth-library) é trocado no teste.
const tokenFor = (payload) => `ok:${JSON.stringify({ aud: CLIENT_ID, email_verified: true, ...payload })}`;
const fakeVerifier = async (idToken, audience) => {
  if (!idToken.startsWith('ok:')) throw new Error('Wrong number of segments');
  const payload = JSON.parse(idToken.slice(3));
  if (payload.aud !== audience && !payload.skipAudienceCheck) throw new Error('Wrong recipient');
  return payload;
};

describe('BE-28 — login com Google', () => {
  const google = (body) => request(app).post('/api/auth/google').send(body);

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    googleAuth.setVerifier(fakeVerifier);
    await resetDatabase();
  });

  afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    googleAuth.setVerifier(null);
    await sequelize.close();
  });

  it('token de outro aud → 401; e-mail não verificado → 401; token inválido → 401', async () => {
    const otherAud = await google({ id_token: tokenFor({ sub: '1', email: 'a@g.com', aud: 'outro-app' }) });
    expect(otherAud.status).toBe(401);
    expect(otherAud.body.code).toBe('GOOGLE_TOKEN_INVALID');
    // Mesmo que o verificador deixe passar, a audience é conferida de novo.
    expect((await google({ id_token: tokenFor({ sub: '1', email: 'a@g.com', aud: 'outro-app', skipAudienceCheck: true }) })).status).toBe(401);
    expect((await google({ id_token: tokenFor({ sub: '1', email: 'a@g.com', email_verified: false }) })).status).toBe(401);
    expect((await google({ id_token: 'lixo' })).status).toBe(401);
    expect(await User.count({ where: { email: 'a@g.com' } })).toBe(0);
  });

  it('sem GOOGLE_CLIENT_ID → 503', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await google({ id_token: tokenFor({ sub: '1', email: 'a@g.com' }) });
    expect(res.status).toBe(503);
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  });

  it('primeiro acesso cria cliente só-Google, verificado; segundo acesso entra pela identidade', async () => {
    const first = await google({ id_token: tokenFor({ sub: 'g-100', email: 'Novo@Gmail.com', name: 'Novo Cliente' }) });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, user: { email: 'novo@gmail.com', role: 'cliente' } });
    expect(first.body.token).toBeTruthy();
    expect(first.body.user.password).toBeUndefined();
    const user = await User.findOne({ where: { email: 'novo@gmail.com' } });
    expect(user.password).toBeNull();
    expect(user.email_verified_at).not.toBeNull();

    const second = await google({ id_token: tokenFor({ sub: 'g-100', email: 'novo@gmail.com' }) });
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(user.id);
    expect(await UserIdentity.count({ where: { user_id: user.id } })).toBe(1);
  });

  it('conta só-Google não entra por senha (401 sem vazar que é só-Google)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'novo@gmail.com', password: DEFAULT_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('conta com senha e mesmo e-mail é vinculada (e o e-mail fica verificado)', async () => {
    const existing = await createUser({ email: 'senha@gmail.com', verified: false });
    const res = await google({ id_token: tokenFor({ sub: 'g-200', email: 'senha@gmail.com' }) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: false, linked: true, user: { id: existing.id } });
    expect((await existing.reload()).email_verified_at).not.toBeNull();
    // Senha continua funcionando.
    expect((await request(app).post('/api/auth/login').send({ email: 'senha@gmail.com', password: DEFAULT_PASSWORD })).status).toBe(200);
  });

  it('signup-owner cria dono + barbearia + trial; página já pode ser publicada (e-mail verificado)', async () => {
    const res = await google({
      id_token: tokenFor({ sub: 'g-300', email: 'dono@gmail.com', name: 'Dono Google' }),
      intent: 'signup-owner',
      phone: '(11) 98888-7777',
      barbershop: { name: 'Navalha Google' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: true, user: { role: 'owner' }, subscription: { status: 'trialing' } });
    const shop = await Barbershop.findByPk(res.body.barbershop.id);
    expect(shop.name).toBe('Navalha Google');
    expect(await Subscription.count({ where: { barbershop_id: shop.id } })).toBe(1);
    expect((await User.findByPk(res.body.user.id)).email_verified_at).not.toBeNull();
  });

  it('signup-owner sem barbearia/telefone → 400; com e-mail de cliente existente → 409', async () => {
    expect((await google({ id_token: tokenFor({ sub: 'g-400', email: 'x@gmail.com' }), intent: 'signup-owner' })).status).toBe(400);
    const conflict = await google({
      id_token: tokenFor({ sub: 'g-100', email: 'novo@gmail.com' }),
      intent: 'signup-owner',
      phone: '11988887777',
      barbershop: { name: 'Outra' },
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('EMAIL_IN_USE');
  });

  it('intent inválido → 400; sem id_token → 400', async () => {
    expect((await google({ id_token: tokenFor({ sub: 'z', email: 'z@g.com' }), intent: 'admin' })).status).toBe(400);
    expect((await google({})).status).toBe(400);
  });

  it('verificador real (google-auth-library) recusa token malformado', async () => {
    googleAuth.setVerifier(null);
    const res = await google({ id_token: 'nao.e.um.jwt' });
    expect(res.status).toBe(401);
    googleAuth.setVerifier(fakeVerifier);
  });
});
