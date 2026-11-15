// BE-14: resposta já entregue para um Idempotency-Key (por usuário e operação). TTL 24 h.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const IdempotencyKey = sequelize.define('IdempotencyKey', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  key: { type: DataTypes.STRING(100), allowNull: false },
  scope: { type: DataTypes.STRING(60), allowNull: false },
  request_hash: { type: DataTypes.STRING(64), allowNull: false },
  response_status: { type: DataTypes.INTEGER, allowNull: false },
  response_body: { type: DataTypes.JSON, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'idempotency_keys',
  timestamps: false,
  indexes: [
    { name: 'idempotency_keys_user_scope_key_unique', unique: true, fields: ['user_id', 'scope', 'key'] },
    { name: 'idempotency_keys_expires_idx', fields: ['expires_at'] },
  ],
});

module.exports = IdempotencyKey;
