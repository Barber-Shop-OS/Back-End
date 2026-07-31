const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');
const sequelize = require('./sequelize');
const logger = require('../utils/logger');

const getTableName = (table) => (typeof table === 'string' ? table : table.tableName);

const migrator = new Umzug({
  migrations: {
    // The cwd is src, so migrations are located at src/migrations.
    glob: ['migrations/*.js', { cwd: path.resolve(__dirname, '..') }],
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
  storage: new SequelizeStorage({ sequelize, modelName: 'SequelizeMeta' }),
  logger: {
    info: (message) => logger.info(`[Migrator] ${message}`),
    warn: (message) => logger.warn(`[Migrator] ${message}`),
    error: (message) => logger.error(`[Migrator] ${message}`),
    debug: (message) => logger.debug(`[Migrator] ${message}`),
  },
});

// Read-only validation: it never runs sync(), alter(), force(), or drops data.
const verifySchema = async () => {
  const { sequelize: modelsSequelize } = require('../models');
  const queryInterface = sequelize.getQueryInterface();
  const existingTables = new Set((await queryInterface.showAllTables()).map(getTableName));
  const differences = [];

  for (const model of Object.values(modelsSequelize.models)) {
    const tableName = getTableName(model.getTableName());
    if (!existingTables.has(tableName)) {
      differences.push(`Tabela ausente: ${tableName}`);
      continue;
    }

    const columns = await queryInterface.describeTable(tableName);
    const missingColumns = Object.keys(model.getAttributes()).filter((column) => !columns[column]);
    if (missingColumns.length) {
      differences.push(`Colunas ausentes em ${tableName}: ${missingColumns.join(', ')}`);
    }
  }

  if (differences.length) {
    throw new Error(`Schema do banco diverge dos models. ${differences.join(' | ')}`);
  }

  logger.info('[Migrator] Schema validado contra os models.');
};

const runMigrations = async () => {
  if (process.env.NODE_ENV === 'test') {
    logger.info('[Migrator] Ambiente de teste detectado. Migrations ignoradas.');
    return;
  }

  try {
    const pending = await migrator.pending();
    if (pending.length === 0) {
      logger.info('[Migrator] Nenhuma migration pendente. Banco ja atualizado.');
    } else {
      logger.info(`[Migrator] ${pending.length} migration(s) pendente(s). Executando...`);
      const executed = await migrator.up();
      logger.info(`[Migrator] ${executed.length} migration(s) executada(s) com sucesso.`);
    }

    await verifySchema();
  } catch (error) {
    logger.error('[Migrator] Erro ao executar migrations ou validar schema', {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

module.exports = { migrator, runMigrations, verifySchema };
