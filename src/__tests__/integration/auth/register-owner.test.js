// BE-21: cadastro do dono com barbearia e trial, atômico.
const { app, request, resetDatabase, createUser, sequelize } = require('../../helpers/factories');
const { User, Barbershop, Subscription } = require('../../../models');
const mailer = require('../../../shared/mailer');
const subscriptionService = require('../../../modules/subscription/subscriptionService');

const body = (extra = {}) => ({
  name: 'Carlos Silva',
  email: 'Carlos@Navalha.com',
  password: 'Tesoura#Navalha9',
  phone: '(11) 99999-0000',
  barbershop: { name: 'Navalha de Ouro' },
  ...extra,
});

describe('BE-21 — POST /api/auth/register-owner', () => {
  beforeEach(async () => {
    await resetDatabase();
    mailer.clearOutbox();
  });

  afterAll(() => sequelize.close());

  const post = (data) => request(app).post('/api/auth/register-owner').send(data);

  it('cria owner + barbearia com slug + trial e devolve token utilizável', async () => {
    const res = await post(body({ plan_code: 'essencial' }));
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'carlos@navalha.com', role: 'owner', phone: '+5511999990000' });
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.barbershop).toMatchObject({ name: 'Navalha de Ouro', slug: 'navalha-de-ouro' });
    expect(res.body.subscription).toMatchObject({ plan_code: 'essencial', status: 'trialing' });
    // BE-52: trial de 14 dias (constante única TRIAL_DAYS).
    const trialDays = (new Date(res.body.subscription.trial_ends_at).getTime() - Date.now()) / 86400000;
    expect(trialDays).toBeGreaterThan(13.99);
    expect(trialDays).toBeLessThanOrEqual(14);

    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.barbershops.map((b) => b.slug)).toEqual(['navalha-de-ouro']);
    expect(mailer.outbox().map((m) => m.to)).toContain('carlos@navalha.com');
  });

  it('e-mail duplicado → 409 EMAIL_IN_USE e nada é criado', async () => {
    await createUser({ email: 'carlos@navalha.com' });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
    expect(await Barbershop.count()).toBe(0);
  });

  it('falha no meio (assinatura) faz rollback: sem usuário nem barbearia órfãos', async () => {
    const spy = jest.spyOn(subscriptionService, 'startTrial').mockRejectedValueOnce(new Error('boom'));
    const res = await post(body());
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await User.count()).toBe(0);
    expect(await Barbershop.count()).toBe(0);
    expect(await Subscription.count()).toBe(0);
  });

  it('slug escolhido em uso → 409; reservado → 400', async () => {
    await post(body({ barbershop: { name: 'Casa X', slug: 'minha-casa' } }));
    const dup = await post(body({ email: 'b@b.com', barbershop: { name: 'Casa Y', slug: 'minha-casa' } }));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('SLUG_TAKEN');
    expect((await post(body({ email: 'c@c.com', barbershop: { name: 'Casa Z', slug: 'admin' } }))).status).toBe(400);
  });

  it.each([
    ['sem barbearia', { barbershop: undefined }],
    ['sem telefone', { phone: undefined }],
    ['senha fraca', { password: '12345678' }],
    ['plano inexistente', { plan_code: 'gold' }],
    ['role no corpo', { role: 'admin' }],
  ])('%s → 400', async (_label, override) => {
    const res = await post(body(override));
    expect(res.status).toBe(400);
    expect(await User.count()).toBe(0);
  });

  it('POST /api/auth/register continua criando só cliente', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Cli', email: 'cli@x.com', password: 'Tesoura#Navalha9' });
    expect(res.body.user.role).toBe('cliente');
  });
});
