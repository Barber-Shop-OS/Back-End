// BE-26 / SEC-26: recuperação de senha — resposta neutra, token de uso único com expiração,
// sessões derrubadas e links anteriores invalidados.
jest.setTimeout(120000);

const { app, request, resetDatabase, createUser, loginAs, bearer, sequelize, DEFAULT_PASSWORD } = require('../../helpers/factories');
const { UserToken, User } = require('../../../models');
const mailer = require('../../../shared/mailer');
const passwordResetService = require('../../../modules/auth/passwordResetService');
const { hashToken } = require('../../../shared/oneTimeToken');

const NEW_PASSWORD = 'Navalha#Afiada2026';
const tokenFromOutbox = () => {
  const mail = mailer.outbox()[mailer.outbox().length - 1];
  const match = /recuperar-senha\?token=([A-Za-z0-9_-]+)/.exec(mail.html);
  return match && decodeURIComponent(match[1]);
};

describe('BE-26 — recuperação de senha', () => {
  let user;

  beforeAll(async () => {
    await resetDatabase();
    user = await createUser({ email: 'esqueci@senha.com', name: 'Maria Esquecida' });
  });

  beforeEach(() => mailer.clearOutbox());
  afterAll(() => sequelize.close());

  const forgot = (email) => request(app).post('/api/auth/forgot-password').send({ email });
  const reset = (token, password = NEW_PASSWORD) => request(app).post('/api/auth/reset-password').send({ token, password });
  const sendAndGetToken = async () => {
    await passwordResetService.forgotPassword('esqueci@senha.com', { onSent: true });
    return tokenFromOutbox();
  };

  it('resposta idêntica para e-mail existente ou não', async () => {
    const existing = await forgot('ESQUECI@senha.com ');
    const unknown = await forgot('ninguem@nada.com');
    expect(existing.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(existing.body).toEqual(unknown.body);
    expect(await UserToken.count({ where: { user_id: user.id } })).toBe(1);
  });

  it('e-mail contém link com token; no banco só o hash', async () => {
    const token = await sendAndGetToken();
    expect(token).toBeTruthy();
    const mail = mailer.outbox()[0];
    expect(mail.to).toBe('esqueci@senha.com');
    expect(await UserToken.count({ where: { token_hash: token } })).toBe(0);
    expect(await UserToken.count({ where: { token_hash: hashToken(token) } })).toBe(1);
  });

  it('redefine a senha, derruba sessões e o token não serve de novo (410)', async () => {
    const oldSession = await loginAs(user);
    const token = await sendAndGetToken();
    const res = await reset(token);
    expect(res.status).toBe(200);

    expect((await request(app).get('/api/me').set(bearer(oldSession))).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD })).status).toBe(200);

    const reused = await reset(token, 'Outra#Senha2026x');
    expect(reused.status).toBe(410);
    expect(reused.body.code).toBe('TOKEN_INVALID_OR_EXPIRED');
  });

  it('pedir de novo invalida o link anterior', async () => {
    const first = await sendAndGetToken();
    const second = await sendAndGetToken();
    expect((await reset(first)).status).toBe(410);
    expect((await reset(second, 'Mais#Uma2026senha')).status).toBe(200);
  });

  it('token expirado → 410; token inexistente → 410', async () => {
    const token = await sendAndGetToken();
    await UserToken.update({ expires_at: new Date(Date.now() - 1000) }, { where: { token_hash: hashToken(token) } });
    expect((await reset(token)).status).toBe(410);
    expect((await reset('token-que-nao-existe')).status).toBe(410);
  });

  it('senha fraca → 400 e o token continua válido', async () => {
    const token = await sendAndGetToken();
    const weak = await reset(token, '12345678');
    expect(weak.status).toBe(400);
    expect((await reset(token, 'Valida#Depois2026')).status).toBe(200);
  });

  it('validação: e-mail inválido / sem token → 400', async () => {
    expect((await forgot('nao-e-email')).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password').send({ password: NEW_PASSWORD })).status).toBe(400);
  });

  it('usuário inexistente não gera token nem e-mail', async () => {
    await passwordResetService.forgotPassword('fantasma@x.com', { onSent: true });
    expect(mailer.outbox()).toHaveLength(0);
    expect(await User.count({ where: { email: 'fantasma@x.com' } })).toBe(0);
  });
});
