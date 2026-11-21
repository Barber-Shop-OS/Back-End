// BE-11: intervalo da jornada semanal do barbeiro (horário local da filial; 0 = domingo).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { hhmm } = require('./branchOpeningHour');

const BarberWorkingHour = sequelize.define('BarberWorkingHour', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  barber_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'barbers', key: 'id' } },
  weekday: { type: DataTypes.SMALLINT, allowNull: false },
  start_time: { type: DataTypes.TIME, allowNull: false, get: hhmm('start_time') },
  end_time: { type: DataTypes.TIME, allowNull: false, get: hhmm('end_time') },
}, {
  tableName: 'barber_working_hours',
  timestamps: false,
  indexes: [{ name: 'barber_working_hours_barber_weekday_idx', fields: ['barber_id', 'weekday'] }],
});

module.exports = BarberWorkingHour;
