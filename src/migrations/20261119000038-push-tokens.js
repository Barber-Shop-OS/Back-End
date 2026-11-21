'use strict';

// BE-45: tokens do Expo Push por aparelho (um token pertence a um usuário por vez).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('push_tokens', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      expo_token: { type: Sequelize.STRING(200), allowNull: false, unique: true },
      platform: { type: Sequelize.STRING(10), allowNull: true },
      last_seen_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('push_tokens', ['user_id'], { name: 'push_tokens_user_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('push_tokens', {});
  },
};
