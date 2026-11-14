// BE-10: intervalo de funcionamento de uma filial num dia da semana (0 = domingo), no fuso da filial.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

// TIME vem como "09:00:00" (MySQL) ou como foi gravado (SQLite): expõe sempre "HH:mm".
const hhmm = (field) =>
  function get() {
    const value = this.getDataValue(field);
    return value === null || value === undefined ? value : String(value).slice(0, 5);
  };

const BranchOpeningHour = sequelize.define('BranchOpeningHour', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' } },
  weekday: { type: DataTypes.TINYINT, allowNull: false },
  opens_at: { type: DataTypes.TIME, allowNull: false, get: hhmm('opens_at') },
  closes_at: { type: DataTypes.TIME, allowNull: false, get: hhmm('closes_at') },
}, {
  tableName: 'branch_opening_hours',
  timestamps: false,
  indexes: [{ name: 'branch_opening_hours_branch_weekday_idx', fields: ['branch_id', 'weekday'] }],
});

module.exports = BranchOpeningHour;
module.exports.hhmm = hhmm;
