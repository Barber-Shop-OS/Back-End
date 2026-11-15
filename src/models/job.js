// BE-16: job da fila persistida. `reference` agrupa jobs de um recurso (ex.: "appointment:42")
// para cancelar lembretes quando o agendamento é cancelado/reagendado.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const JOB_STATUSES = ['pending', 'running', 'done', 'failed', 'cancelled'];

const Job = sequelize.define('Job', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  type: { type: DataTypes.STRING(60), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  reference: { type: DataTypes.STRING(100), allowNull: true },
  run_at: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM(...JOB_STATUSES), allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  last_error: { type: DataTypes.STRING(1000), allowNull: true },
  locked_at: { type: DataTypes.DATE, allowNull: true },
  finished_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'jobs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'jobs_status_run_at_idx', fields: ['status', 'run_at'] },
    { name: 'jobs_reference_idx', fields: ['reference'] },
  ],
});

module.exports = Job;
module.exports.JOB_STATUSES = JOB_STATUSES;
