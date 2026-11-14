'use strict';

// BE-17: endereço v2 — logradouro, bairro e coordenadas (busca por distância — BE-25).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('addresses', 'street', { type: Sequelize.STRING(160), allowNull: true });
    await queryInterface.addColumn('addresses', 'neighborhood', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.addColumn('addresses', 'latitude', { type: Sequelize.DECIMAL(9, 6), allowNull: true });
    await queryInterface.addColumn('addresses', 'longitude', { type: Sequelize.DECIMAL(9, 6), allowNull: true });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('addresses', 'longitude');
    await queryInterface.removeColumn('addresses', 'latitude');
    await queryInterface.removeColumn('addresses', 'neighborhood');
    await queryInterface.removeColumn('addresses', 'street');
  },
};
