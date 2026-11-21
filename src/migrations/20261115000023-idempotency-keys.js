'use strict';

// BE-14: Idempotency-Key em POST /api/appointment (duplo clique, retry do mobile). TTL 24 h.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('idempotency_keys', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      key: { type: Sequelize.STRING(100), allowNull: false },
      scope: { type: Sequelize.STRING(60), allowNull: false },
      request_hash: { type: Sequelize.STRING(64), allowNull: false },
      response_status: { type: Sequelize.INTEGER, allowNull: false },
      response_body: { type: Sequelize.JSON, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('idempotency_keys', ['user_id', 'scope', 'key'], {
      name: 'idempotency_keys_user_scope_key_unique',
      unique: true,
    });
    await queryInterface.addIndex('idempotency_keys', ['expires_at'], { name: 'idempotency_keys_expires_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('idempotency_keys', {});
  },
};
