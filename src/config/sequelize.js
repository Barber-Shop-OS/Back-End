const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const logger = require('../utils/logger');
dotenv.config();

const isTestEnv = process.env.NODE_ENV === 'test';

const sequelize = isTestEnv
  ? new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    })
  : new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Permite a conexão caso não esteja passando a CA explicitamente
      }
    }
  }
);

sequelize.authenticate()
  .then(() => {
    logger.info('Database connection established successfully.');
  })
  .catch(err => {
    logger.error('Unable to connect to the database', { message: err.message, stack: err.stack });
  });

module.exports = sequelize;
