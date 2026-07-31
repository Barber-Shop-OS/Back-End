const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

const isTestEnv = process.env.NODE_ENV === 'test';
const usesSsl = process.env.DB_SSL === 'true';

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
        dialectOptions: usesSsl
          ? {
              ssl: {
                require: true,
                rejectUnauthorized: false,
              },
            }
          : undefined,
      },
    );

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
