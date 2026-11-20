/* eslint-disable no-console -- script de linha de comando */
// BE-44: passo de release — aplica as migrations (com lock) antes de subir a nova versão.
// Uso no deploy: npm run migrate:release && (sobe as instâncias com MIGRATE_ON_BOOT=false)
require('dotenv').config();
const { runMigrations } = require('../src/config/migrator');
const sequelize = require('../src/config/sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    await runMigrations();
    console.log('Migrations aplicadas e schema validado.');
    await sequelize.close();
  } catch (error) {
    console.error(`Falha nas migrations: ${error.message}`);
    process.exit(1);
  }
})();
