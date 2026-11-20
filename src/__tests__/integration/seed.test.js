// BE-39: seed de desenvolvimento — idempotente, dados coerentes e bloqueado em produção.
jest.setTimeout(120000);

const { app, request, resetDatabase, sequelize } = require('../helpers/factories');
const { User, Appointment, Barber, Branch, Payment } = require('../../models');
const { seed, SEED_PASSWORD, assertNotProduction } = require('../../seeders/devSeed');

describe('BE-39 — seed', () => {
  beforeAll(() => resetDatabase());
  afterAll(() => sequelize.close());

  it('cria o cenário e é idempotente', async () => {
    const first = await seed();
    expect(first.skipped).toBe(false);
    expect(first.appointments).toBeGreaterThanOrEqual(40);
    expect(await Branch.count()).toBe(3);
    expect(await Barber.count()).toBe(6);
    expect(await Payment.count()).toBeGreaterThan(0);
    const statuses = (await Appointment.findAll({ attributes: ['status'] })).map((row) => row.status);
    expect(new Set(statuses)).toEqual(new Set(['concluido', 'nao_compareceu', 'cancelado', 'confirmado']));
    const second = await seed();
    expect(second.skipped).toBe(true);
    expect(await User.count({ where: { email: 'admin@barberos.dev' } })).toBe(1);
  });

  it('contas semeadas entram e a página pública aparece', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'dono.navalha@barberos.dev', password: SEED_PASSWORD });
    expect(login.status).toBe(200);
    expect((await request(app).get('/api/barbershop/slug/navalha-de-ouro')).status).toBe(200);
  });

  it('bloqueado em produção', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(() => assertNotProduction()).toThrow(/production/);
    process.env.NODE_ENV = previous;
  });
});
