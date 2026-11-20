// BE-45: token de push (Expo) de um aparelho.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PushToken = sequelize.define('PushToken', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  expo_token: { type: DataTypes.STRING(200), allowNull: false, unique: true },
  platform: { type: DataTypes.STRING(10), allowNull: true },
  last_seen_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'push_tokens',
  timestamps: false,
  indexes: [{ name: 'push_tokens_user_idx', fields: ['user_id'] }],
});

module.exports = PushToken;
