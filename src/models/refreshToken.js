// BE-30: refresh token (só o SHA-256 no banco). Mesma família = mesma sessão ao longo das rotações.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const RefreshToken = sequelize.define('RefreshToken', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  family_id: { type: DataTypes.STRING(36), allowNull: false },
  token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  token_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  revoked_at: { type: DataTypes.DATE, allowNull: true },
  replaced_by: { type: DataTypes.INTEGER, allowNull: true },
  user_agent: { type: DataTypes.STRING(255), allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  last_used_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'refresh_tokens',
  timestamps: false,
  indexes: [
    { name: 'refresh_tokens_user_idx', fields: ['user_id'] },
    { name: 'refresh_tokens_family_idx', fields: ['family_id'] },
  ],
});

module.exports = RefreshToken;
