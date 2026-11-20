// BE-30 / SEC-15: refresh token com rotação e detecção de reuso, cookie httpOnly (web) ou corpo
// (mobile), CSRF no cookie, logout, logout-all e lista de sessões.
jest.setTimeout(120000);

const { app, request, resetDatabase, createUser, bearer, sequelize, DEFAULT_PASSWORD } = require('../../helpers/factories');
const { RefreshToken } = require('../../../models');

const cookieFrom = (res) => {
  const header = (res.headers['set-cookie'] || []).find((item) => item.startsWith('bo_refresh='));
  return header ? header.split(';')[0] : null;
};
const web = (req) => req.set('X-Requested-With', 'XMLHttpRequest');

describe('BE-30 — sessões e refresh token', () => {
  let user;

  beforeAll(async () => {
    await resetDatabase();
    user = await createUser({ email: 'sessao@teste.com' });
  });
  afterAll(() => sequelize.close());

  const login = (mobile = false) => {
    const req = request(app).post('/api/auth/login');
    if (mobile) req.set('X-Client-Type', 'mobile');
    return req.send({ email: user.email, password: DEFAULT_PASSWORD });
  };

  describe('web (cookie)', () => {
    it('login define cookie httpOnly; SameSite=Strict; Path=/api/auth — refresh não vem no corpo', async () => {
      const res = await login();
      expect(res.status).toBe(200);
      const header = res.headers['set-cookie'].find((item) => item.startsWith('bo_refresh='));
      expect(header).toMatch(/HttpOnly/i);
      expect(header).toMatch(/SameSite=Strict/i);
      expect(header).toMatch(/Path=\/api\/auth/);
      expect(res.body.refresh_token).toBeUndefined();
      expect(res.body.token).toBeTruthy();
    });

    it('refresh com cookie gira o token; o antigo reapresentado revoga a família inteira', async () => {
      const first = cookieFrom(await login());
      const rotated = await web(request(app).post('/api/auth/refresh').set('Cookie', first));
      expect(rotated.status).toBe(200);
      expect(rotated.body.token).toBeTruthy();
      const second = cookieFrom(rotated);
      expect(second).not.toBe(first);

      const reuse = await web(request(app).post('/api/auth/refresh').set('Cookie', first));
      expect(reuse.status).toBe(401);
      expect(reuse.body.code).toBe('REFRESH_REUSED');
      // A sessão legítima (segundo token) também caiu.
      const after = await web(request(app).post('/api/auth/refresh').set('Cookie', second));
      expect(after.status).toBe(401);
    });

    it('CSRF: cookie sem X-Requested-With → 403; Origin desconhecida → 403', async () => {
      const cookie = cookieFrom(await login());
      const noHeader = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
      expect(noHeader.status).toBe(403);
      expect(noHeader.body.code).toBe('CSRF_REJECTED');
      const evil = await web(request(app).post('/api/auth/refresh').set('Cookie', cookie).set('Origin', 'https://evil.example'));
      expect(evil.status).toBe(403);
      const ok = await web(request(app).post('/api/auth/refresh').set('Cookie', cookie).set('Origin', 'http://localhost:5173'));
      expect(ok.status).toBe(200);
    });

    it('logout invalida o refresh e limpa o cookie', async () => {
      const cookie = cookieFrom(await login());
      const out = await web(request(app).post('/api/auth/logout').set('Cookie', cookie));
      expect(out.status).toBe(204);
      expect(out.headers['set-cookie'].join(';')).toMatch(/bo_refresh=;/);
      expect((await web(request(app).post('/api/auth/refresh').set('Cookie', cookie))).status).toBe(401);
    });
  });

  describe('mobile (corpo)', () => {
    it('refresh no corpo, sem cookie; rotação funciona', async () => {
      const res = await login(true);
      expect(res.body.refresh_token).toBeTruthy();
      expect(res.headers['set-cookie']).toBeUndefined();
      const next = await request(app).post('/api/auth/refresh').set('X-Client-Type', 'mobile').send({ refresh_token: res.body.refresh_token });
      expect(next.status).toBe(200);
      expect(next.body.refresh_token).toBeTruthy();
      expect(next.body.refresh_token).not.toBe(res.body.refresh_token);
    });

    it('refresh inválido/ausente → 401 REFRESH_INVALID; expirado → 401', async () => {
      expect((await request(app).post('/api/auth/refresh').send({ refresh_token: 'nada' })).body.code).toBe('REFRESH_INVALID');
      expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
      const res = await login(true);
      await RefreshToken.update({ expires_at: new Date(Date.now() - 1000) }, { where: { user_id: user.id, revoked_at: null } });
      expect((await request(app).post('/api/auth/refresh').send({ refresh_token: res.body.refresh_token })).status).toBe(401);
    });
  });

  describe('logout-all, troca de senha e sessões', () => {
    it('logout-all derruba access e refresh de todos os dispositivos', async () => {
      const a = await login(true);
      const b = await login(true);
      expect((await request(app).post('/api/auth/logout-all').set(bearer(a.body.token))).status).toBe(204);
      expect((await request(app).get('/api/me').set(bearer(b.body.token))).status).toBe(401);
      expect((await request(app).post('/api/auth/refresh').send({ refresh_token: b.body.refresh_token })).status).toBe(401);
    });

    it('troca de senha: outros refresh caem, a sessão atual recebe um novo', async () => {
      const other = await login(true);
      const current = await login(true);
      const res = await request(app)
        .post('/api/me/password')
        .set(bearer(current.body.token))
        .set('X-Client-Type', 'mobile')
        .send({ current_password: DEFAULT_PASSWORD, new_password: 'Nova#Senha2026sess' });
      expect(res.status).toBe(200);
      expect(res.body.refresh_token).toBeTruthy();
      expect((await request(app).post('/api/auth/refresh').send({ refresh_token: other.body.refresh_token })).status).toBe(401);
      expect((await request(app).post('/api/auth/refresh').send({ refresh_token: res.body.refresh_token })).status).toBe(200);
      await user.update({ password: require('bcryptjs').hashSync(DEFAULT_PASSWORD, 4) });
    });

    it('lista sessões ativas e encerra uma específica', async () => {
      const fresh = await createUser({ email: 'devices@teste.com' });
      const loginFresh = () => request(app).post('/api/auth/login').set('X-Client-Type', 'mobile').set('User-Agent', 'BarberOS-iOS/1.0').send({ email: fresh.email, password: DEFAULT_PASSWORD });
      const phone = await loginFresh();
      const tablet = await loginFresh();
      const list = await request(app).get('/api/me/sessions').set(bearer(phone.body.token)).send({ refresh_token: phone.body.refresh_token });
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(2);
      expect(list.body.items[0].user_agent).toBe('BarberOS-iOS/1.0');
      const current = list.body.items.find((item) => item.current);
      const otherSession = list.body.items.find((item) => !item.current);
      expect(current).toBeDefined();

      expect((await request(app).delete(`/api/me/sessions/${otherSession.id}`).set(bearer(phone.body.token))).status).toBe(204);
      expect((await request(app).post('/api/auth/refresh').send({ refresh_token: tablet.body.refresh_token })).status).toBe(401);
      expect((await request(app).delete(`/api/me/sessions/${otherSession.id}`).set(bearer(phone.body.token))).status).toBe(404);
    });
  });
});
