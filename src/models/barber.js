// Sprint 1.6: Updated Barber model with branch association
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Barber = sequelize.define('barbers', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'branches',
      key: 'id',
    },
  },
  bio: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '',
  },
  display_name: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  photo_url: {
    type: DataTypes.STRING(500),
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
  timestamps: false,
  indexes: [{ name: 'barbers_user_branch_unique', unique: true, fields: ['user_id', 'branch_id'] }],
});

module.exports = Barber;