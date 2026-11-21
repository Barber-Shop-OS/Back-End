// SEC-07 / SEC-18 / SEC-29: limite de login por conta, superfície da API e URLs de log sem tokens.
jest.setTimeout(60000);

describe('SEC — endurecimento da API', () => {
  describe('SEC-29 — URLs no log sem tokens', () => {
    const { safeUrl } = require('../../middlewares/requestLoggerMiddleware');
    it('mascara token de convite e parâmetros sensíveis', () => {
      expect(safeUrl('/api/invitations/abcDEF123_-x/accept')).toBe('/api/invitations/[REDACTED]/accept');
      expect(safeUrl('/api/webhooks/abacatepay?webhookSecret=s3cr3t&x=1')).toBe('/api/webhooks/abacatepay?webhookSecret=[REDACTED]&x=1');
      expect(safeUrl('/verify-email?token=abc')).toBe('/verify-email?token=[REDACTED]');
      expect(safeUrl('/api/plans?page=2')).toBe('/api/plans?page=2');
    });
  });

  describe('SEC-07 — falhas de login por conta', () => {
    let request;
    let app;
    let factories;

    beforeAll(async () => {
      process.env.RATE_LIMIT_IN_TESTS = 'true';
      jest.resetModules();
      factories = require('../helpers/factories');
      ({ request, app } = factories);
      await factories.resetDatabase();
      await factories.createUser({ email: 'alvo@sec.com' });
    });
    afterAll(async () => {
      delete process.env.RATE_LIMIT_IN_TESTS;
      await factories.sequelize.close();
    });

    it('5 senhas erradas na mesma conta → 429 (mesmo vindo de "IPs" diferentes); outra conta segue', async () => {
      for (let i = 0; i < 5; i += 1) {
        const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: 'alvo@sec.com', password: 'errada' });
        expect(res.status).toBe(401);
      }
      const blocked = await request(app).post('/api/auth/login').send({ email: 'ALVO@sec.com', password: factories.DEFAULT_PASSWORD });
      expect(blocked.status).toBe(429);
      const other = await request(app).post('/api/auth/login').send({ email: 'outro@sec.com', password: 'x' });
      expect(other.status).toBe(401);
    });

    it('renovar a sessão (/auth/refresh) não consome a cota do login: 15 recargas seguidas não dão 429', async () => {
      for (let i = 0; i < 15; i += 1) {
        const res = await request(app).post('/api/auth/refresh').set('X-Forwarded-For', '10.9.9.9');
        expect(res.status).toBe(401);
      }
    });
  });

  describe('SEC-18 — superfície em produção', () => {
    it('Swagger/OpenAPI não são servidos em produção e GET / não revela versão', async () => {
      jest.resetModules();
      const previous = { ...process.env };
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGINS = 'https://app.barberos.test';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'x';
      process.env.DB_NAME = 'x';
      const prodApp = require('../../app');
      const supertest = require('supertest');
      expect((await supertest(prodApp).get('/api/docs.json')).status).toBe(404);
      expect((await supertest(prodApp).get('/api/docs/')).status).toBe(404);
      const root = await supertest(prodApp).get('/');
      expect(root.text).toBe('OK');
      expect(root.headers['x-powered-by']).toBeUndefined();
      expect(root.headers['strict-transport-security']).toBeDefined();
      process.env = previous;
      await require('../../config/sequelize').close().catch(() => {});
    });
  });
});
