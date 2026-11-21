// BE-58: registro do banner de cookies (prova do consentimento — LGPD art. 8º §2º).
const { app, request, resetDatabase, createUser, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { CookieConsent } = require('../../../models');
const { runRetention } = require('../../../modules/me/retentionService');

const CONSENT_ID = '5b1f3c2e-8a4d-4f6b-9c1e-2d3a4b5c6d7e';
const body = (overrides = {}) => ({ consent_id: CONSENT_ID, policy_version: '2026-11', analytics: true, action: 'accept_all', ...overrides });

describe('BE-58 — consentimento de cookies', () => {
  beforeEach(resetDatabase);
  afterAll(() => sequelize.close());

  it('anônimo registra a escolha; IP guardado só como hash e sem vínculo com usuário', async () => {
    const res = await request(app).post('/api/consents/cookies').set('User-Agent', 'JestBrowser/1.0').send(body());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ consent_id: CONSENT_ID, analytics: true, marketing: false });

    const row = await CookieConsent.findOne({ where: { consent_id: CONSENT_ID } });
    expect(row.user_id).toBeNull();
    expect(row.action).toBe('accept_all');
    expect(row.policy_version).toBe('2026-11');
    expect(row.user_agent).toBe('JestBrowser/1.0');
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.ip_hash).not.toContain('127.0.0.1');
  });

  it('com token vincula ao usuário e entra na exportação de dados', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    await request(app).post('/api/consents/cookies').set(bearer(token)).send(body()).expect(201);
    await request(app).post('/api/consents/cookies').set(bearer(token)).send(body({ action: 'withdraw', analytics: true })).expect(201);

    const rows = await CookieConsent.findAll({ where: { user_id: user.id }, order: [['id', 'ASC']] });
    expect(rows.map((r) => [r.action, r.analytics])).toEqual([['accept_all', true], ['withdraw', false]]);

    const exported = await request(app).get('/api/me/export').set(bearer(token)).expect(200);
    expect(exported.body.cookie_consents).toHaveLength(2);
    expect(exported.body.cookie_consents[0]).not.toHaveProperty('ip_hash');
  });

  it('recusa grava analytics=false mesmo que o corpo diga true', async () => {
    await request(app).post('/api/consents/cookies').send(body({ action: 'reject_all', analytics: true, marketing: true })).expect(201);
    const row = await CookieConsent.findOne({ where: { consent_id: CONSENT_ID } });
    expect([row.analytics, row.marketing]).toEqual([false, false]);
  });

  it('token inválido não impede o registro (segue anônimo)', async () => {
    await request(app).post('/api/consents/cookies').set('Authorization', 'Bearer lixo').send(body()).expect(201);
    expect((await CookieConsent.findOne({ where: { consent_id: CONSENT_ID } })).user_id).toBeNull();
  });

  it.each([
    ['consent_id inválido', { consent_id: 'abc' }],
    ['ação desconhecida', { action: 'maybe' }],
    ['sem analytics', { analytics: undefined }],
    ['versão longa demais', { policy_version: 'x'.repeat(21) }],
  ])('400 para %s', async (_label, overrides) => {
    const res = await request(app).post('/api/consents/cookies').send(body(overrides));
    expect(res.status).toBe(400);
    expect(await CookieConsent.count()).toBe(0);
  });

  it('retenção apaga registros com mais de 5 anos e mantém os recentes', async () => {
    const now = new Date('2032-01-10T00:00:00Z');
    await CookieConsent.bulkCreate([
      { consent_id: CONSENT_ID, policy_version: '2026-11', analytics: true, action: 'accept_all', created_at: new Date('2026-11-21T00:00:00Z') },
      { consent_id: CONSENT_ID, policy_version: '2026-11', analytics: false, action: 'withdraw', created_at: new Date('2031-06-01T00:00:00Z') },
    ]);
    const result = await runRetention(now);
    expect(result.consents).toBe(1);
    expect((await CookieConsent.findAll()).map((r) => r.action)).toEqual(['withdraw']);
  });
});
