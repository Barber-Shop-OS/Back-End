// BE-17: endereço v2 (logradouro, bairro, coordenadas), CEP/UF validados e acesso por tenant.
const { app, request, resetDatabase, createUser, createTenant, loginAs, bearer, sequelize } = require('../../helpers/factories');

const fullAddress = {
  cep: '01310100',
  street: '  Av. Paulista ',
  number: 1000,
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'sp',
  latitude: -23.561414,
  longitude: -46.655881,
};

describe('BE-17 — endereço v2', () => {
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

  const createBranch = (body) =>
    request(app)
      .post('/api/branch')
      .set(bearer(ownerToken))
      .send({ name: 'Paulista', barbershop_id: tenant.barbershop.id, ...body });

  it('filial com endereço completo: CEP normalizado, UF maiúscula, coordenadas numéricas', async () => {
    const res = await createBranch(fullAddress);
    expect(res.status).toBe(201);
    expect(res.body.branch.Address).toMatchObject({
      cep: '01310-100',
      street: 'Av. Paulista',
      neighborhood: 'Bela Vista',
      state: 'SP',
      latitude: -23.561414,
      longitude: -46.655881,
    });
  });

  it.each([
    ['CEP com letras', { cep: '0131A-100' }],
    ['CEP curto', { cep: '1234-567' }],
    ['UF inexistente', { state: 'XX' }],
    ['latitude fora do intervalo', { latitude: 95 }],
    ['longitude fora do intervalo', { longitude: -200 }],
  ])('%s → 400', async (_label, override) => {
    const res = await createBranch({ ...fullAddress, ...override });
    expect(res.status).toBe(400);
  });

  it('latitude sem longitude → 400', async () => {
    const { longitude, ...withoutLng } = fullAddress;
    expect(longitude).toBeDefined();
    expect((await createBranch(withoutLng)).status).toBe(400);
  });

  it('PUT da filial atualiza logradouro e bairro do endereço', async () => {
    const res = await request(app)
      .put(`/api/branch/${tenant.branch.id}`)
      .set(bearer(ownerToken))
      .send({ street: 'Rua Augusta', neighborhood: 'Consolação' });
    expect(res.status).toBe(200);
    expect(res.body.branch.Address).toMatchObject({ street: 'Rua Augusta', neighborhood: 'Consolação' });
  });

  it('dono de B não lê endereço de A pelo id (404); cliente também não', async () => {
    const otherToken = await loginAs(other.owner);
    expect((await request(app).get(`/api/address/${tenant.address.id}`).set(bearer(otherToken))).status).toBe(404);
    const client = await loginAs(await createUser());
    expect((await request(app).get(`/api/address/${tenant.address.id}`).set(bearer(client))).status).toBe(404);
    expect((await request(app).get(`/api/address/${tenant.address.id}`).set(bearer(ownerToken))).status).toBe(200);
  });

  it('público vê o endereço embutido na filial', async () => {
    const res = await request(app).get(`/api/branch/${tenant.branch.id}`);
    expect(res.status).toBe(200);
    expect(res.body.Address.city).toBe('São Paulo');
  });
});
