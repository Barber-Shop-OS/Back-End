'use strict';

// Keeps existing user records while aligning the old column name with the model.
module.exports = {
  up: async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'string' ? table : table.tableName));
    if (!tableNames.includes('users')) return;

    const columns = await queryInterface.describeTable('users');
    if (columns.createdAt && !columns.created_at) {
      await queryInterface.renameColumn('users', 'createdAt', 'created_at');
    }
  },

  down: async (queryInterface) => {
    const columns = await queryInterface.describeTable('users');
    if (columns.created_at && !columns.createdAt) {
      await queryInterface.renameColumn('users', 'created_at', 'createdAt');
    }
  },
};
