// SEC-27: 2FA TOTP (obrigatório para admin, opcional para os demais) e aviso ao dono sobre novas pessoas na equipe.
jest.setTimeout(120000);

const { app, request, resetDatabase, createUser, loginAs, bearer, createTenant, sequelize, DEFAULT_PASSWORD } = require('../../helpers/factories');
const totp = require('../../../shared/totp');
const mailer = require('../../../shared/mailer');
const { User } = require('../../../models');

const login = (user) => request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD });

/** Código de um passo ainda não usado (o servidor recusa reuso do mesmo passo). */
const codeAt = (secret, offsetSteps = 0) => totp.generate(secret, Date.now() + offsetSteps * 30000);

const enableFor = async (user) => {
  const token = await loginAs(user);
  const setup = await request(app).post('/api/me/2fa/setup').set(bearer(token));
  expect(setup.status).toBe(200);
  expect(setup.body.otpauth_url).toMatch(/^otpauth:\/\/totp\/BarberOS/);
  const enable = await request(app).post('/api/me/2fa/enable').set(bearer(token)).send({ code: codeAt(setup.body.secret, -1) });
  expect(enable.status).toBe(200);
  expect(enable.body.recovery_codes).toHaveLength(10);
  return { token, secret: setup.body.secret, recoveryCodes: enable.body.recovery_codes };
};

describe('SEC-27 — 2FA e contas privilegiadas', () => {
  beforeAll(() => resetDatabase());
  afterAll(() => sequelize.close());

  it('TOTP: base32 ida e volta e vetores da RFC 6238 (SHA-1)', () => {
    const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
    expect(totp.base32Decode(secret).toString()).toBe('12345678901234567890');
    // RFC 6238, apêndice B: T = 59 s → 94287082 (8 dígitos) → 287082 com 6 dígitos.
    expect(totp.generate(secret, 59 * 1000)).toBe('287082');
    expect(totp.generate(secret, 1111111109 * 1000)).toBe('081804');
  });

  it('ativar: código errado recusa; certo ativa e o segredo nunca sai em /me', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const setup = await request(app).post('/api/me/2fa/setup').set(bearer(token));
    const wrong = await request(app).post('/api/me/2fa/enable').set(bearer(token)).send({ code: '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('TWO_FACTOR_INVALID');
    await request(app).post('/api/me/2fa/enable').set(bearer(token)).send({ code: codeAt(setup.body.secret) });
    const me = await request(app).get('/api/me').set(bearer(token));
    expect(me.body.two_factor_enabled).toBe(true);
    expect(JSON.stringify(me.body)).not.toMatch(/totp_secret|totp_recovery|totp_pending/);
    const row = await User.findByPk(user.id);
    expect(row.totp_secret).toMatch(/^v1\./); // cifrado
    expect(row.totp_secret).not.toContain(setup.body.secret);
  });

  it('login com 2FA: senha devolve desafio (sem sessão); código abre a sessão; mesmo código não vale duas vezes', async () => {
    const user = await createUser();
    const { secret } = await enableFor(user);
    const first = await login(user);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ two_factor_required: true });
    expect(first.body.token).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined();

    const code = codeAt(secret, 1);
    const ok = await request(app).post('/api/auth/2fa/verify').send({ challenge_token: first.body.challenge_token, code });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect((await request(app).get('/api/me').set(bearer(ok.body.token))).status).toBe(200);

    const again = await login(user);
    const replay = await request(app).post('/api/auth/2fa/verify').send({ challenge_token: again.body.challenge_token, code });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('TWO_FACTOR_INVALID');
  });

  it('código de recuperação funciona uma única vez; desafio inválido é recusado', async () => {
    const user = await createUser();
    const { recoveryCodes } = await enableFor(user);
    const challenge = (await login(user)).body.challenge_token;
    expect((await request(app).post('/api/auth/2fa/verify').send({ challenge_token: challenge, recovery_code: recoveryCodes[0].toLowerCase() })).status).toBe(200);
    const challenge2 = (await login(user)).body.challenge_token;
    expect((await request(app).post('/api/auth/2fa/verify').send({ challenge_token: challenge2, recovery_code: recoveryCodes[0] })).status).toBe(401);
    expect((await request(app).post('/api/auth/2fa/verify').send({ challenge_token: 'lixo', code: '123456' })).body.code).toBe('TOKEN_INVALID_OR_EXPIRED');
  });

  it('desativar exige senha + código; admin não pode desativar', async () => {
    const user = await createUser();
    const { token, secret } = await enableFor(user);
    expect((await request(app).post('/api/me/2fa/disable').set(bearer(token)).send({ password: 'errada', code: codeAt(secret, 1) })).status).toBe(401);
    const off = await request(app).post('/api/me/2fa/disable').set(bearer(token)).send({ password: DEFAULT_PASSWORD, code: codeAt(secret, 1) });
    expect(off.status).toBe(200);
    expect((await login(user)).body.token).toBeTruthy();

    const admin = await createUser({ role: 'admin', twoFactor: false });
    const adminTwoFactor = await enableFor(admin);
    const denied = await request(app)
      .post('/api/me/2fa/disable')
      .set(bearer(adminTwoFactor.token))
      .send({ password: DEFAULT_PASSWORD, code: codeAt(adminTwoFactor.secret, 1) });
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('TWO_FACTOR_REQUIRED_FOR_ROLE');
  });

  it('admin sem 2FA não acessa /api/admin (403 TWO_FACTOR_SETUP_REQUIRED); com 2FA acessa', async () => {
    const admin = await createUser({ role: 'admin', twoFactor: false });
    const token = await loginAs(admin);
    const blocked = await request(app).get('/api/admin/metrics').set(bearer(token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
    expect((await request(app).get('/api/me').set(bearer(token))).body.two_factor_required).toBe(true);
    await enableFor(admin);
    expect((await request(app).get('/api/admin/metrics').set(bearer(token))).status).toBe(200);
  });

  it('dono recebe e-mail quando uma pessoa é adicionada à equipe', async () => {
    const tenant = await createTenant();
    const ownerToken = await loginAs(tenant.owner);
    const newcomer = await createUser({ name: 'Rita Nova', email: 'rita.nova@test.com' });
    mailer.clearOutbox();
    const res = await request(app)
      .post(`/api/barbershop/${tenant.barbershop.id}/members`)
      .set(bearer(ownerToken))
      .send({ email: newcomer.email, role: 'receptionist', branch_id: tenant.branch.id });
    expect(res.status).toBe(201);
    const notice = mailer.outbox().find((mail) => mail.to === tenant.owner.email);
    expect(notice).toBeDefined();
    expect(notice.html).toContain('rita.nova@test.com');
  });
});
