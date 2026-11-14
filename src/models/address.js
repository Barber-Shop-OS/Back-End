// Sprint 1.2: Address model for branch locations
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Address = sequelize.define('Address', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  cep: {
    type: DataTypes.STRING(9),
    allowNull: false,
  },
  street: {
    type: DataTypes.STRING(160),
    allowNull: true,
  },
  number: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  complement: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  neighborhood: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  state: {
    type: DataTypes.STRING(2),
    allowNull: false,
  },
  latitude: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: true,
    get() {
      const value = this.getDataValue('latitude');
      return value === null || value === undefined ? null : Number(value);
    },
  },
  longitude: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: true,
    get() {
      const value = this.getDataValue('longitude');
      return value === null || value === undefined ? null : Number(value);
    },
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'addresses',
  timestamps: false,
});

module.exports = Address;
