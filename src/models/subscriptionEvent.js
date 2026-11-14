// BE-31: histórico de transições da assinatura (trial, checkout, webhook, cancelamento...).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { json } = require('./plan');

const SubscriptionEvent = sequelize.define('SubscriptionEvent', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  subscription_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'subscriptions', key: 'id' } },
  type: { type: DataTypes.STRING(60), allowNull: false },
  from_status: { type: DataTypes.STRING(20), allowNull: true },
  to_status: { type: DataTypes.STRING(20), allowNull: true },
  payload: { type: DataTypes.JSON, allowNull: true, get: json('payload') },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'subscription_events',
  timestamps: false,
  indexes: [{ name: 'subscription_events_subscription_idx', fields: ['subscription_id'] }],
});

module.exports = SubscriptionEvent;
