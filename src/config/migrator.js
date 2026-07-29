// Gerenciador de migrations usando Umzug para execução programática
const { Umzug, SequelizeStorage } = require('umzug');
const sequelize = require('./sequelize');
const path = require('path');
const logger = require('../utils/logger');

const migrator = new Umzug({
  migrations: {
    glob: ['src/migrations/*.js', { cwd: path.resolve(__dirname, '..') }],
    resolve: ({ name, path: migrationPath }) => {
      const migration = require(migrationPath);
      return {
        name,
        up: async () => migration.up(sequelize.getQueryInterface(), sequelize.Sequelize),
        down: async () => migration.down(sequelize.getQueryInterface(), sequelize.Sequelize),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({
    sequelize,
    modelName: 'SequelizeMeta',
  }),
  logger: {
    info: (msg) => logger.info(`[Migrator] ${msg}`),
    warn: (msg) => logger.warn(`[Migrator] ${msg}`),
    error: (msg) => logger.error(`[Migrator] ${msg}`),
    debug: (msg) => logger.debug(`[Migrator] ${msg}`),
  },
});

const runMigrations = async () => {
  // Não executa migrations em ambiente de teste (usa SQLite :memory:)
  if (process.env.NODE_ENV === 'test') {
    logger.info('[Migrator] Ambiente de teste detectado. Migrations ignoradas.');
    return;
  }

  try {
    const pending = await migrator.pending();
    if (pending.length === 0) {
      logger.info('[Migrator] Nenhuma migration pendente. Banco já atualizado.');
      return;
    }

    logger.info(`[Migrator] ${pending.length} migration(s) pendente(s). Executando...`);
    const executed = await migrator.up();
    logger.info(`[Migrator] ${executed.length} migration(s) executada(s) com sucesso.`);
  } catch (error) {
    logger.error('[Migrator] Erro ao executar migrations', {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

module.exports = { migrator, runMigrations };

