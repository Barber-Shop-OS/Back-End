// Sprint 1.5: Branch model for barbershop locations
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Branch = sequelize.define('Branch', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  barbershop_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'barbershops',
      key: 'id',
    },
  },
  address_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'addresses',
      key: 'id',
    },
  },
  timezone: {
    type: DataTypes.STRING(64),
    allowNull: false,
    defaultValue: 'America/Sao_Paulo',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  whatsapp: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'branches',
  timestamps: false,
});

module.exports = Branch;
