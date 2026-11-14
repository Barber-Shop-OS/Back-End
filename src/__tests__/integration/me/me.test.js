// BE-20: /api/me — cada usuário só vê os próprios dados.
const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  createAppointment,
  loginAs,
  bearer,
  sequelize,
} = require('../../helpers/factories');

describe('BE-20 — /api/me', () => {
  let tenant;
  let other;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant({ name: 'Casa A' });
    other = await createTenant({ name: 'Casa B' });
  });

  afterAll(() => sequelize.close());

  it('owner vê o perfil com as próprias barbearias, sem senha', async () => {
    const token = await loginAs(tenant.owner);
    const res = await request(app).get('/api/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: tenant.owner.id, role: 'owner', roles: ['owner'], barber_profiles: [] });
    expect(res.body.barbershops.map((b) => b.id)).toEqual([tenant.barbershop.id]);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('token_version');
    const alias = await request(app).get('/api/auth/me').set(bearer(token));
    expect(alias.body).toEqual(res.body);
  });

  it('barbeiro vê os próprios perfis de barbeiro', async () => {
    const res = await request(app).get('/api/me').set(bearer(await loginAs(tenant.barberUser)));
    expect(res.body.barber_profiles).toEqual([
      expect.objectContaining({ id: tenant.barber.id, branch_id: tenant.branch.id }),
    ]);
    expect(res.body.barbershops).toEqual([]);
  });

  it('GET /me/barbershops lista só as do usuário', async () => {
    const res = await request(app).get('/api/me/barbershops').set(bearer(await loginAs(other.owner)));
    expect(res.body.items.map((b) => b.id)).toEqual([other.barbershop.id]);
  });

  it('GET /me/appointments separa próximos e passados e só traz os do cliente', async () => {
    const client = await createUser();
    const stranger = await createUser();
    const future = await createAppointment({ tenant, client });
    const past = await createAppointment({ tenant, client, date: new Date(Date.now() - 86400000) });
    await createAppointment({ tenant, client: stranger });
    const token = await loginAs(client);

    const upcoming = await request(app).get('/api/me/appointments').set(bearer(token));
    expect(upcoming.body.items.map((a) => a.id)).toEqual([future.id]);
    const previous = await request(app).get('/api/me/appointments?scope=past').set(bearer(token));
    expect(previous.body.items.map((a) => a.id)).toEqual([past.id]);
    expect(JSON.stringify(upcoming.body)).not.toContain('@');
  });

  it('paginação limitada e scope inválido → 400', async () => {
    const token = await loginAs(await createUser());
    expect((await request(app).get('/api/me/appointments?pageSize=100000').set(bearer(token))).body.pageSize).toBe(100);
    expect((await request(app).get('/api/me/appointments?scope=all').set(bearer(token))).status).toBe(400);
  });

  it('PATCH /me altera nome/telefone; role e email → 400', async () => {
    const client = await createUser();
    const token = await loginAs(client);
    const ok = await request(app).patch('/api/me').set(bearer(token)).send({ name: 'Novo Nome', phone: '11 98888-0000' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ name: 'Novo Nome', phone: '+5511988880000' });
    expect((await request(app).patch('/api/me').set(bearer(token)).send({ role: 'admin' })).status).toBe(400);
    expect((await request(app).patch('/api/me').set(bearer(token)).send({ email: 'x@y.com' })).status).toBe(400);
  });

  it('sem login → 401', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me/appointments')).status).toBe(401);
  });
});
