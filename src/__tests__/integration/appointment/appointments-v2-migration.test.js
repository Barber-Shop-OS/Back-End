// BE-12: a migration v2 preserva agendamentos antigos e é reversível.
// Migrations no MySQL real levam mais que o timeout padrão de 5 s.
jest.setTimeout(120000);

const { migrator } = require('../../../config/migrator');
const { sequelize } = require('../../../models');

const BEFORE_V2 = '20261114000014-services-v2.js';
const V2 = '20261114000015-appointments-v2.js';

const iso = (value) =>
  (value instanceof Date ? value : new Date(String(value).replace(' ', 'T').replace(/\s*([+-]\d\d:?\d\d)$/, '$1'))).toISOString();

const select = (sql) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });

describe('BE-12 — migration appointments-v2', () => {
  beforeAll(async () => {
    await sequelize.getQueryInterface().dropAllTables();
    await migrator.up({ to: BEFORE_V2 });

    const qi = sequelize.getQueryInterface();
    const now = new Date('2026-01-01T00:00:00Z');
    await qi.bulkInsert('users', [
      { id: 1, name: 'Dono', email: 'o@x.com', password: 'x', role: 'owner', created_at: now },
      { id: 2, name: 'Cliente', email: 'c@x.com', password: 'x', role: 'cliente', created_at: now },
    ]);
    await qi.bulkInsert('addresses', [{ id: 1, cep: '01001-000', number: 1, city: 'SP', state: 'SP', created_at: now }]);
    await qi.bulkInsert('barbershops', [{ id: 1, name: 'B', owner_id: 1, created_at: now }]);
    await qi.bulkInsert('branches', [{ id: 1, name: 'F', barbershop_id: 1, address_id: 1, created_at: now }]);
    await qi.bulkInsert('barbers', [{ id: 1, user_id: 1, branch_id: 1, bio: '', active: true, created_at: now }]);
    await qi.bulkInsert('services', [
      { id: 1, name: 'Corte degradê', description: 'x', price: 45.5, duration: 40, barbershop_id: 1, active: true, created_at: now },
    ]);
    await qi.bulkInsert('appointments', [
      { id: 1, user_id: 2, barber_id: 1, service_id: 1, branch_id: 1, appointment_date: new Date('2026-03-10T13:00:00Z'), status: 'pendente', created_at: now },
      { id: 2, user_id: 2, barber_id: 1, service_id: 1, branch_id: 1, appointment_date: new Date('2026-03-11T13:00:00Z'), status: 'cancelado', created_at: now },
    ]);
  });

  afterAll(() => sequelize.close());

  it('up: start/end calculados, snapshots do serviço e pendente → confirmado', async () => {
    await migrator.up({ to: V2 });
    const [first, second] = await select('SELECT * FROM appointments ORDER BY id');

    expect(iso(first.start_at)).toBe('2026-03-10T13:00:00.000Z');
    expect(iso(first.end_at)).toBe('2026-03-10T13:40:00.000Z');
    expect(Number(first.duration_min)).toBe(40);
    expect(Number(first.price_snapshot)).toBe(45.5);
    expect(first.service_name_snapshot).toBe('Corte degradê');
    expect(first.status).toBe('confirmado');
    expect(first.source).toBe('web');
    expect(first).not.toHaveProperty('appointment_date');
    expect(second.status).toBe('cancelado');
  });

  it('down: appointment_date volta com o mesmo instante e as colunas novas somem', async () => {
    await migrator.down({ to: V2 });
    const [first] = await select('SELECT * FROM appointments ORDER BY id');
    expect(iso(first.appointment_date)).toBe('2026-03-10T13:00:00.000Z');
    expect(first).not.toHaveProperty('start_at');
    expect(first.status).toBe('confirmado');
  });
});
