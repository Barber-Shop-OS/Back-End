// BE-18 / SEC-06: slug e perfil público da barbearia sem dados pessoais.
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
const { Barbershop, Branch, Service, BranchOpeningHour, BranchClosure } = require('../../../models');
const { slugify, isValidSlug, generateUniqueSlug } = require('../../../shared/slug');

describe('BE-18 — slug (unit)', () => {
  it('slugify remove acentos e símbolos', () => {
    expect(slugify('  Barbearia São João & Cia! ')).toBe('barbearia-sao-joao-cia');
  });
  it('isValidSlug barra reservadas, curtas e hífen duplo', () => {
    expect(isValidSlug('navalha-de-ouro')).toBe(true);
    expect(isValidSlug('admin')).toBe(false);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a--b')).toBe(false);
    expect(isValidSlug('-abc')).toBe(false);
  });
  it('generateUniqueSlug adiciona sufixo em colisão e evita reservadas', async () => {
    const used = new Set(['navalha', 'navalha-2']);
    expect(await generateUniqueSlug('Navalha', async (s) => used.has(s))).toBe('navalha-3');
    expect(await generateUniqueSlug('Admin', async () => false)).toBe('admin-barbearia');
  });
});

describe('BE-18 — perfil público', () => {
  let tenant;
  let ownerToken;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant({ name: 'Navalha de Ouro' });
    ownerToken = await loginAs(tenant.owner);
  });

  afterAll(() => sequelize.close());

  it('barbearia nasce com slug gerado do nome', async () => {
    expect(tenant.barbershop.slug).toBe('navalha-de-ouro');
    const res = await request(app).post('/api/barbershop').set(bearer(ownerToken)).send({ name: 'Navalha de Ouro 2' });
    expect(res.body.barbershop.slug).toBe('navalha-de-ouro-2');
  });

  it('GET /slug/:slug traz filiais, serviços e barbeiros ativos sem e-mail nem owner', async () => {
    await BranchOpeningHour.create({ branch_id: tenant.branch.id, weekday: 5, opens_at: '09:00', closes_at: '19:00' });
    await Branch.create({ name: 'Inativa', barbershop_id: tenant.barbershop.id, address_id: tenant.address.id, active: false });
    await Service.create({ name: 'Oculto', description: 'x', price: 1, duration: 10, barbershop_id: tenant.barbershop.id, active: false });

    const res = await request(app).get('/api/barbershop/slug/navalha-de-ouro');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'navalha-de-ouro', name: 'Navalha de Ouro' });
    expect(res.body.branches.map((b) => b.name)).toEqual([tenant.branch.name]);
    expect(res.body.branches[0].opening_hours).toEqual([{ weekday: 5, opens_at: '09:00', closes_at: '19:00' }]);
    expect(typeof res.body.branches[0].open_now).toBe('boolean');
    expect(res.body.services.map((s) => s.name)).toEqual(['Corte']);
    expect(res.body.services[0].price).toBe('50.00');
    expect(res.body.barbers).toHaveLength(1);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('@');
    expect(json).not.toContain('owner');
    expect(json).not.toContain('password');
  });

  it('open_now respeita o horário e os fechamentos do dia', async () => {
    const service = require('../../../modules/barbershop/barbershopPublicService');
    await BranchOpeningHour.create({ branch_id: tenant.branch.id, weekday: 5, opens_at: '09:00', closes_at: '19:00' });
    const friday10h = new Date('2026-11-20T13:00:00Z'); // 10:00 em São Paulo
    expect((await service.getBySlug('navalha-de-ouro', friday10h)).branches[0].open_now).toBe(true);
    await BranchClosure.create({ branch_id: tenant.branch.id, date: '2026-11-20', all_day: true });
    expect((await service.getBySlug('navalha-de-ouro', friday10h)).branches[0].open_now).toBe(false);
  });

  it('suspensa ou inexistente → 404; listagem pública também a esconde', async () => {
    await Barbershop.update({ status: 'suspended' }, { where: { id: tenant.barbershop.id } });
    expect((await request(app).get('/api/barbershop/slug/navalha-de-ouro')).status).toBe(404);
    expect((await request(app).get('/api/barbershop/slug/nao-existe')).status).toBe(404);
    expect((await request(app).get('/api/barbershop')).body.total).toBe(0);
    expect((await request(app).get(`/api/barbershop/${tenant.barbershop.id}`)).status).toBe(404);
  });

  it('listagem e detalhe públicos não contêm e-mail', async () => {
    const list = await request(app).get('/api/barbershop');
    const detail = await request(app).get(`/api/barbershop/${tenant.barbershop.id}`);
    expect(JSON.stringify(list.body)).not.toContain('@');
    expect(JSON.stringify(detail.body)).not.toContain('@');
  });

  describe('PUT perfil', () => {
    const put = (body, id = tenant.barbershop.id) =>
      request(app).put(`/api/barbershop/${id}`).set(bearer(ownerToken)).send(body);

    it('dono atualiza slug, contato e imagens', async () => {
      const res = await put({
        slug: 'ouro-barber',
        description: 'Desde 1990',
        whatsapp: '(11) 98888-7777',
        instagram: '@ouro.barber',
        logo_url: 'https://cdn.example.com/logo.webp',
      });
      expect(res.status).toBe(200);
      expect(res.body.barbershop).toMatchObject({
        slug: 'ouro-barber',
        whatsapp: '+5511988887777',
        instagram: 'ouro.barber',
      });
      expect((await request(app).get('/api/barbershop/slug/ouro-barber')).status).toBe(200);
    });

    it('slug duplicado → 409 SLUG_TAKEN; reservado/inválido → 400 INVALID_SLUG', async () => {
      const other = await createTenant({ name: 'Outra Casa' });
      const dup = await put({ slug: other.barbershop.slug });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('SLUG_TAKEN');
      const reserved = await put({ slug: 'admin' });
      expect(reserved.status).toBe(400);
      expect(reserved.body.code).toBe('INVALID_SLUG');
      expect((await put({ slug: 'com espaço' })).status).toBe(400);
    });

    it('logo http ou javascript → 400; status e owner_id não editáveis', async () => {
      expect((await put({ logo_url: 'http://x.com/a.png' })).status).toBe(400);
      expect((await put({ cover_url: 'javascript:alert(1)' })).status).toBe(400);
      expect((await put({ status: 'active' })).status).toBe(400);
      const intruder = await createUser({ role: 'owner' });
      expect((await put({ owner_id: intruder.id })).status).toBe(400);
    });
  });
});
