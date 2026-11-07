// BE-09: caminhos felizes e filtros de listagem dos módulos de catálogo (barbeiro, filial, serviço,
// usuário, pagamento) — complementa os testes de autorização.
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
} = require('../helpers/factories');
const { Barber, Branch, Service, User, Payment } = require('../../models');

describe('BE-09 — CRUD e listagens', () => {
  let tenant;
  let ownerToken;
  let adminToken;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant({ name: 'Navalha' });
    ownerToken = await loginAs(tenant.owner);
    adminToken = await loginAs(await createUser({ role: 'admin' }));
  });

  afterAll(() => sequelize.close());

  describe('barbeiros', () => {
    it('lista pública filtra por filial, pagina e não expõe senha', async () => {
      const other = await createTenant();
      const res = await request(app).get(`/api/barber?branch_id=${tenant.branch.id}&pageSize=5&sortBy=bio&sortDir=asc`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(tenant.barber.id);
      expect(JSON.stringify(res.body)).not.toContain('password');
      expect(res.body.items.some((item) => item.id === other.barber.id)).toBe(false);
    });

    it('detalhe público e 404 para inexistente', async () => {
      expect((await request(app).get(`/api/barber/${tenant.barber.id}`)).status).toBe(200);
      expect((await request(app).get('/api/barber/999999')).status).toBe(404);
    });

    it('dono cadastra barbeiro na própria filial', async () => {
      const person = await createUser();
      const res = await request(app)
        .post('/api/barber')
        .set(bearer(ownerToken))
        .send({ user_id: person.id, branch_id: tenant.branch.id, bio: '  Barba e bigode ' });
      expect(res.status).toBe(201);
      expect(res.body.barber.bio).toBe('Barba e bigode');
    });

    it('dono transfere barbeiro entre filiais da mesma barbearia', async () => {
      const second = await Branch.create({ name: 'Filial 2', barbershop_id: tenant.barbershop.id, address_id: tenant.address.id });
      const res = await request(app).put(`/api/barber/${tenant.barber.id}`).set(bearer(ownerToken)).send({ branch_id: second.id });
      expect(res.status).toBe(200);
      expect(res.body.barber.branch_id).toBe(second.id);
    });

    it('remover o último perfil de barbeiro rebaixa o usuário para cliente', async () => {
      const res = await request(app).delete(`/api/barber/${tenant.barber.id}`).set(bearer(ownerToken));
      expect(res.status).toBe(204);
      expect(await Barber.findByPk(tenant.barber.id)).toBeNull();
      expect((await User.findByPk(tenant.barberUser.id)).role).toBe('cliente');
    });

    it('remover barbeiro que ainda tem outro perfil mantém o papel', async () => {
      const second = await Branch.create({ name: 'Filial 2', barbershop_id: tenant.barbershop.id, address_id: tenant.address.id });
      await Barber.create({ user_id: tenant.barberUser.id, branch_id: second.id, bio: 'Também aqui' });
      await request(app).delete(`/api/barber/${tenant.barber.id}`).set(bearer(ownerToken));
      expect((await User.findByPk(tenant.barberUser.id)).role).toBe('barbeiro');
    });

    it('bio vazia no update → 400', async () => {
      const res = await request(app).put(`/api/barber/${tenant.barber.id}`).set(bearer(ownerToken)).send({ bio: '   ' });
      expect(res.status).toBe(400);
    });
  });

  describe('filiais', () => {
    it('lista filtra por barbearia e por nome', async () => {
      await createTenant();
      const byShop = await request(app).get(`/api/branch?barbershop_id=${tenant.barbershop.id}`);
      expect(byShop.status).toBe(200);
      expect(byShop.body.items.map((item) => item.id)).toEqual([tenant.branch.id]);

      const byName = await request(app).get(`/api/branch?name=${encodeURIComponent(tenant.branch.name)}&sortBy=name`);
      expect(byName.body.items).toHaveLength(1);
    });

    it('detalhe inclui endereço e barbeiros; 404 para inexistente', async () => {
      const res = await request(app).get(`/api/branch/${tenant.branch.id}`);
      expect(res.status).toBe(200);
      expect(res.body.Address).toBeDefined();
      expect(res.body.barbers || res.body.Barbers).toBeDefined();
      expect((await request(app).get('/api/branch/999999')).status).toBe(404);
    });

    it('dono exclui a própria filial', async () => {
      const extra = await Branch.create({ name: 'Temporária', barbershop_id: tenant.barbershop.id, address_id: tenant.address.id });
      const res = await request(app).delete(`/api/branch/${extra.id}`).set(bearer(ownerToken));
      expect(res.status).toBe(200);
      expect(await Branch.findByPk(extra.id)).toBeNull();
    });

    it('nome vazio no update → 400', async () => {
      const res = await request(app).put(`/api/branch/${tenant.branch.id}`).set(bearer(ownerToken)).send({ name: '  ' });
      expect(res.status).toBe(400);
    });
  });

  describe('serviços', () => {
    it('lista filtra por barbearia e nome; detalhe e 404', async () => {
      const other = await createTenant();
      const list = await request(app).get(`/api/services?barbershop_id=${tenant.barbershop.id}&name=Cor&sortBy=price`);
      expect(list.status).toBe(200);
      expect(list.body.items.map((item) => item.id)).toEqual([tenant.service.id]);
      expect(list.body.items.some((item) => item.id === other.service.id)).toBe(false);

      expect((await request(app).get(`/api/services/${tenant.service.id}`)).status).toBe(200);
      expect((await request(app).get('/api/services/999999')).status).toBe(404);
    });

    it('dono cria, edita e exclui serviço da própria barbearia', async () => {
      const created = await request(app)
        .post('/api/services')
        .set(bearer(ownerToken))
        .send({ name: ' Barba ', description: 'Barba completa', price: 35.5, duration: 30, barbershop_id: tenant.barbershop.id });
      expect(created.status).toBe(201);
      expect(created.body.service.name).toBe('Barba');

      const id = created.body.service.id;
      const updated = await request(app)
        .put(`/api/services/${id}`)
        .set(bearer(ownerToken))
        .send({ name: 'Barba premium', description: 'Com toalha quente', duration: 45 });
      expect(updated.status).toBe(200);
      expect(updated.body.service.duration).toBe(45);

      const removed = await request(app).delete(`/api/services/${id}`).set(bearer(ownerToken));
      expect(removed.status).toBe(204);
      expect(await Service.findByPk(id)).toBeNull();
    });
  });

  describe('usuários (admin)', () => {
    it('admin lista com filtro e paginação, sem senha', async () => {
      await createUser({ name: 'Zé Filtro', email: 'ze@filtro.com' });
      const res = await request(app)
        .get('/api/user?name=Filtro&email=filtro&sortBy=name&sortDir=asc')
        .set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].password).toBeUndefined();
      expect(res.body.items[0].token_version).toBeUndefined();
    });

    it('não-admin não lista usuários (403)', async () => {
      expect((await request(app).get('/api/user').set(bearer(ownerToken))).status).toBe(403);
    });

    it('admin exclui usuário; inexistente → 404', async () => {
      const victim = await createUser();
      expect((await request(app).delete(`/api/user/${victim.id}`).set(bearer(adminToken))).status).toBe(204);
      expect((await request(app).delete(`/api/user/${victim.id}`).set(bearer(adminToken))).status).toBe(404);
    });
  });

  describe('pagamentos', () => {
    let appointment;

    beforeEach(async () => {
      appointment = await createAppointment({ tenant, client: await createUser() });
    });

    it('dono registra, consulta por agendamento e marca como pago', async () => {
      const created = await request(app)
        .post('/api/payment')
        .set(bearer(ownerToken))
        .send({ appointment_id: appointment.id, amount: 50, method: 'CASH' });
      expect(created.status).toBe(201);
      expect(created.body.payment.status).toBe('PENDING');

      const byAppointment = await request(app).get(`/api/payment/appointment/${appointment.id}`).set(bearer(ownerToken));
      expect(byAppointment.status).toBe(200);

      const paid = await request(app)
        .put(`/api/payment/${created.body.payment.id}/status`)
        .set(bearer(ownerToken))
        .send({ status: 'PAID' });
      expect(paid.status).toBe(200);
      expect((await Payment.findByPk(created.body.payment.id)).paid_at).not.toBeNull();
    });

    it('segundo pagamento para o mesmo agendamento → 409', async () => {
      await Payment.create({ appointment_id: appointment.id, amount: 50, method: 'PIX' });
      const res = await request(app)
        .post('/api/payment')
        .set(bearer(ownerToken))
        .send({ appointment_id: appointment.id, amount: 50, method: 'PIX' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAYMENT_ALREADY_REGISTERED');
    });

    it('agendamento sem pagamento → 404; pagamento inexistente → 404', async () => {
      expect((await request(app).get(`/api/payment/appointment/${appointment.id}`).set(bearer(ownerToken))).status).toBe(404);
      expect((await request(app).get('/api/payment/999999').set(bearer(ownerToken))).status).toBe(404);
      expect(
        (await request(app).put('/api/payment/999999/status').set(bearer(ownerToken)).send({ status: 'PAID' })).status
      ).toBe(404);
    });

    it.each([
      [{ amount: -1, method: 'PIX' }],
      [{ amount: 10, method: 'BOLETO' }],
    ])('payload inválido %p → 400', async (body) => {
      const res = await request(app)
        .post('/api/payment')
        .set(bearer(ownerToken))
        .send({ appointment_id: appointment.id, ...body });
      expect(res.status).toBe(400);
    });
  });

  describe('barbearias', () => {
    it('lista filtra por nome e cidade', async () => {
      await createTenant({ name: 'Outra' });
      const byName = await request(app).get('/api/barbershop?name=Navalha&sortBy=name&sortDir=asc');
      expect(byName.body.items.map((item) => item.id)).toEqual([tenant.barbershop.id]);
      const byCity = await request(app).get('/api/barbershop?city=Paulo');
      expect(byCity.status).toBe(200);
      expect(byCity.body.total).toBe(2);
    });

    it('nome duplicado do mesmo dono → 409', async () => {
      const res = await request(app).post('/api/barbershop').set(bearer(ownerToken)).send({ name: 'Navalha' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BARBERSHOP_NAME_TAKEN');
    });

    it('admin exclui barbearia sem filiais; inexistente → 404', async () => {
      const empty = await request(app).post('/api/barbershop').set(bearer(adminToken)).send({ name: 'Vazia' });
      expect((await request(app).delete(`/api/barbershop/${empty.body.barbershop.id}`).set(bearer(adminToken))).status).toBe(200);
      expect((await request(app).delete('/api/barbershop/999999').set(bearer(adminToken))).status).toBe(404);
    });
  });
});
