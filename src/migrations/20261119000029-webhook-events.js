'use strict';

// BE-33 / SEC-13: idempotência dos webhooks — o mesmo `id` reentregue (a AbacatePay retenta até 7×
// em ~18 h com o mesmo id) nunca é processado duas vezes.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('webhook_events', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      provider: { type: Sequelize.STRING(30), allowNull: false },
      event_id: { type: Sequelize.STRING(100), allowNull: false },
      type: { type: Sequelize.STRING(60), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'received' },
      error: { type: Sequelize.STRING(500), allowNull: true },
      processed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('webhook_events', ['provider', 'event_id'], { name: 'webhook_events_provider_event_unique', unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('webhook_events', {});
  },
};
