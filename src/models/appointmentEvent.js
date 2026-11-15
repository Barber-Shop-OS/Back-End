// BE-15: evento do histórico de um agendamento (created, cancelled, rescheduled, completed, no_show).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const AppointmentEvent = sequelize.define('AppointmentEvent', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  appointment_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'appointments', key: 'id' } },
  actor_user_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  actor_role: { type: DataTypes.STRING(20), allowNull: true },
  type: { type: DataTypes.STRING(30), allowNull: false },
  from_status: { type: DataTypes.STRING(20), allowNull: true },
  to_status: { type: DataTypes.STRING(20), allowNull: true },
  payload: { type: DataTypes.JSON, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'appointment_events',
  timestamps: false,
  indexes: [{ name: 'appointment_events_appointment_idx', fields: ['appointment_id', 'created_at'] }],
});

module.exports = AppointmentEvent;
