// Conexão Sequelize.
// - Testes: SQLite em memória por padrão; TEST_DB_DIALECT=postgres usa o PostgreSQL configurado
//   (DATABASE_URL ou DB_*) — job de CI e validação local.
// - Demais ambientes: PostgreSQL (Supabase em produção), datas em UTC e sem log de SQL.
const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const logger = require('../utils/logger');
const { postgresConfig } = require('./dbOptions');

dotenv.config();

const isTestEnv = process.env.NODE_ENV === 'test';
const usePostgresInTests = isTestEnv && process.env.TEST_DB_DIALECT === 'postgres';

const createPostgres = () => {
  const config = postgresConfig();
  return config.url
    ? new Sequelize(config.url, config.options)
    : new Sequelize(config.database, config.username, config.password, config.options);
};

const sequelize =
  isTestEnv && !usePostgresInTests ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) : createPostgres();

const connectDatabase = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');
  } catch (error) {
    logger.error('Unable to connect to the database', { message: error.message, stack: error.stack });
    throw error;
  }
};

module.exports = sequelize;
module.exports.connectDatabase = connectDatabase;
