// BE-25: GET /api/search/branches — público, só barbearias visíveis, LIKE escapado, distância.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, sequelize } = require('../../helpers/factories');
const { Address, Barbershop, Branch, Service, Subscription } = require('../../../models');
const entitlements = require('../../../shared/entitlements');

const search = (params = {}) => request(app).get('/api/search/branches').query(params);
const names = (res) => res.body.items.map((item) => item.name);

describe('BE-25 — busca pública de filiais', () => {
  let sp;
  let campinas;
  let rio;

  const place = async (tenant, { branchName, city, lat, lng }) => {
    await tenant.branch.update({ name: branchName });
    await Address.update({ city, latitude: lat, longitude: lng }, { where: { id: tenant.address.id } });
  };

  beforeAll(async () => {
    await resetDatabase();
    sp = await createTenant({ name: 'Navalha Paulista' });
    campinas = await createTenant({ name: 'Barba Campineira' });
    rio = await createTenant({ name: 'Corte Carioca', subscription: { status: 'active' } });
    await place(sp, { branchName: 'SP Centro', city: 'São Paulo', lat: -23.5505, lng: -46.6333 });
    await place(campinas, { branchName: 'Campinas Cambuí', city: 'Campinas', lat: -22.9056, lng: -47.0608 });
    await place(rio, { branchName: 'Rio Copacabana', city: 'Rio de Janeiro', lat: -22.9711, lng: -43.1822 });
    await Service.create({ name: 'Barba 50% off', description: 'Promoção', price: 30, duration: 20, barbershop_id: rio.barbershop.id });

    // Filial sem coordenadas da mesma barbearia de SP.
    const noCoords = await Address.create({ cep: '01001-000', number: 1, city: 'São Paulo', state: 'SP' });
    await Branch.create({ name: 'SP Sem Mapa', barbershop_id: sp.barbershop.id, address_id: noCoords.id });

    // Não podem aparecer:
    const suspended = await createTenant({ name: 'Suspensa' });
    await Barbershop.update({ status: 'suspended' }, { where: { id: suspended.barbershop.id } });
    const expired = await createTenant({ name: 'Trial Vencido', subscription: { trial_ends_at: new Date(Date.now() - 86400000) } });
    const canceled = await createTenant({ name: 'Cancelada', subscription: { status: 'canceled' } });
    const inactiveBranch = await createTenant({ name: 'Filial Inativa' });
    await inactiveBranch.branch.update({ active: false });
    const pastDue = await createTenant({ name: 'Em Atraso', subscription: { status: 'past_due' } });
    await pastDue.branch.update({ name: 'Atraso Centro' });
    await Address.update({ city: 'Curitiba' }, { where: { id: pastDue.address.id } });
    void expired;
    void canceled;
  });

  afterAll(() => sequelize.close());

  it('lista só filiais ativas de barbearias ativas com assinatura visível', async () => {
    const res = await search();
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=30');
    const shops = res.body.items.map((item) => item.barbershop.name);
    expect(new Set(shops)).toEqual(new Set(['Navalha Paulista', 'Barba Campineira', 'Corte Carioca', 'Em Atraso']));
    expect(res.body.total).toBe(5);
    for (const hidden of ['Suspensa', 'Trial Vencido', 'Cancelada', 'Filial Inativa']) expect(shops).not.toContain(hidden);
  });

  it('DTO público: sem owner, e-mail nem dados internos', async () => {
    const res = await search({ q: 'Paulista' });
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/owner|email|password|address_id/);
    expect(res.body.items[0]).toMatchObject({
      barbershop: { name: 'Navalha Paulista', slug: expect.any(String) },
      address: expect.objectContaining({ city: 'São Paulo' }),
      distance_km: null,
    });
  });

  it('q procura no nome da barbearia, da filial e dos serviços', async () => {
    expect(new Set(names(await search({ q: 'campineira' })))).toEqual(new Set(['Campinas Cambuí']));
    expect(names(await search({ q: 'Copacabana' }))).toEqual(['Rio Copacabana']);
    expect(names(await search({ q: '50%' }))).toEqual(['Rio Copacabana']);
  });

  it('curingas do LIKE são literais (SEC-09)', async () => {
    expect((await search({ q: '%' })).body.total).toBe(1); // só o serviço "Barba 50% off"
    expect((await search({ q: '_' })).body.total).toBe(0);
    expect((await search({ q: '!' })).body.total).toBe(0);
    expect((await search({ city: '%' })).body.total).toBe(0);
  });

  it('filtro por cidade e por serviço', async () => {
    expect(new Set(names(await search({ city: 'são paulo' })))).toEqual(new Set(['SP Centro', 'SP Sem Mapa']));
    expect(names(await search({ service: 'Barba 50' }))).toEqual(['Rio Copacabana']);
    expect((await search({ service: 'Inexistente' })).body.total).toBe(0);
  });

  it('com lat/lng ordena por distância; sem coordenadas vai para o fim', async () => {
    const res = await search({ lat: -23.5505, lng: -46.6333 });
    expect(names(res).slice(0, 3)).toEqual(['SP Centro', 'Campinas Cambuí', 'Rio Copacabana']);
    const byName = Object.fromEntries(res.body.items.map((item) => [item.name, item.distance_km]));
    expect(byName['SP Centro']).toBe(0);
    expect(byName['Campinas Cambuí']).toBeGreaterThan(75);
    expect(byName['Campinas Cambuí']).toBeLessThan(90);
    expect(byName['Rio Copacabana']).toBeGreaterThan(350);
    expect(byName['Rio Copacabana']).toBeLessThan(370);
    const last = res.body.items.slice(-2).map((item) => item.distance_km);
    expect(last).toEqual([null, null]);
  });

  it('paginação: pageSize máximo 50', async () => {
    const res = await search({ pageSize: 500 });
    expect(res.body.pageSize).toBe(50);
    const page2 = await search({ pageSize: 2, page: 2 });
    expect(page2.body).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(page2.body.items).toHaveLength(2);
  });

  it('validação: lat sem lng, coordenada fora do intervalo, termo longo → 400', async () => {
    expect((await search({ lat: -23.5 })).status).toBe(400);
    expect((await search({ lat: 120, lng: 0 })).status).toBe(400);
    expect((await search({ q: 'x'.repeat(101) })).status).toBe(400);
  });

  it('expirar o trial tira a barbearia da busca na hora', async () => {
    await Subscription.update({ trial_ends_at: new Date(Date.now() - 1000) }, { where: { barbershop_id: sp.barbershop.id } });
    expect((await search({ q: 'Paulista' })).body.total).toBe(0);
    await Subscription.update({ trial_ends_at: new Date(Date.now() + 86400000) }, { where: { barbershop_id: sp.barbershop.id } });
  });
});

describe('BE-25 — entitlements.isPubliclyVisible', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  it.each([
    [{ status: 'active' }, true],
    [{ status: 'past_due' }, true],
    [{ status: 'trialing', trial_ends_at: '2026-12-02T00:00:00Z' }, true],
    [{ status: 'trialing', trial_ends_at: '2026-11-30T00:00:00Z' }, false],
    [{ status: 'trialing', trial_ends_at: null }, false],
    [{ status: 'canceled' }, false],
    [{ status: 'expired' }, false],
    [{ status: 'pending' }, false],
    [null, false],
  ])('%j → %s', (subscription, expected) => {
    expect(entitlements.isPubliclyVisible(subscription, now)).toBe(expected);
  });
});
