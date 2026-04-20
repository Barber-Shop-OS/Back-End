// Sprint 1.4: Barbershop model for chain/organization management
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Barbershop = sequelize.define('Barbershop', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  owner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'barbershops',
  timestamps: false,
});

module.exports = Barbershop;
