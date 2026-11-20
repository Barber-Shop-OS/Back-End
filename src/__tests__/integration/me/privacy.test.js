// BE-40 / SEC-20: LGPD — exportação, exclusão com anonimização e aceite dos termos.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, createAppointment, loginAs, bearer, sequelize, DEFAULT_PASSWORD } = require('../../helpers/factories');
const { User, Appointment, BarbershopClient, RefreshToken, Subscription } = require('../../../models');

describe('BE-40 — LGPD', () => {
  let tenant;

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant();
  });
  afterAll(() => sequelize.close());

  it('cadastro registra o aceite dos termos com versão', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Termo Aceito', email: 'termos@lgpd.com', password: DEFAULT_PASSWORD, terms_version: '2026-11' });
    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { email: 'termos@lgpd.com' } });
    expect(user.terms_version).toBe('2026-11');
    expect(user.terms_accepted_at).not.toBeNull();
  });

  it('export traz perfil e agendamentos, sem senha', async () => {
    const client = await createUser({ email: 'exporta@lgpd.com' });
    await createAppointment({ tenant, client });
    const res = await request(app).get('/api/me/export').set(bearer(await loginAs(client)));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body.profile.email).toBe('exporta@lgpd.com');
    expect(res.body.profile.password).toBeUndefined();
    expect(res.body.appointments).toHaveLength(1);
    expect(res.body.appointments[0].Branch.Barbershop.name).toBe(tenant.barbershop.name);
  });

  it('exclusão anonimiza, impede login e some das listagens; agendamento fica para a barbearia', async () => {
    const client = await createUser({ email: 'apaga@lgpd.com', name: 'Pessoa Real' });
    await client.update({ phone: '+5511912345678' });
    const appointment = await createAppointment({ tenant, client });
    await BarbershopClient.create({ barbershop_id: tenant.barbershop.id, user_id: client.id, name: 'Pessoa Real', phone: '+5511912345678', email: 'apaga@lgpd.com' });
    const token = await loginAs(client);
    await request(app).post('/api/auth/login').set('X-Client-Type', 'mobile').send({ email: 'apaga@lgpd.com', password: DEFAULT_PASSWORD });

    expect((await request(app).delete('/api/me').set(bearer(token)).send({ password: 'errada' })).status).toBe(400);
    const res = await request(app).delete('/api/me').set(bearer(token)).send({ password: DEFAULT_PASSWORD });
    expect(res.status).toBe(200);

    expect((await request(app).post('/api/auth/login').send({ email: 'apaga@lgpd.com', password: DEFAULT_PASSWORD })).status).toBe(401);
    expect((await request(app).get('/api/me').set(bearer(token))).status).toBe(401);
    const raw = await User.findByPk(client.id, { paranoid: false });
    expect(raw).toMatchObject({ name: 'Usuário removido', email: `deleted+${client.id}@deleted.invalid`, phone: null, password: null });
    expect(raw.deleted_at).not.toBeNull();
    expect(await RefreshToken.count({ where: { user_id: client.id } })).toBe(0);

    expect(await Appointment.findByPk(appointment.id)).not.toBeNull();
    const ownerToken = await loginAs(tenant.owner);
    const clients = await request(app).get(`/api/barbershop/${tenant.barbershop.id}/clients`).set(bearer(ownerToken));
    expect(JSON.stringify(clients.body)).not.toMatch(/Pessoa Real|apaga@lgpd|912345678/);
    const agenda = await request(app).get('/api/appointment').set(bearer(ownerToken));
    expect(JSON.stringify(agenda.body)).not.toMatch(/Pessoa Real|apaga@lgpd/);
  });

  it('dono com assinatura vigente → 409 ACTIVE_SUBSCRIPTION; após cancelar/expirar, exclui', async () => {
    const shop = await createTenant({ subscription: { status: 'active' } });
    const token = await loginAs(shop.owner);
    const blocked = await request(app).delete('/api/me').set(bearer(token)).send({ password: DEFAULT_PASSWORD });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('ACTIVE_SUBSCRIPTION');
    await Subscription.update({ status: 'canceled' }, { where: { barbershop_id: shop.barbershop.id } });
    const ok = await request(app).post('/api/me/delete').set(bearer(token)).send({ password: DEFAULT_PASSWORD });
    expect(ok.status).toBe(200);
    expect((await request(app).get(`/api/barbershop/slug/${(await shop.barbershop.reload({ paranoid: false })).slug}`)).status).toBe(404);
  });
});
