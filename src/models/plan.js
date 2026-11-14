// BE-31: plano SaaS. Preços em centavos (integração AbacatePay); limits/features em JSON.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

// SQLite devolve JSON como texto em consultas sem conversão: normaliza.
const json = (field) =>
  function get() {
    const value = this.getDataValue(field);
    return typeof value === 'string' ? JSON.parse(value) : value;
  };

const Plan = sequelize.define('Plan', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(60), allowNull: false },
  price_cents: { type: DataTypes.INTEGER, allowNull: false },
  interval: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MONTHLY' },
  limits: { type: DataTypes.JSON, allowNull: false, get: json('limits') },
  features: { type: DataTypes.JSON, allowNull: false, get: json('features') },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  abacatepay_product_id: { type: DataTypes.STRING(100), allowNull: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'plans',
  timestamps: false,
});

module.exports = Plan;
module.exports.json = json;
