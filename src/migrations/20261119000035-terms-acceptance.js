'use strict';

// BE-40 / SEC-20: aceite dos termos de uso e da política de privacidade (com versão) no cadastro.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'terms_accepted_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('users', 'terms_version', { type: Sequelize.STRING(20), allowNull: true });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'terms_version');
    await queryInterface.removeColumn('users', 'terms_accepted_at');
  },
};
