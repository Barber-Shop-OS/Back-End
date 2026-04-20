// Sprint 1.7: Updated Service model with proper name and barbershop association
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Service = sequelize.define('Service', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  duration: {
    type: DataTypes.INTEGER,
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
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'services',
  timestamps: false,
});

module.exports = Service;