// BE-01 / SEC-01 / SEC-02: escalonamento de privilégio e IDOR em /api/user.
const {
  app,
  request,
  resetDatabase,
  createUser,
  loginAs,
  bearer,
  sequelize,
} = require('../helpers/factories');
const { User } = require('../../models');

describe('BE-01 — /api/user', () => {
  let alice;
  let bob;
  let admin;
  let aliceToken;
  let adminToken;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: 'Alice', email: 'alice@test.com' });
    bob = await createUser({ name: 'Bob', email: 'bob@test.com' });
    admin = await createUser({ role: 'admin', email: 'admin@test.com' });
    aliceToken = await loginAs(alice);
    adminToken = await loginAs(admin);
  });

  afterAll(() => sequelize.close());

  describe('SEC-01 — escalonamento de privilégio', () => {
    it('cliente não consegue se promover a admin via PUT', async () => {
      const res = await request(app)
        .put(`/api/user/${alice.id}`)
        .set(bearer(aliceToken))
        .send({ role: 'admin' });

      expect(res.status).toBe(400);
      await alice.reload();
      expect(alice.role).toBe('cliente');
    });

    it('rejeita role misturado com campos válidos e não altera nada', async () => {
      const res = await request(app)
        .put(`/api/user/${alice.id}`)
        .set(bearer(aliceToken))
        .send({ name: 'Alice Nova', role: 'owner' });

      expect(res.status).toBe(400);
      await alice.reload();
      expect(alice.name).toBe('Alice');
      expect(alice.role).toBe('cliente');
    });

    it.each(['password', 'id', 'created_at', 'email'])('cliente não altera o campo %s', async (field) => {
      const res = await request(app)
        .put(`/api/user/${alice.id}`)
        .set(bearer(aliceToken))
        .send({ [field]: field === 'email' ? 'novo@test.com' : 'x' });

      expect(res.status).toBe(400);
    });

    it('cliente não acessa a rota de troca de papel', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${alice.id}/role`)
        .set(bearer(aliceToken))
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
      await alice.reload();
      expect(alice.role).toBe('cliente');
    });
  });

  describe('SEC-02 — IDOR', () => {
    it('usuário A não lê os dados de B (404)', async () => {
      const res = await request(app).get(`/api/user/${bob.id}`).set(bearer(aliceToken));
      expect(res.status).toBe(404);
      expect(res.body.email).toBeUndefined();
    });

    it('usuário A não edita B (404) e B fica intacto', async () => {
      const res = await request(app)
        .put(`/api/user/${bob.id}`)
        .set(bearer(aliceToken))
        .send({ name: 'Hackeado' });

      expect(res.status).toBe(404);
      await bob.reload();
      expect(bob.name).toBe('Bob');
    });

    it('usuário lê o próprio perfil sem senha', async () => {
      const res = await request(app).get(`/api/user/${alice.id}`).set(bearer(aliceToken));
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('alice@test.com');
      expect(res.body.password).toBeUndefined();
    });

    it('admin lê qualquer usuário', async () => {
      const res = await request(app).get(`/api/user/${bob.id}`).set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(bob.id);
    });
  });

  describe('edição do próprio perfil', () => {
    it('atualiza nome e normaliza telefone para E.164', async () => {
      const res = await request(app)
        .patch(`/api/user/${alice.id}`)
        .set(bearer(aliceToken))
        .send({ name: '  Alice Silva ', phone: '(11) 98765-4321' });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Alice Silva');
      expect(res.body.user.phone).toBe('+5511987654321');
      expect(res.body.user.password).toBeUndefined();
    });

    it('telefone inválido → 400', async () => {
      const res = await request(app)
        .patch(`/api/user/${alice.id}`)
        .set(bearer(aliceToken))
        .send({ phone: '123' });

      expect(res.status).toBe(400);
    });

    it('nome curto demais → 400', async () => {
      const res = await request(app)
        .patch(`/api/user/${alice.id}`)
        .set(bearer(aliceToken))
        .send({ name: 'A' });

      expect(res.status).toBe(400);
    });

    it('sem token → 401', async () => {
      const res = await request(app).patch(`/api/user/${alice.id}`).send({ name: 'Sem token' });
      expect(res.status).toBe(401);
    });
  });

  describe('admin', () => {
    it('admin altera e-mail de um usuário (normalizado)', async () => {
      const res = await request(app)
        .put(`/api/user/${bob.id}`)
        .set(bearer(adminToken))
        .send({ email: ' Bob.Novo@Test.com ' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('bob.novo@test.com');
    });

    it('admin não altera e-mail para um já usado → 409', async () => {
      const res = await request(app)
        .put(`/api/user/${bob.id}`)
        .set(bearer(adminToken))
        .send({ email: 'alice@test.com' });

      expect(res.status).toBe(409);
    });

    it('admin não altera role pela rota de edição comum', async () => {
      const res = await request(app)
        .put(`/api/user/${bob.id}`)
        .set(bearer(adminToken))
        .send({ role: 'owner' });

      expect(res.status).toBe(400);
    });

    it('admin troca papel pela rota dedicada', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${bob.id}/role`)
        .set(bearer(adminToken))
        .send({ role: 'owner' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('owner');
      expect(res.body.user.password).toBeUndefined();
      const fresh = await User.findByPk(bob.id);
      expect(fresh.role).toBe('owner');
    });

    it('papel inválido → 400', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${bob.id}/role`)
        .set(bearer(adminToken))
        .send({ role: 'superuser' });

      expect(res.status).toBe(400);
    });

    it('admin não remove o próprio acesso de admin', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${admin.id}/role`)
        .set(bearer(adminToken))
        .send({ role: 'cliente' });

      expect(res.status).toBe(400);
    });

    it('usuário inexistente → 404', async () => {
      const res = await request(app)
        .patch('/api/admin/users/999999/role')
        .set(bearer(adminToken))
        .send({ role: 'owner' });

      expect(res.status).toBe(404);
    });
  });
});
