'use strict';

// BE-51: central de notificações in-app (sino). source_key evita duplicar quando o job é reprocessado.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_notifications', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(50), allowNull: false },
      title: { type: Sequelize.STRING(150), allowNull: false },
      body: { type: Sequelize.STRING(500), allowNull: false },
      link: { type: Sequelize.STRING(500), allowNull: true },
      data: { type: Sequelize.JSON, allowNull: true },
      source_key: { type: Sequelize.STRING(100), allowNull: true },
      read_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('user_notifications', ['user_id', 'created_at'], { name: 'user_notifications_user_created_idx' });
    await queryInterface.addIndex('user_notifications', ['user_id', 'read_at'], { name: 'user_notifications_user_read_idx' });
    await queryInterface.addIndex('user_notifications', ['user_id', 'source_key'], { name: 'user_notifications_user_source_unique', unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('user_notifications');
  },
};
