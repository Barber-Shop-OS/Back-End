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
