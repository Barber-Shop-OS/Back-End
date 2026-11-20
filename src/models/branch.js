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
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'branches',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  // BE-36: soft delete — excluir não apaga histórico.
  paranoid: true,
  deletedAt: 'deleted_at',
});

module.exports = Branch;
