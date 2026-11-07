// Conexão Sequelize.
// - Testes: SQLite em memória por padrão; TEST_DB_DIALECT=mysql usa o MySQL configurado em DB_* (job de CI).
// - Demais ambientes: MySQL, datas em UTC e sem log de SQL (evita dados pessoais nos logs).
const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

const isTestEnv = process.env.NODE_ENV === 'test';
const useMysqlInTests = isTestEnv && process.env.TEST_DB_DIALECT === 'mysql';
const usesSsl = process.env.DB_SSL === 'true';

const mysqlOptions = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  timezone: '+00:00',
  logging: false,
  dialectOptions: usesSsl
    ? {
        // SEC-12 (pendente em BE-44): validar o certificado do provedor com DB_SSL_CA.
        ssl: { require: true, rejectUnauthorized: false },
      }
    : undefined,
};

const sequelize =
  isTestEnv && !useMysqlInTests
    ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    : new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, mysqlOptions);

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
