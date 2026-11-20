'use strict';

// BE-27: verificação de e-mail. Contas já existentes são consideradas verificadas (não perdem a
// página pública com a mudança); contas novas nascem sem verificação.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'email_verified_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.sequelize.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP');
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'email_verified_at');
  },
};
