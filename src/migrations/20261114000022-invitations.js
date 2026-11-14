'use strict';

// BE-22 / SEC-26: convites de barbeiro. Token aleatório guardado só como SHA-256.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('invitations', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      barbershop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'barbershops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      branch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      email: { type: Sequelize.STRING(254), allowNull: false },
      role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'barbeiro' },
      display_name: { type: Sequelize.STRING(120), allowNull: true },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      accepted_at: { type: Sequelize.DATE, allowNull: true },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      invited_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('invitations', ['branch_id', 'email'], { name: 'invitations_branch_email_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('invitations');
  },
};
