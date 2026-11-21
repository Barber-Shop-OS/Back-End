'use strict';

// SEC-21: a barbearia pode bloquear um cliente de agendar online (faltas recorrentes, abuso).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('barbershop_clients', 'blocked_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('barbershop_clients', 'blocked_reason', { type: Sequelize.STRING(255), allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('barbershop_clients', 'blocked_reason');
    await queryInterface.removeColumn('barbershop_clients', 'blocked_at');
  },
};
