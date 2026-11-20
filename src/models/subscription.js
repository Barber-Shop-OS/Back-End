// BE-31: assinatura SaaS — uma por barbearia (tenant). Ativação só por webhook (BE-33).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const SUBSCRIPTION_STATUSES = ['trialing', 'pending', 'active', 'past_due', 'canceled', 'expired'];

const Subscription = sequelize.define('Subscription', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  barbershop_id: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: 'barbershops', key: 'id' } },
  plan_code: { type: DataTypes.STRING(30), allowNull: false },
  status: { type: DataTypes.ENUM(...SUBSCRIPTION_STATUSES), allowNull: false, defaultValue: 'trialing' },
  trial_ends_at: { type: DataTypes.DATE, allowNull: true },
  current_period_start: { type: DataTypes.DATE, allowNull: true },
  current_period_end: { type: DataTypes.DATE, allowNull: true },
  cancel_at_period_end: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  past_due_since: { type: DataTypes.DATE, allowNull: true },
  abacatepay_customer_id: { type: DataTypes.STRING(100), allowNull: true },
  abacatepay_subscription_id: { type: DataTypes.STRING(100), allowNull: true },
  abacatepay_checkout_id: { type: DataTypes.STRING(100), allowNull: true },
  // BE-32
  billing_tax_id: { type: DataTypes.STRING(14), allowNull: true },
  pending_plan_code: { type: DataTypes.STRING(30), allowNull: true },
  cancel_requested_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'subscriptions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Subscription;
module.exports.SUBSCRIPTION_STATUSES = SUBSCRIPTION_STATUSES;
