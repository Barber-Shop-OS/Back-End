'use strict';

// BE-15: histórico do agendamento (quem, quando, de → para). Base da auditoria do BE-36.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('appointment_events', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      appointment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'appointments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      actor_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      actor_role: { type: Sequelize.STRING(20), allowNull: true },
      type: { type: Sequelize.STRING(30), allowNull: false },
      from_status: { type: Sequelize.STRING(20), allowNull: true },
      to_status: { type: Sequelize.STRING(20), allowNull: true },
      payload: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('appointment_events', ['appointment_id', 'created_at'], {
      name: 'appointment_events_appointment_idx',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('appointment_events', {});
  },
};
