// Agendamento v2 (BE-12): intervalo [start_at, end_at) em UTC, snapshots do serviço no momento da
// reserva (preço, nome, duração) e status completos.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const STATUS = Object.freeze({
  CONFIRMED: 'confirmado',
  COMPLETED: 'concluido',
  CANCELLED: 'cancelado',
  NO_SHOW: 'nao_compareceu',
});
const STATUSES = Object.values(STATUS);
const SOURCES = ['web', 'mobile', 'balcao'];

const Appointment = sequelize.define('appointments', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  // NULL = cliente rápido sem conta (BE-23); nesse caso client_id identifica a pessoa.
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  client_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'barbershop_clients', key: 'id' },
  },
  barber_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'barbers', key: 'id' },
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'services', key: 'id' },
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'branches', key: 'id' },
  },
  start_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  end_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  duration_min: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  price_snapshot: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    get() {
      const value = this.getDataValue('price_snapshot');
      return value === null || value === undefined ? value : Number(value).toFixed(2);
    },
  },
  service_name_snapshot: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  notes: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM(...STATUSES),
    allowNull: false,
    defaultValue: STATUS.CONFIRMED,
  },
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancelled_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  cancel_reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  source: {
    type: DataTypes.ENUM(...SOURCES),
    allowNull: false,
    defaultValue: 'web',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'appointments_barber_start_idx', fields: ['barber_id', 'start_at'] },
    { name: 'appointments_branch_start_idx', fields: ['branch_id', 'start_at'] },
    { name: 'appointments_user_idx', fields: ['user_id'] },
    { name: 'appointments_client_idx', fields: ['client_id'] },
  ],
});

module.exports = Appointment;
module.exports.STATUS = STATUS;
module.exports.STATUSES = STATUSES;
module.exports.SOURCES = SOURCES;
