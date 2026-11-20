// BE-26: token de uso único da conta (password_reset, email_verification, email_change).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { json } = require('./plan');

const PURPOSES = Object.freeze({
  PASSWORD_RESET: 'password_reset',
  EMAIL_VERIFICATION: 'email_verification',
  EMAIL_CHANGE: 'email_change',
});

const UserToken = sequelize.define('UserToken', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  purpose: { type: DataTypes.STRING(30), allowNull: false },
  token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  payload: { type: DataTypes.JSON, allowNull: true, get: json('payload') },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'user_tokens',
  timestamps: false,
  indexes: [{ name: 'user_tokens_user_purpose_idx', fields: ['user_id', 'purpose'] }],
});

module.exports = UserToken;
module.exports.PURPOSES = PURPOSES;
