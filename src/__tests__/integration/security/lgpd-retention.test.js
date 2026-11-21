// SEC-20: retenção LGPD — barbearias encerradas há mais de 90 dias têm os dados pessoais anonimizados.
jest.setTimeout(120000);

const { resetDatabase, createUser, createTenant, createAppointment, sequelize } = require('../../helpers/factories');
const { runRetention } = require('../../../modules/me/retentionService');
const { Barbershop, BarbershopClient, Appointment, Subscription, RefreshToken, UserNotification } = require('../../../models');

const DAY = 86400000;
const now = new Date('2027-06-01T12:00:00Z');

const tenantWithClient = async (subscription) => {
  const tenant = await createTenant({ subscription });
  const client = await createUser();
  const ficha = await BarbershopClient.create({ barbershop_id: tenant.barbershop.id, user_id: client.id, name: 'Maria Cliente', phone: '11999998888', email: 'maria@x.com', notes: 'alergia' });
  const appointment = await createAppointment({ tenant, client, date: new Date(now.getTime() - 200 * DAY), notes: 'prefere tesoura' });
  return { tenant, ficha, appointment };
};

describe('SEC-20 — retenção LGPD', () => {
  beforeAll(() => resetDatabase());
  afterAll(() => sequelize.close());

  it('anonimiza só barbearias encerradas há mais de 90 dias, uma única vez', async () => {
    const old = await tenantWithClient({ status: 'canceled', current_period_end: new Date(now.getTime() - 120 * DAY), billing_tax_id: '12345678909' });
    await Subscription.update({ updated_at: new Date(now.getTime() - 120 * DAY) }, { where: { barbershop_id: old.tenant.barbershop.id }, silent: true });
    const recent = await tenantWithClient({ status: 'canceled', current_period_end: new Date(now.getTime() - 10 * DAY) });
    const active = await tenantWithClient({ status: 'active', current_period_end: new Date(now.getTime() + 10 * DAY) });

    const first = await runRetention(now);
    expect(first.barbershops).toEqual([old.tenant.barbershop.id]);

    const ficha = await BarbershopClient.findByPk(old.ficha.id);
    expect(ficha).toMatchObject({ name: 'Cliente removido', phone: null, email: null, notes: null, user_id: null });
    expect((await Appointment.findByPk(old.appointment.id)).notes).toBeNull();
    expect(Number((await Appointment.findByPk(old.appointment.id)).price_snapshot)).toBe(50); // valores ficam
    expect((await Subscription.findOne({ where: { barbershop_id: old.tenant.barbershop.id } })).billing_tax_id).toBeNull();
    expect((await Barbershop.findByPk(old.tenant.barbershop.id)).anonymized_at).toBeTruthy();

    for (const keep of [recent, active]) {
      expect((await BarbershopClient.findByPk(keep.ficha.id)).name).toBe('Maria Cliente');
      expect((await Appointment.findByPk(keep.appointment.id)).notes).toBe('prefere tesoura');
    }

    const second = await runRetention(now);
    expect(second.barbershops).toEqual([]);
  });

  it('barbearia excluída há mais de 90 dias também é anonimizada', async () => {
    const gone = await tenantWithClient({ status: 'trialing' });
    await Barbershop.update({ deleted_at: new Date(now.getTime() - 100 * DAY) }, { where: { id: gone.tenant.barbershop.id } });
    const result = await runRetention(now);
    expect(result.barbershops).toContain(gone.tenant.barbershop.id);
    expect((await BarbershopClient.findByPk(gone.ficha.id)).phone).toBeNull();
  });

  it('remove refresh tokens vencidos há 30 dias e notificações lidas há 180 dias', async () => {
    const user = await createUser();
    await RefreshToken.create({ user_id: user.id, family_id: 'f-old', token_hash: 'h-old', expires_at: new Date(now.getTime() - 40 * DAY) });
    await RefreshToken.create({ user_id: user.id, family_id: 'f-new', token_hash: 'h-new', expires_at: new Date(now.getTime() + DAY) });
    await UserNotification.create({ user_id: user.id, type: 'appointment', title: 'Lida', body: 'x', read_at: new Date(now.getTime() - 200 * DAY) });
    await UserNotification.create({ user_id: user.id, type: 'appointment', title: 'Nova', body: 'x' });
    const result = await runRetention(now);
    expect(result.refresh).toBeGreaterThanOrEqual(1);
    expect(await RefreshToken.count({ where: { user_id: user.id } })).toBe(1);
    expect((await UserNotification.findAll({ where: { user_id: user.id } })).map((n) => n.title)).toEqual(['Nova']);
  });
});
