// BE-47: membro da barbearia com papel (gerente). branch_ids nulo = todas as filiais.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { json } = require('./plan');

const BarbershopMember = sequelize.define('BarbershopMember', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  barbershop_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'barbershops', key: 'id' }, onDelete: 'CASCADE' },
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  role: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'manager' },
  branch_ids: { type: DataTypes.JSON, allowNull: true, get: json('branch_ids') },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'barbershop_members',
  timestamps: false,
  indexes: [
    { name: 'barbershop_members_shop_user_unique', unique: true, fields: ['barbershop_id', 'user_id'] },
    { name: 'barbershop_members_user_idx', fields: ['user_id'] },
  ],
});

module.exports = BarbershopMember;
