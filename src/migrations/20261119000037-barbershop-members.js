'use strict';

// BE-47: gerentes de filial (plano Rede). Papel por barbearia, sem mexer no ENUM global users.role.
// branch_ids NULL = todas as filiais da barbearia.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('barbershop_members', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      barbershop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'barbershops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'manager' },
      branch_ids: { type: Sequelize.JSON, allowNull: true },
      created_by: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('barbershop_members', ['barbershop_id', 'user_id'], { name: 'barbershop_members_shop_user_unique', unique: true });
    await queryInterface.addIndex('barbershop_members', ['user_id'], { name: 'barbershop_members_user_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('barbershop_members');
  },
};
