// BE-08: as migrations criam do zero um schema igual ao dos models e são reversíveis.
// Roda em SQLite; o job de CI com MySQL 8 (BE-09) executa as mesmas migrations no banco real.
// Migrations no MySQL real levam mais que o timeout padrão de 5 s.
jest.setTimeout(120000);

const { migrator, verifySchema } = require('../../config/migrator');
const { sequelize } = require('../../models');

const tableNames = async () =>
  (await sequelize.getQueryInterface().showAllTables())
    .map((table) => (typeof table === 'string' ? table : table.tableName))
    .filter((name) => name !== 'SequelizeMeta')
    .sort();

describe('BE-08 — migrations', () => {
  beforeAll(async () => {
    await sequelize.getQueryInterface().dropAllTables();
  });

  afterAll(() => sequelize.close());

  it('sobem do zero e o schema bate com os models', async () => {
    const executed = await migrator.up();
    expect(executed.length).toBeGreaterThan(0);
    expect(await migrator.pending()).toHaveLength(0);
    await expect(verifySchema()).resolves.toBeUndefined();
    expect(await tableNames()).toEqual(
      ['addresses', 'appointments', 'barbers', 'barbershops', 'branches', 'payments', 'services', 'users'].sort()
    );
  });

  it('criam os índices de desempenho e o único de pagamento', async () => {
    const qi = sequelize.getQueryInterface();
    const appointmentIndexes = (await qi.showIndex('appointments')).map((index) => index.name);
    expect(appointmentIndexes).toEqual(
      expect.arrayContaining(['appointments_barber_start_idx', 'appointments_branch_start_idx', 'appointments_user_idx'])
    );
    const serviceIndexes = (await qi.showIndex('services')).map((index) => index.name);
    expect(serviceIndexes).toContain('services_barbershop_idx');
    const paymentIndex = (await qi.showIndex('payments')).find((index) => index.name === 'payments_appointment_unique');
    expect(paymentIndex).toBeDefined();
    expect(paymentIndex.unique).toBe(true);
  });

  it('rodar de novo não faz nada (idempotente)', async () => {
    expect(await migrator.up()).toHaveLength(0);
  });

  it('descem até o início sem erro', async () => {
    await migrator.down({ to: 0 });
    expect(await tableNames()).toEqual([]);
  });
});
