'use strict';

// BE-01: telefone do usuário (E.164) para contato e busca de clientes.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const columns = await queryInterface.describeTable('users');
    if (!columns.phone) {
      await queryInterface.addColumn('users', 'phone', {
        type: Sequelize.STRING(20),
        allowNull: true,
      });
      await queryInterface.addIndex('users', ['phone'], { name: 'users_phone_idx' });
    }
  },

  down: async (queryInterface) => {
    const columns = await queryInterface.describeTable('users');
    if (columns.phone) {
      await queryInterface.removeIndex('users', 'users_phone_idx');
      await queryInterface.removeColumn('users', 'phone');
    }
  },
};
