// BE-22 / SEC-26: convite de barbeiro com token de uso único.
const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  loginAs,
  bearer,
  sequelize,
} = require('../../helpers/factories');
const { Invitation, Barber, User, Subscription } = require('../../../models');
const mailer = require('../../../shared/mailer');

const tokenFromLastMail = () => {
  const mail = mailer.outbox()[mailer.outbox().length - 1];
  return /\/convite\/([A-Za-z0-9_-]+)/.exec(mail.text)[1];
};

describe('BE-22 — convite de barbeiro', () => {
  let tenant;
  let other;
  let ownerToken;

  beforeEach(async () => {
    await resetDatabase();
    mailer.clearOutbox();
    tenant = await createTenant({ name: 'Casa Navalha' });
    other = await createTenant();
    ownerToken = await loginAs(tenant.owner);
  });

  afterAll(() => sequelize.close());

  const invite = (email = 'novo@barbeiro.com', token = ownerToken, branch = tenant.branch) =>
    request(app).post(`/api/branch/${branch.id}/invitations`).set(bearer(token)).send({ email, display_name: 'Zé' });

  it('dono convida; token só existe como hash no banco; e-mail tem o link', async () => {
    const res = await invite();
    expect(res.status).toBe(201);
    expect(res.body.invitation).toMatchObject({ email: 'novo@barbeiro.com', status: 'pending' });
    const token = tokenFromLastMail();
    const row = await Invitation.findByPk(res.body.invitation.id);
    expect(row.token_hash).toHaveLength(64);
    expect(row.token_hash).not.toContain(token);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it('preview público mostra barbearia e filial', async () => {
    await invite();
    const res = await request(app).get(`/api/invitations/${tokenFromLastMail()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ barbershop: { name: 'Casa Navalha' }, branch: { id: tenant.branch.id }, has_account: false });
  });

  it('sem conta: aceita criando conta, vira barbeiro e recebe token; reuso → 410', async () => {
    await invite();
    const token = tokenFromLastMail();
    const res = await request(app).post(`/api/invitations/${token}/accept`).send({ name: 'José Souza', password: 'Tesoura#Navalha9' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({ email: 'novo@barbeiro.com', role: 'barbeiro' });
    expect(res.body.barber).toMatchObject({ branch_id: tenant.branch.id, display_name: 'Zé' });

    const again = await request(app).post(`/api/invitations/${token}/accept`).send({ name: 'José', password: 'Tesoura#Navalha9' });
    expect(again.status).toBe(410);
    expect(again.body.code).toBe('INVITATION_GONE');
    expect((await request(app).get(`/api/invitations/${token}`)).status).toBe(410);
  });

  it('logado com o mesmo e-mail aceita; e-mail diferente → 403', async () => {
    const person = await createUser({ email: 'novo@barbeiro.com' });
    const stranger = await createUser({ email: 'outro@x.com' });
    await invite();
    const token = tokenFromLastMail();
    const wrong = await request(app).post(`/api/invitations/${token}/accept`).set(bearer(await loginAs(stranger))).send({});
    expect(wrong.status).toBe(403);
    const ok = await request(app).post(`/api/invitations/${token}/accept`).set(bearer(await loginAs(person))).send({});
    expect(ok.status).toBe(200);
    expect(ok.body).not.toHaveProperty('token');
    expect(await Barber.count({ where: { user_id: person.id, branch_id: tenant.branch.id } })).toBe(1);
  });

  it('conta existente sem login → 401 LOGIN_REQUIRED (não cria conta duplicada)', async () => {
    await createUser({ email: 'novo@barbeiro.com' });
    await invite();
    const res = await request(app).post(`/api/invitations/${tokenFromLastMail()}/accept`).send({ name: 'X Y', password: 'Tesoura#Navalha9' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('LOGIN_REQUIRED');
    expect(await User.count({ where: { email: 'novo@barbeiro.com' } })).toBe(1);
  });

  it('expirado → 410; revogado → 410; reenviar invalida o link antigo', async () => {
    const created = await invite();
    const first = tokenFromLastMail();
    const resend = await request(app)
      .post(`/api/branch/${tenant.branch.id}/invitations/${created.body.invitation.id}/resend`)
      .set(bearer(ownerToken));
    expect(resend.status).toBe(200);
    const second = tokenFromLastMail();
    expect(second).not.toBe(first);
    expect((await request(app).get(`/api/invitations/${first}`)).status).toBe(404);

    await Invitation.update({ expires_at: new Date(Date.now() - 1000) }, { where: { id: created.body.invitation.id } });
    expect((await request(app).get(`/api/invitations/${second}`)).status).toBe(410);

    const fresh = await invite('outro@barbeiro.com');
    const token = tokenFromLastMail();
    await request(app).delete(`/api/branch/${tenant.branch.id}/invitations/${fresh.body.invitation.id}`).set(bearer(ownerToken));
    expect((await request(app).get(`/api/invitations/${token}`)).status).toBe(410);
  });

  it('owner A não convida para filial de B (403) nem lista os convites de B', async () => {
    expect((await invite('a@b.com', ownerToken, other.branch)).status).toBe(403);
    expect((await request(app).get(`/api/branch/${other.branch.id}/invitations`).set(bearer(ownerToken))).status).toBe(403);
  });

  it('limite de barbeiros do plano → 402 PLAN_LIMIT_REACHED com upgrade sugerido', async () => {
    await Subscription.update({ status: 'active', plan_code: 'essencial' }, { where: { barbershop_id: tenant.barbershop.id } });
    for (let i = 0; i < 2; i += 1) {
      const user = await createUser();
      await Barber.create({ user_id: user.id, branch_id: tenant.branch.id, bio: '' });
    }
    const res = await invite();
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { resource: 'barbers', limit: 3, used: 3, upgrade_to: 'profissional' } });
  });

  it('token malformado → 400; inexistente → 404', async () => {
    expect((await request(app).get('/api/invitations/curto')).status).toBe(400);
    expect((await request(app).get(`/api/invitations/${'a'.repeat(43)}`)).status).toBe(404);
  });
});
