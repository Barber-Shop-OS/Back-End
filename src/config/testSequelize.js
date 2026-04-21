// Provides a dedicated in-memory SQLite Sequelize instance for test execution.
const { Sequelize } = require('sequelize');

const testSequelize = new Sequelize({
  dialect: 'sqlite',
  storage: ':memory:',
  logging: false,
});

module.exports = testSequelize;