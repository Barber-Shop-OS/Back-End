'use strict';

// BE-05: barbeiro ganha nome de exibição, foto, flag de ativo e unicidade (usuário, filial).
// Barbeiro removido é desativado (active=false) para preservar o histórico de agendamentos.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('barbers', 'display_name', { type: Sequelize.STRING(120), allowNull: true });
    await queryInterface.addColumn('barbers', 'photo_url', { type: Sequelize.STRING(500), allowNull: true });
    await queryInterface.addColumn('barbers', 'active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addIndex('barbers', ['user_id', 'branch_id'], {
      name: 'barbers_user_branch_unique',
      unique: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('barbers', 'barbers_user_branch_unique');
    await queryInterface.removeColumn('barbers', 'active');
    await queryInterface.removeColumn('barbers', 'photo_url');
    await queryInterface.removeColumn('barbers', 'display_name');
  },
};
