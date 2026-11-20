const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');
const sequelize = require('./sequelize');
const logger = require('../utils/logger');

const text = (message) => (typeof message === 'string' ? message : JSON.stringify(message));

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
    info: (message) => logger.info(`[Migrator] ${text(message)}`),
    warn: (message) => logger.warn(`[Migrator] ${text(message)}`),
    error: (message) => logger.error(`[Migrator] ${text(message)}`),
    debug: (message) => logger.debug(`[Migrator] ${text(message)}`),
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

/**
 * BE-44: várias instâncias subindo juntas não rodam migrations em paralelo — no MySQL usa GET_LOCK
 * numa conexão reservada (transação) até terminar. SQLite (testes) serializa sozinho.
 */
const withMigrationLock = async (fn) => {
  if (sequelize.getDialect() !== 'mysql') return fn();
  const holder = await sequelize.transaction();
  try {
    const [rows] = await sequelize.query("SELECT GET_LOCK('barberos_migrations', 120) AS acquired", { transaction: holder });
    if (!rows[0] || Number(rows[0].acquired) !== 1) throw new Error('Não foi possível obter o lock de migrations (120 s)');
    return await fn();
  } finally {
    await sequelize.query("SELECT RELEASE_LOCK('barberos_migrations')", { transaction: holder }).catch(() => {});
    await holder.commit().catch(() => {});
  }
};

const runMigrations = async () => {
  if (process.env.NODE_ENV === 'test') {
    logger.info('[Migrator] Ambiente de teste detectado. Migrations ignoradas.');
    return;
  }

  try {
    await withMigrationLock(async () => {
      const pending = await migrator.pending();
      if (pending.length === 0) {
        logger.info('[Migrator] Nenhuma migration pendente. Banco ja atualizado.');
      } else {
        logger.info(`[Migrator] ${pending.length} migration(s) pendente(s). Executando...`);
        const executed = await migrator.up();
        logger.info(`[Migrator] ${executed.length} migration(s) executada(s) com sucesso.`);
      }
    });

    await verifySchema();
  } catch (error) {
    logger.error('[Migrator] Erro ao executar migrations ou validar schema', {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

module.exports = { migrator, runMigrations, verifySchema, withMigrationLock };
