// BE-23: cliente de uma barbearia (CRM). Pode ter conta (user_id) ou ser "cliente rápido" de balcão.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const BarbershopClient = sequelize.define('BarbershopClient', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  barbershop_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'barbershops', key: 'id' },
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  name: { type: DataTypes.STRING(120), allowNull: false },
  phone: { type: DataTypes.STRING(20), allowNull: true },
  email: { type: DataTypes.STRING(254), allowNull: true },
  notes: { type: DataTypes.STRING(1000), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'barbershop_clients',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'barbershop_clients_shop_user_unique', unique: true, fields: ['barbershop_id', 'user_id'] },
    { name: 'barbershop_clients_shop_phone_idx', fields: ['barbershop_id', 'phone'] },
    { name: 'barbershop_clients_shop_email_idx', fields: ['barbershop_id', 'email'] },
    { name: 'barbershop_clients_shop_name_idx', fields: ['barbershop_id', 'name'] },
  ],
});

module.exports = BarbershopClient;
