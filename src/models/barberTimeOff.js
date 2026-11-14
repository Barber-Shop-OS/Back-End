// BE-11: bloqueio na agenda do barbeiro (almoço, folga, médico). Intervalo UTC [start_at, end_at).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const BarberTimeOff = sequelize.define('BarberTimeOff', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  barber_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'barbers', key: 'id' } },
  start_at: { type: DataTypes.DATE, allowNull: false },
  end_at: { type: DataTypes.DATE, allowNull: false },
  reason: { type: DataTypes.STRING(255), allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'barber_time_off',
  timestamps: false,
  indexes: [{ name: 'barber_time_off_barber_start_idx', fields: ['barber_id', 'start_at'] }],
});

module.exports = BarberTimeOff;
