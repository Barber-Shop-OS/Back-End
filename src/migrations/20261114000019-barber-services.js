'use strict';

// BE-19: serviços que cada barbeiro executa.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('barber_services', {
      barber_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: 'barbers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      service_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: 'services', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
    });
    await queryInterface.addIndex('barber_services', ['service_id'], { name: 'barber_services_service_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('barber_services', {});
  },
};
