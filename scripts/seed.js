/* eslint-disable no-console -- script de linha de comando */
// BE-39: npm run seed — aplica as migrations pendentes e semeia dados de desenvolvimento/E2E.
// Recusa NODE_ENV=production. Ex.: npm run migrate:reset && npm run seed
require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.error('Seed bloqueado: NODE_ENV=production');
  process.exit(1);
}

const { migrator } = require('../src/config/migrator');
const { sequelize } = require('../src/models');
const { seed, SEED_PASSWORD } = require('../src/seeders/devSeed');

(async () => {
  try {
    await sequelize.authenticate();
    await migrator.up();
    const result = await seed({ log: (line) => console.log(line) });
    if (!result.skipped) console.log(`Senha de todas as contas: ${SEED_PASSWORD}`);
    await sequelize.close();
  } catch (error) {
    console.error(`Falha no seed: ${error.message}`);
    process.exit(1);
  }
})();
