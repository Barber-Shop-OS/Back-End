// Configuração do Sequelize CLI (npm run migrate*). Mesma conexão PostgreSQL da API (dbOptions.js).
const dotenv = require('dotenv');
const { postgresConfig } = require('./dbOptions');

dotenv.config();

const fromEnv = (overrides = {}) => {
  const config = postgresConfig({ ...process.env, ...overrides });
  return config.url
    ? { url: config.url, ...config.options }
    : { ...config.options, database: config.database, username: config.username, password: config.password };
};

module.exports = {
  development: fromEnv(),
  test: fromEnv({ DB_NAME: process.env.DB_NAME_TEST || 'barbershop_test' }),
  production: fromEnv(),
};
