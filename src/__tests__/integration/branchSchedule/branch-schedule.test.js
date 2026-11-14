// BE-10: horário de funcionamento, fechamentos e campos novos da filial.
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
const { Branch, BranchOpeningHour } = require('../../../models');

const WEEK = [
  { weekday: 1, opens_at: '09:00', closes_at: '12:00' },
  { weekday: 1, opens_at: '13:00', closes_at: '19:00' },
  { weekday: 6, opens_at: '08:00', closes_at: '14:00' },
];

describe('BE-10 — horário e fechamentos da filial', () => {
  let tenant;
  let other;
  let ownerToken;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    other = await createTenant();
    ownerToken = await loginAs(tenant.owner);
  });

  afterAll(() => sequelize.close());

  const hoursUrl = (branch) => `/api/branch/${branch.id}/opening-hours`;
  const closuresUrl = (branch) => `/api/branch/${branch.id}/closures`;

  describe('opening-hours', () => {
    it('owner salva a semana e a leitura pública funciona sem login', async () => {
      const put = await request(app).put(hoursUrl(tenant.branch)).set(bearer(ownerToken)).send({ opening_hours: WEEK });
      expect(put.status).toBe(200);
      const get = await request(app).get(hoursUrl(tenant.branch));
      expect(get.status).toBe(200);
      expect(get.body).toEqual({ branch_id: tenant.branch.id, timezone: 'America/Sao_Paulo', opening_hours: WEEK });
    });

    it('PUT substitui a semana inteira', async () => {
      await request(app).put(hoursUrl(tenant.branch)).set(bearer(ownerToken)).send({ opening_hours: WEEK });
      const put = await request(app)
        .put(hoursUrl(tenant.branch))
        .set(bearer(ownerToken))
        .send({ opening_hours: [{ weekday: 2, opens_at: '10:00', closes_at: '20:00' }] });
      expect(put.body.opening_hours).toEqual([{ weekday: 2, opens_at: '10:00', closes_at: '20:00' }]);
      expect(await BranchOpeningHour.count({ where: { branch_id: tenant.branch.id } })).toBe(1);
    });

    it('intervalos sobrepostos → 400 e nada é gravado', async () => {
      await request(app).put(hoursUrl(tenant.branch)).set(bearer(ownerToken)).send({ opening_hours: WEEK });
      const res = await request(app)
        .put(hoursUrl(tenant.branch))
        .set(bearer(ownerToken))
        .send({
          opening_hours: [
            { weekday: 3, opens_at: '09:00', closes_at: '14:00' },
            { weekday: 3, opens_at: '13:00', closes_at: '18:00' },
          ],
        });
      expect(res.status).toBe(400);
      expect(await BranchOpeningHour.count({ where: { branch_id: tenant.branch.id } })).toBe(WEEK.length);
    });

    it('opens >= closes → 400; formato inválido → 400', async () => {
      const bad = (opening_hours) => request(app).put(hoursUrl(tenant.branch)).set(bearer(ownerToken)).send({ opening_hours });
      expect((await bad([{ weekday: 1, opens_at: '18:00', closes_at: '09:00' }])).status).toBe(400);
      expect((await bad([{ weekday: 1, opens_at: '25:00', closes_at: '26:00' }])).status).toBe(400);
      expect((await bad([{ weekday: 9, opens_at: '09:00', closes_at: '10:00' }])).status).toBe(400);
    });

    it('owner A não altera a semana da filial de B (403); sem login 401; inexistente 404', async () => {
      expect((await request(app).put(hoursUrl(other.branch)).set(bearer(ownerToken)).send({ opening_hours: WEEK })).status).toBe(403);
      expect((await request(app).put(hoursUrl(tenant.branch)).send({ opening_hours: WEEK })).status).toBe(401);
      expect((await request(app).get('/api/branch/999999/opening-hours')).status).toBe(404);
    });
  });

  describe('closures', () => {
    it('CRUD de fechamento pelo owner, leitura pública com filtro de período', async () => {
      const created = await request(app)
        .post(closuresUrl(tenant.branch))
        .set(bearer(ownerToken))
        .send({ date: '2026-12-25', reason: 'Natal' });
      expect(created.status).toBe(201);
      expect(created.body.closure).toMatchObject({ date: '2026-12-25', all_day: true, start_time: null });

      const partial = await request(app)
        .post(closuresUrl(tenant.branch))
        .set(bearer(ownerToken))
        .send({ date: '2026-12-24', all_day: false, start_time: '14:00', end_time: '19:00' });
      expect(partial.status).toBe(201);

      const list = await request(app).get(`${closuresUrl(tenant.branch)}?from=2026-12-25&to=2026-12-31`);
      expect(list.status).toBe(200);
      expect(list.body.items.map((item) => item.date)).toEqual(['2026-12-25']);

      const id = created.body.closure.id;
      const updated = await request(app)
        .put(`${closuresUrl(tenant.branch)}/${id}`)
        .set(bearer(ownerToken))
        .send({ reason: 'Natal (recesso)' });
      expect(updated.status).toBe(200);
      expect(updated.body.closure.reason).toBe('Natal (recesso)');

      expect((await request(app).delete(`${closuresUrl(tenant.branch)}/${id}`).set(bearer(ownerToken))).status).toBe(204);
    });

    it('fechamento parcial com horário invertido → 400', async () => {
      const res = await request(app)
        .post(closuresUrl(tenant.branch))
        .set(bearer(ownerToken))
        .send({ date: '2026-12-24', all_day: false, start_time: '19:00', end_time: '14:00' });
      expect(res.status).toBe(400);
    });

    it('fechamento de outra filial pelo id → 404; owner A em filial de B → 403', async () => {
      const otherToken = await loginAs(other.owner);
      const foreign = await request(app)
        .post(closuresUrl(other.branch))
        .set(bearer(otherToken))
        .send({ date: '2026-12-25' });
      // owner A tenta usar o id de B pela própria filial → não encontra
      const viaOwnBranch = await request(app)
        .delete(`${closuresUrl(tenant.branch)}/${foreign.body.closure.id}`)
        .set(bearer(ownerToken));
      expect(viaOwnBranch.status).toBe(404);
      const direct = await request(app)
        .delete(`${closuresUrl(other.branch)}/${foreign.body.closure.id}`)
        .set(bearer(ownerToken));
      expect(direct.status).toBe(403);
    });

    it('cliente não cria fechamento (403)', async () => {
      const client = await loginAs(await createUser());
      const res = await request(app).post(closuresUrl(tenant.branch)).set(bearer(client)).send({ date: '2026-12-25' });
      expect(res.status).toBe(403);
    });
  });

  describe('campos da filial', () => {
    it('timezone, telefone e whatsapp normalizados; fuso inválido → 400', async () => {
      const ok = await request(app)
        .put(`/api/branch/${tenant.branch.id}`)
        .set(bearer(ownerToken))
        .send({ timezone: 'America/Manaus', phone: '(92) 3333-4444', whatsapp: '92 99999-0000' });
      expect(ok.status).toBe(200);
      expect(ok.body.branch).toMatchObject({ timezone: 'America/Manaus', phone: '+559233334444', whatsapp: '+5592999990000' });

      const bad = await request(app).put(`/api/branch/${tenant.branch.id}`).set(bearer(ownerToken)).send({ timezone: 'Marte/Base' });
      expect(bad.status).toBe(400);
    });

    it('filial inativa some da listagem pública; dono vê com include_inactive', async () => {
      await Branch.update({ active: false }, { where: { id: tenant.branch.id } });
      const url = `/api/branch?barbershop_id=${tenant.barbershop.id}`;
      expect((await request(app).get(url)).body.total).toBe(0);
      expect((await request(app).get(`${url}&include_inactive=true`).set(bearer(ownerToken))).body.total).toBe(1);
      expect((await request(app).get(`${url}&include_inactive=true`)).body.total).toBe(0);
    });
  });
});
