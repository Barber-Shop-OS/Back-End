'use strict';

// BE-30 / SEC-15: refresh tokens opacos com rotação e detecção de reuso (família).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      family_id: { type: Sequelize.STRING(36), allowNull: false },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      token_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      replaced_by: { type: Sequelize.INTEGER, allowNull: true },
      user_agent: { type: Sequelize.STRING(255), allowNull: true },
      ip: { type: Sequelize.STRING(64), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      last_used_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('refresh_tokens', ['user_id'], { name: 'refresh_tokens_user_idx' });
    await queryInterface.addIndex('refresh_tokens', ['family_id'], { name: 'refresh_tokens_family_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('refresh_tokens', {});
  },
};
