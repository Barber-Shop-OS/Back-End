'use strict';

// BE-06: dinheiro em DECIMAL(10,2), ativação e soft delete de serviços.
// No SQLite changeColumn recria a tabela sem os índices: garante o índice de BE-08.
const ensureIndex = async (queryInterface) => {
  const names = new Set((await queryInterface.showIndex('services')).map((index) => index.name));
  if (!names.has('services_barbershop_idx')) {
    await queryInterface.addIndex('services', ['barbershop_id'], { name: 'services_barbershop_idx' });
  }
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('services', 'price', { type: Sequelize.DECIMAL(10, 2), allowNull: false });
    await queryInterface.addColumn('services', 'active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn('services', 'deleted_at', { type: Sequelize.DATE, allowNull: true });
    await ensureIndex(queryInterface);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('services', 'deleted_at');
    await queryInterface.removeColumn('services', 'active');
    await queryInterface.changeColumn('services', 'price', { type: Sequelize.FLOAT, allowNull: false });
    await ensureIndex(queryInterface);
  },
};
