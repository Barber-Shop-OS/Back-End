// SEC-28: alertas de pico via requisições reais e revogação de sessões em massa.
jest.setTimeout(120000);

const { app, request, resetDatabase, createUser, loginAs, bearer, sequelize } = require('../../helpers/factories');
const logger = require('../../../utils/logger');
const securityAlerts = require('../../../shared/securityAlerts');
const { revokeSessions } = require('../../../shared/revokeSessions');
const { RefreshToken, User } = require('../../../models');

describe('SEC-28 — monitoramento e resposta a incidentes', () => {
  beforeAll(() => resetDatabase());
  afterAll(() => sequelize.close());
  afterEach(() => {
    delete process.env.SECURITY_ALERT_401_PER_MIN;
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
    securityAlerts.reset();
    jest.restoreAllMocks();
  });

  it('pico de 401 gera "[security] ALERTA" no log, uma vez por janela', async () => {
    process.env.SECURITY_ALERT_401_PER_MIN = '3';
    securityAlerts.reset();
    const spy = jest.spyOn(logger, 'error');
    for (let i = 0; i < 4; i += 1) await request(app).get('/api/me').set('Authorization', 'Bearer invalido');
    // o log é emitido no 'finish' da resposta
    await new Promise((resolve) => setImmediate(resolve));
    const alerts = spy.mock.calls.filter(([message]) => String(message).startsWith('[security] ALERTA'));
    expect(alerts).toHaveLength(1);
    expect(alerts[0][1]).toMatchObject({ alert: 'unauthorized', count: 3, last_url: '/api/me' });
  });

  it('webhook com segredo errado conta como falha de assinatura', async () => {
    process.env.ABACATEPAY_WEBHOOK_SECRET = 'segredo-certo';
    const spy = jest.spyOn(securityAlerts, 'record');
    const res = await request(app).post('/api/webhooks/abacatepay?webhookSecret=errado').send({ id: 'evt_1', event: 'subscription.completed' });
    expect(res.status).toBe(401);
    expect(spy).toHaveBeenCalledWith('webhook_signature', { reason: 'secret' });
  });

  it('revogação em massa por papel derruba access e refresh só desse papel', async () => {
    const admin = await createUser({ role: 'admin' });
    const client = await createUser();
    const adminToken = await loginAs(admin);
    const clientToken = await loginAs(client);
    const result = await revokeSessions({ role: 'admin' });
    expect(result.users).toBeGreaterThanOrEqual(1);

    expect((await request(app).get('/api/me').set(bearer(adminToken))).status).toBe(401);
    expect((await request(app).get('/api/me').set(bearer(clientToken))).status).toBe(200);
    expect(await RefreshToken.count({ where: { user_id: admin.id, revoked_at: null } })).toBe(0);
  });

  it('revogação total e validação do papel', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const before = (await User.findByPk(user.id)).token_version;
    await revokeSessions();
    expect((await User.findByPk(user.id)).token_version).toBe(before + 1);
    expect((await request(app).get('/api/me').set(bearer(token))).status).toBe(401);
    await expect(revokeSessions({ role: 'root' })).rejects.toThrow('Papel inválido');
  });
});
