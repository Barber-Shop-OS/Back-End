// BE-10: fechamento pontual da filial (feriado, reforma). all_day ou intervalo local [start_time, end_time).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { hhmm } = require('./branchOpeningHour');

const BranchClosure = sequelize.define('BranchClosure', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' } },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  reason: { type: DataTypes.STRING(255), allowNull: true },
  all_day: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  start_time: { type: DataTypes.TIME, allowNull: true, get: hhmm('start_time') },
  end_time: { type: DataTypes.TIME, allowNull: true, get: hhmm('end_time') },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'branch_closures',
  timestamps: false,
  indexes: [{ name: 'branch_closures_branch_date_idx', fields: ['branch_id', 'date'] }],
});

module.exports = BranchClosure;
