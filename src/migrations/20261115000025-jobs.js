'use strict';

// BE-16: fila simples persistida (e-mails, lembretes). O worker pega jobs vencidos com
// SELECT ... FOR UPDATE SKIP LOCKED, seguro com mais de uma instância.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('jobs', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      type: { type: Sequelize.STRING(60), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      reference: { type: Sequelize.STRING(100), allowNull: true },
      run_at: { type: Sequelize.DATE, allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'done', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
      last_error: { type: Sequelize.STRING(1000), allowNull: true },
      locked_at: { type: Sequelize.DATE, allowNull: true },
      finished_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('jobs', ['status', 'run_at'], { name: 'jobs_status_run_at_idx' });
    await queryInterface.addIndex('jobs', ['reference'], { name: 'jobs_reference_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('jobs', {});
  },
};
