// BE-51: notificação in-app de um usuário (central de notificações).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { json } = require('./plan');

const UserNotification = sequelize.define('UserNotification', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  type: { type: DataTypes.STRING(50), allowNull: false },
  title: { type: DataTypes.STRING(150), allowNull: false },
  body: { type: DataTypes.STRING(500), allowNull: false },
  link: { type: DataTypes.STRING(500), allowNull: true },
  data: { type: DataTypes.JSON, allowNull: true, get: json('data') },
  source_key: { type: DataTypes.STRING(100), allowNull: true },
  read_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'user_notifications',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'user_notifications_user_created_idx', fields: ['user_id', 'created_at'] },
    { name: 'user_notifications_user_read_idx', fields: ['user_id', 'read_at'] },
    { name: 'user_notifications_user_source_unique', unique: true, fields: ['user_id', 'source_key'] },
  ],
});

module.exports = UserNotification;
