'use strict';

// BE-36: soft delete (deleted_at) em barbearias, filiais e usuários — excluir não apaga histórico
// (agendamentos, pagamentos) — e trilha de auditoria das ações sensíveis.
const PARANOID_TABLES = ['barbershops', 'branches', 'users'];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    for (const table of PARANOID_TABLES) {
      await queryInterface.addColumn(table, 'deleted_at', { type: Sequelize.DATE, allowNull: true });
    }
    await queryInterface.createTable('audit_logs', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      actor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      actor_role: { type: Sequelize.STRING(20), allowNull: true },
      barbershop_id: { type: Sequelize.INTEGER, allowNull: true },
      action: { type: Sequelize.STRING(60), allowNull: false },
      entity: { type: Sequelize.STRING(40), allowNull: false },
      entity_id: { type: Sequelize.STRING(64), allowNull: true },
      before: { type: Sequelize.JSON, allowNull: true },
      after: { type: Sequelize.JSON, allowNull: true },
      ip: { type: Sequelize.STRING(64), allowNull: true },
      request_id: { type: Sequelize.STRING(100), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('audit_logs', ['barbershop_id', 'created_at'], { name: 'audit_logs_shop_created_idx' });
    await queryInterface.addIndex('audit_logs', ['actor_id'], { name: 'audit_logs_actor_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('audit_logs');
    for (const table of PARANOID_TABLES) {
      await queryInterface.removeColumn(table, 'deleted_at');
    }
  },
};
