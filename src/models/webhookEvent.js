// BE-33: evento de webhook recebido (idempotência por provider + event_id).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { json } = require('./plan');

const WebhookEvent = sequelize.define('WebhookEvent', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  provider: { type: DataTypes.STRING(30), allowNull: false },
  event_id: { type: DataTypes.STRING(100), allowNull: false },
  type: { type: DataTypes.STRING(60), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false, get: json('payload') },
  // received → processed | ignored | rejected (divergência) | failed
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'received' },
  error: { type: DataTypes.STRING(500), allowNull: true },
  processed_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'webhook_events',
  timestamps: false,
  indexes: [{ name: 'webhook_events_provider_event_unique', unique: true, fields: ['provider', 'event_id'] }],
});

module.exports = WebhookEvent;
