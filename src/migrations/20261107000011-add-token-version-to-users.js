'use strict';

// BE-02: token_version permite invalidar todos os tokens de um usuário (troca de papel/senha, logout global).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const columns = await queryInterface.describeTable('users');
    if (!columns.token_version) {
      await queryInterface.addColumn('users', 'token_version', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  down: async (queryInterface) => {
    const columns = await queryInterface.describeTable('users');
    if (columns.token_version) {
      await queryInterface.removeColumn('users', 'token_version');
    }
  },
};
