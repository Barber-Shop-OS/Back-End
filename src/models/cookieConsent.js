// BE-58: registro de consentimento de cookies (LGPD art. 8º §2º — o controlador prova o consentimento).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const CookieConsent = sequelize.define('CookieConsent', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  consent_id: { type: DataTypes.STRING(36), allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  policy_version: { type: DataTypes.STRING(20), allowNull: false },
  analytics: { type: DataTypes.BOOLEAN, allowNull: false },
  marketing: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  action: { type: DataTypes.STRING(20), allowNull: false },
  ip_hash: { type: DataTypes.STRING(64), allowNull: true },
  user_agent: { type: DataTypes.STRING(255), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'cookie_consents',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'cookie_consents_consent_created_idx', fields: ['consent_id', 'created_at'] },
    { name: 'cookie_consents_user_idx', fields: ['user_id'] },
    { name: 'cookie_consents_created_idx', fields: ['created_at'] },
  ],
});

module.exports = CookieConsent;
