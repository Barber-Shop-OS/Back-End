// BE-34 / SEC-22: uploads — tipos permitidos, tamanho, chave gerada pelo servidor, confirmação com
// magic bytes e escopo de tenant. Armazenamento simulado em memória; assinatura real testada offline.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { Barbershop, Barber, Upload } = require('../../../models');
const objectStorage = require('../../../integrations/storage/objectStorage');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 2)]);
const SVG_AS_PNG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const memoryStorage = () => {
  const objects = new Map();
  return {
    objects,
    configured: true,
    presignPut: async (key) => `https://r2.test/${key}?X-Amz-Signature=fake`,
    put: (key, body, contentType) => objects.set(key, { body, contentType }),
    head: async (key) => {
      const obj = objects.get(key);
      if (!obj) throw new Error('NotFound');
      return { size: obj.body.length, contentType: obj.contentType };
    },
    readStart: async (key, length) => objects.get(key).body.subarray(0, length),
    remove: async (key) => objects.delete(key),
    publicUrl: (key) => `https://img.barberos.test/${key}`,
  };
};

describe('BE-34 — upload de imagens', () => {
  let tenant;
  let other;
  let token;
  let store;

  const presign = (body, auth = token) => request(app).post('/api/uploads/presign').set(bearer(auth)).send(body);
  const confirm = (uploadId, auth = token) => request(app).post('/api/uploads/confirm').set(bearer(auth)).send({ upload_id: uploadId });
  const keyOf = async (uploadId) => (await Upload.findByPk(uploadId)).object_key;

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant();
    other = await createTenant();
    token = await loginAs(tenant.owner);
  });
  beforeEach(() => {
    store = memoryStorage();
    objectStorage.setStorage(store);
  });
  afterAll(async () => {
    objectStorage.setStorage(null);
    await sequelize.close();
  });

  it('logo PNG: chave do servidor por tenant, confirmação grava a URL', async () => {
    const res = await presign({ kind: 'logo', content_type: 'image/png', size: PNG.length, barbershop_id: tenant.barbershop.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' }, expires_in: 300 });
    const key = await keyOf(res.body.upload_id);
    expect(key).toMatch(new RegExp(`^tenants/${tenant.barbershop.id}/logo/[0-9a-f-]{36}\\.png$`));
    store.put(key, PNG, 'image/png');
    const done = await confirm(res.body.upload_id);
    expect(done.status).toBe(200);
    expect(done.body.url).toBe(`https://img.barberos.test/${key}`);
    expect((await Barbershop.findByPk(tenant.barbershop.id)).logo_url).toBe(done.body.url);
    expect((await confirm(res.body.upload_id)).status).toBe(409);
  });

  it('foto de barbeiro JPEG', async () => {
    const res = await presign({ kind: 'barber_photo', content_type: 'image/jpeg', size: JPEG.length, barber_id: tenant.barber.id });
    store.put(await keyOf(res.body.upload_id), JPEG, 'image/jpeg');
    expect((await confirm(res.body.upload_id)).status).toBe(200);
    expect((await Barber.findByPk(tenant.barber.id)).photo_url).toMatch(/barber_photo\/.*\.jpg$/);
  });

  it('SVG/HTML recusados no presign; tamanho > 2 MB recusado', async () => {
    for (const type of ['image/svg+xml', 'text/html', 'application/octet-stream']) {
      const res = await presign({ kind: 'cover', content_type: type, size: 100, barbershop_id: tenant.barbershop.id });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_FILE');
    }
    expect((await presign({ kind: 'cover', content_type: 'image/png', size: 3 * 1024 * 1024, barbershop_id: tenant.barbershop.id })).status).toBe(400);
  });

  it('conteúdo que não é imagem (SVG disfarçado de PNG) é recusado e apagado', async () => {
    const res = await presign({ kind: 'cover', content_type: 'image/png', size: SVG_AS_PNG.length, barbershop_id: tenant.barbershop.id });
    const key = await keyOf(res.body.upload_id);
    store.put(key, SVG_AS_PNG, 'image/png');
    const done = await confirm(res.body.upload_id);
    expect(done.status).toBe(400);
    expect(done.body.code).toBe('INVALID_FILE');
    expect(store.objects.has(key)).toBe(false);
    expect((await Barbershop.findByPk(tenant.barbershop.id)).cover_url).toBeNull();
  });

  it('tamanho diferente do pedido ou arquivo ausente → 400', async () => {
    const res = await presign({ kind: 'cover', content_type: 'image/png', size: 50, barbershop_id: tenant.barbershop.id });
    expect((await confirm(res.body.upload_id)).status).toBe(400);
    const res2 = await presign({ kind: 'cover', content_type: 'image/png', size: 50, barbershop_id: tenant.barbershop.id });
    store.put(await keyOf(res2.body.upload_id), PNG, 'image/png');
    expect((await confirm(res2.body.upload_id)).status).toBe(400);
  });

  it('outro tenant: presign e confirm → 403', async () => {
    const otherToken = await loginAs(other.owner);
    expect((await presign({ kind: 'logo', content_type: 'image/png', size: 10, barbershop_id: tenant.barbershop.id }, otherToken)).status).toBe(403);
    expect((await presign({ kind: 'barber_photo', content_type: 'image/png', size: 10, barber_id: tenant.barber.id }, otherToken)).status).toBe(403);
    const mine = await presign({ kind: 'logo', content_type: 'image/png', size: PNG.length, barbershop_id: tenant.barbershop.id });
    expect((await confirm(mine.body.upload_id, otherToken)).status).toBe(403);
  });

  it('sem R2 configurado → 503', async () => {
    objectStorage.setStorage({ configured: false });
    const res = await presign({ kind: 'logo', content_type: 'image/png', size: 10, barbershop_id: tenant.barbershop.id });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('UPLOADS_UNAVAILABLE');
  });

  it('assinatura real (offline): URL do R2 com tipo e tamanho assinados', async () => {
    const real = objectStorage.createStorage({
      R2_ACCOUNT_ID: 'acc123',
      R2_ACCESS_KEY_ID: 'AKIATEST',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'barberos',
      R2_PUBLIC_BASE_URL: 'https://img.barberos.app/',
    });
    const url = new URL(await real.presignPut('tenants/1/logo/x.png', { contentType: 'image/png', size: 1234 }));
    expect(url.host).toBe('barberos.acc123.r2.cloudflarestorage.com');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toMatch(/content-length/);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toMatch(/content-type|host/);
    expect(real.publicUrl('tenants/1/logo/x.png')).toBe('https://img.barberos.app/tenants/1/logo/x.png');
  });
});
