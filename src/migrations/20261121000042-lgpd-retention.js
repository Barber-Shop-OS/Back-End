'use strict';

// SEC-20: marca quando os dados pessoais de uma barbearia encerrada foram anonimizados (job diário de retenção).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('barbershops', 'anonymized_at', { type: Sequelize.DATE, allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('barbershops', 'anonymized_at');
  },
};
