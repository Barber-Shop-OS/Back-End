// Pagamento presencial do cliente final à barbearia (BE-07). Não confundir com a assinatura SaaS.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const METHODS = ['PIX', 'CASH', 'CARD'];
const STATUSES = ['PENDING', 'PAID', 'FAILED'];

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'appointments',
      key: 'id',
    },
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    get() {
      const value = this.getDataValue('amount');
      return value === null || value === undefined ? value : Number(value).toFixed(2);
    },
  },
  method: {
    type: DataTypes.ENUM(...METHODS),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM(...STATUSES),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  transaction_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  recorded_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'branches', key: 'id' },
  },
  barbershop_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'barbershops', key: 'id' },
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
  tableName: 'payments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'payments_appointment_unique', unique: true, fields: ['appointment_id'] },
    { name: 'payments_barbershop_created_idx', fields: ['barbershop_id', 'created_at'] },
    { name: 'payments_branch_created_idx', fields: ['branch_id', 'created_at'] },
  ],
});

module.exports = Payment;
module.exports.METHODS = METHODS;
module.exports.STATUSES = STATUSES;
