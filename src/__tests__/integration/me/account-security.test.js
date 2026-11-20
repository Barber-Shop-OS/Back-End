// BE-29: trocar senha e e-mail — senha atual conferida, sessões derrubadas, e-mail só muda após
// confirmação no novo endereço, avisos ao e-mail antigo.
jest.setTimeout(120000);

const { app, request, resetDatabase, createUser, loginAs, bearer, sequelize, DEFAULT_PASSWORD } = require('../../helpers/factories');
const { User, UserToken } = require('../../../models');
const mailer = require('../../../shared/mailer');
const { hashToken } = require('../../../shared/oneTimeToken');

const NEW_PASSWORD = 'Outra#Navalha2026';
const changeLink = () => {
  const mail = [...mailer.outbox()].reverse().find((item) => /confirmar-email\?token=/.test(item.html));
  return mail && decodeURIComponent(/confirmar-email\?token=([A-Za-z0-9_-]+)/.exec(mail.html)[1]);
};

describe('BE-29 — trocar senha e e-mail', () => {
  beforeAll(() => resetDatabase());
  beforeEach(() => mailer.clearOutbox());
  afterAll(() => sequelize.close());

  describe('POST /api/me/password', () => {
    it('senha atual errada → 400 INVALID_CURRENT_PASSWORD', async () => {
      const user = await createUser();
      const res = await request(app).post('/api/me/password').set(bearer(await loginAs(user))).send({ current_password: 'errada', new_password: NEW_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');
    });

    it('troca, devolve token novo, derruba as outras sessões e avisa por e-mail', async () => {
      const user = await createUser({ email: 'troca@senha.com' });
      const sessionA = await loginAs(user);
      const sessionB = await loginAs(user);
      const res = await request(app).post('/api/me/password').set(bearer(sessionA)).send({ current_password: DEFAULT_PASSWORD, new_password: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect((await request(app).get('/api/me').set(bearer(sessionB))).status).toBe(401);
      expect((await request(app).get('/api/me').set(bearer(sessionA))).status).toBe(401);
      expect((await request(app).get('/api/me').set(bearer(res.body.token))).status).toBe(200);
      expect((await request(app).post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD })).status).toBe(200);
      expect(mailer.outbox().some((mail) => mail.to === 'troca@senha.com' && /senha foi alterada/i.test(mail.subject))).toBe(true);
    });

    it('política: igual ao e-mail/fraca → 400; igual à atual → 400', async () => {
      const user = await createUser({ email: 'fraca@senha.com' });
      const token = await loginAs(user);
      expect((await request(app).post('/api/me/password').set(bearer(token)).send({ current_password: DEFAULT_PASSWORD, new_password: '12345678' })).status).toBe(400);
      expect((await request(app).post('/api/me/password').set(bearer(token)).send({ current_password: DEFAULT_PASSWORD, new_password: DEFAULT_PASSWORD })).status).toBe(400);
    });

    it('conta só-Google define a primeira senha sem a atual', async () => {
      const user = await createUser({ email: 'google@only.com' });
      const token = await loginAs(user);
      await user.update({ password: null });
      const res = await request(app).post('/api/me/password').set(bearer(token)).send({ new_password: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect((await request(app).post('/api/auth/login').send({ email: 'google@only.com', password: NEW_PASSWORD })).status).toBe(200);
    });
  });

  describe('troca de e-mail', () => {
    it('pede, envia link ao novo e aviso ao antigo; só troca após confirmar', async () => {
      const user = await createUser({ email: 'antigo@mail.com' });
      const token = await loginAs(user);
      const res = await request(app).post('/api/me/email').set(bearer(token)).send({ new_email: 'Novo@Mail.com', password: DEFAULT_PASSWORD });
      expect(res.status).toBe(202);
      expect(mailer.outbox().map((mail) => mail.to).sort()).toEqual(['antigo@mail.com', 'novo@mail.com']);
      expect((await user.reload()).email).toBe('antigo@mail.com');

      const link = changeLink();
      const confirm = await request(app).post('/api/auth/confirm-email-change').send({ token: link });
      expect(confirm.status).toBe(200);
      await user.reload();
      expect(user.email).toBe('novo@mail.com');
      expect(user.email_verified_at).not.toBeNull();
      expect((await request(app).get('/api/me').set(bearer(token))).status).toBe(401);
      expect(mailer.outbox().some((mail) => mail.to === 'antigo@mail.com' && /alterado/i.test(mail.subject))).toBe(true);
      expect((await request(app).post('/api/auth/confirm-email-change').send({ token: link })).status).toBe(410);
    });

    it('senha errada → 400; e-mail em uso → 409; sem confirmação nada muda', async () => {
      await createUser({ email: 'ocupado@mail.com' });
      const user = await createUser({ email: 'quer@trocar.com' });
      const token = await loginAs(user);
      expect((await request(app).post('/api/me/email').set(bearer(token)).send({ new_email: 'livre@mail.com', password: 'errada' })).body.code).toBe('INVALID_CURRENT_PASSWORD');
      expect((await request(app).post('/api/me/email').set(bearer(token)).send({ new_email: 'ocupado@mail.com', password: DEFAULT_PASSWORD })).status).toBe(409);
    });

    it('e-mail ocupado entre o pedido e a confirmação → 409; link expirado → 410', async () => {
      const user = await createUser({ email: 'corrida@mail.com' });
      const token = await loginAs(user);
      await request(app).post('/api/me/email').set(bearer(token)).send({ new_email: 'disputado@mail.com', password: DEFAULT_PASSWORD });
      const link = changeLink();
      await createUser({ email: 'disputado@mail.com' });
      expect((await request(app).post('/api/auth/confirm-email-change').send({ token: link })).status).toBe(409);
      expect((await User.findByPk(user.id)).email).toBe('corrida@mail.com');

      mailer.clearOutbox();
      await request(app).post('/api/me/email').set(bearer(token)).send({ new_email: 'outro@mail.com', password: DEFAULT_PASSWORD });
      const expiring = changeLink();
      await UserToken.update({ expires_at: new Date(Date.now() - 1000) }, { where: { token_hash: hashToken(expiring) } });
      expect((await request(app).post('/api/auth/confirm-email-change').send({ token: expiring })).status).toBe(410);
    });

    it('conta só-Google precisa definir senha antes → 400 PASSWORD_REQUIRED', async () => {
      const user = await createUser({ email: 'sem@senha.com' });
      const token = await loginAs(user);
      await user.update({ password: null });
      const res = await request(app).post('/api/me/email').set(bearer(token)).send({ new_email: 'x@y.com', password: 'qualquer' });
      expect(res.body.code).toBe('PASSWORD_REQUIRED');
    });
  });
});
