// Serviço oferecido por uma barbearia. BE-06: preço DECIMAL(10,2) (sempre serializado como "29.90"),
// ativação e soft delete (deleted_at) para não quebrar o histórico de agendamentos.
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
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    // MySQL devolve string e SQLite número: normaliza para "0.00" nos dois.
    get() {
      const value = this.getDataValue('price');
      return value === null || value === undefined ? value : Number(value).toFixed(2);
    },
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
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
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'services',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  paranoid: true,
  deletedAt: 'deleted_at',
});

module.exports = Service;
