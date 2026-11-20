// BE-28: identidade externa vinculada à conta (ex.: Google `sub`).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const UserIdentity = sequelize.define('UserIdentity', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  provider: { type: DataTypes.STRING(30), allowNull: false },
  provider_user_id: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'user_identities',
  timestamps: false,
  indexes: [
    { name: 'user_identities_provider_unique', unique: true, fields: ['provider', 'provider_user_id'] },
    { name: 'user_identities_user_idx', fields: ['user_id'] },
  ],
});

module.exports = UserIdentity;
