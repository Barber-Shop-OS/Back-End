'use strict';

// BE-06: dinheiro em DECIMAL(10,2), ativação e soft delete de serviços.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('services', 'price', { type: Sequelize.DECIMAL(10, 2), allowNull: false });
    await queryInterface.addColumn('services', 'active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn('services', 'deleted_at', { type: Sequelize.DATE, allowNull: true });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('services', 'deleted_at');
    await queryInterface.removeColumn('services', 'active');
    await queryInterface.changeColumn('services', 'price', { type: Sequelize.FLOAT, allowNull: false });
  },
};
