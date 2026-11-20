// BE-27: verificação de e-mail — link no cadastro, confirmação, expiração (410) com reenvio, e dono
// não verificado usando o trial sem publicar a página nem receber agendamento online.
jest.setTimeout(120000);

const { app, request, resetDatabase, createUser, loginAs, bearer, openAllWeek, slotAt, sequelize } = require('../../helpers/factories');
const { User, UserToken, Branch, Address, Service, BarberService, Barber } = require('../../../models');
const mailer = require('../../../shared/mailer');
const { hashToken } = require('../../../shared/oneTimeToken');

const lastToken = () => {
  const mail = [...mailer.outbox()].reverse().find((item) => /verify-email\?token=/.test(item.html));
  return mail && decodeURIComponent(/verify-email\?token=([A-Za-z0-9_-]+)/.exec(mail.html)[1]);
};
const PASSWORD = 'Tesoura#Navalha9';

describe('BE-27 — verificação de e-mail', () => {
  beforeAll(() => resetDatabase());
  beforeEach(() => mailer.clearOutbox());
  afterAll(() => sequelize.close());

  const verify = (token) => request(app).post('/api/auth/verify-email').send({ token });

  it('cadastro de cliente envia o link; confirmar marca email_verified_at; reuso → 410', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Ana Cliente', email: 'ana@verifica.com', password: PASSWORD });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email_verified_at).toBeFalsy();
    const token = lastToken();
    expect(token).toBeTruthy();
    const ok = await verify(token);
    expect(ok.status).toBe(200);
    expect((await User.findOne({ where: { email: 'ana@verifica.com' } })).email_verified_at).not.toBeNull();
    expect((await verify(token)).status).toBe(410);
  });

  it('link expirado → 410 TOKEN_INVALID_OR_EXPIRED; reenviar gera link novo que funciona', async () => {
    const user = await createUser({ email: 'expira@verifica.com', verified: false });
    const token = await loginAs(user);
    const first = await request(app).post('/api/auth/resend-verification').set(bearer(token));
    expect(first.status).toBe(202);
    expect(first.body.already_verified).toBe(false);
    const oldLink = lastToken();
    await UserToken.update({ expires_at: new Date(Date.now() - 1000) }, { where: { token_hash: hashToken(oldLink) } });
    const expired = await verify(oldLink);
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe('TOKEN_INVALID_OR_EXPIRED');

    await request(app).post('/api/auth/resend-verification').set(bearer(token));
    expect((await verify(lastToken())).status).toBe(200);
    const again = await request(app).post('/api/auth/resend-verification').set(bearer(token));
    expect(again.body.already_verified).toBe(true);
  });

  it('reenviar exige login', async () => {
    expect((await request(app).post('/api/auth/resend-verification')).status).toBe(401);
  });

  describe('dono não verificado', () => {
    let owner;
    let shop;
    let branch;
    let service;
    let signupToken;

    beforeAll(async () => {
      mailer.clearOutbox();
      const res = await request(app)
        .post('/api/auth/register-owner')
        .send({ name: 'Dono Novo', email: 'dono@verifica.com', password: PASSWORD, phone: '11999990000', barbershop: { name: 'Navalha Nova' } });
      expect(res.status).toBe(201);
      owner = res.body;
      shop = res.body.barbershop;
      signupToken = lastToken();
      const address = await Address.create({ cep: '01001-000', number: 1, city: 'São Paulo', state: 'SP' });
      branch = await Branch.create({ name: 'Centro', barbershop_id: shop.id, address_id: address.id });
      await openAllWeek(branch);
      service = await Service.create({ name: 'Corte', description: 'Corte', price: 40, duration: 30, barbershop_id: shop.id });
      const barberUser = await createUser({ role: 'barbeiro' });
      const barber = await Barber.create({ user_id: barberUser.id, branch_id: branch.id });
      await BarberService.create({ barber_id: barber.id, service_id: service.id });
    });

    it('recebe o link no cadastro e usa o painel normalmente', async () => {
      expect(signupToken).toBeTruthy();
      const write = await request(app).put(`/api/services/${service.id}`).set(bearer(owner.token)).send({ price: 45 });
      expect(write.status).toBe(200);
    });

    it('página pública, busca e agendamento online desligados até verificar', async () => {
      expect((await request(app).get(`/api/barbershop/slug/${shop.slug}`)).status).toBe(404);
      const search = await request(app).get('/api/search/branches').query({ q: 'Navalha Nova' });
      expect(search.body.items).toHaveLength(0);
      const client = await loginAs(await createUser());
      const booking = await request(app)
        .post('/api/appointment')
        .set(bearer(client))
        .send({ branch_id: branch.id, service_id: service.id, start_at: slotAt(2, '10:00') });
      expect(booking.status).toBe(404);
      expect(booking.body.code).toBe('BARBERSHOP_UNAVAILABLE');
    });

    it('após confirmar, a página é publicada e o agendamento funciona', async () => {
      expect((await verify(signupToken)).status).toBe(200);
      expect((await request(app).get(`/api/barbershop/slug/${shop.slug}`)).status).toBe(200);
      const search = await request(app).get('/api/search/branches').query({ q: 'Navalha Nova' });
      expect(search.body.items).toHaveLength(1);
      const client = await loginAs(await createUser());
      const booking = await request(app)
        .post('/api/appointment')
        .set(bearer(client))
        .send({ branch_id: branch.id, service_id: service.id, start_at: slotAt(2, '11:00') });
      expect(booking.status).toBe(201);
    });
  });
});
