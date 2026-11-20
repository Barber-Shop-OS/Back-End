// BE-48: /api/v1 com /api como alias, cache nas rotas públicas e GET /api/app-config.
jest.setTimeout(60000);

const { app, request, resetDatabase, createTenant, createUser, loginAs, bearer, sequelize } = require('../helpers/factories');

describe('BE-48 — versionamento, cache e app-config', () => {
  let tenant;

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant();
  });
  afterAll(() => sequelize.close());

  it('/api/v1 e /api respondem igual (público e autenticado)', async () => {
    const plain = await request(app).get('/api/plans');
    const v1 = await request(app).get('/api/v1/plans');
    expect(v1.status).toBe(200);
    expect(v1.body).toEqual(plain.body);
    const token = await loginAs(await createUser());
    expect((await request(app).get('/api/v1/me').set(bearer(token))).status).toBe(200);
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/rota-inexistente')).status).toBe(404);
  });

  it('página pública: Cache-Control 30 s e ETag com 304', async () => {
    const shop = await tenant.barbershop.reload();
    const first = await request(app).get(`/api/v1/barbershop/slug/${shop.slug}`);
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('public, max-age=30');
    expect(first.headers.etag).toBeTruthy();
    const again = await request(app).get(`/api/barbershop/slug/${shop.slug}`).set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(304);
  });

  it('listas autenticadas no formato paginado padrão', async () => {
    const token = await loginAs(tenant.owner);
    const res = await request(app).get('/api/v1/appointment').set(bearer(token));
    expect(Object.keys(res.body).sort()).toEqual(['items', 'page', 'pageSize', 'total', 'totalPages']);
  });

  it('app-config público com versão mínima e recursos', async () => {
    process.env.MIN_APP_VERSION = '1.2.0';
    const res = await request(app).get('/api/app-config');
    expect(res.body.trial_days).toBe(14); // BE-52
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ api_version: 'v1', min_app_version: '1.2.0', features: { billing: expect.any(Boolean), uploads: expect.any(Boolean), google_login: expect.any(Boolean) } });
    delete process.env.MIN_APP_VERSION;
  });
});
