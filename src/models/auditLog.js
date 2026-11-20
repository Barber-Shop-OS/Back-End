// BE-36: trilha de auditoria (quem fez o quê, antes/depois).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { json } = require('./plan');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  actor_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  actor_role: { type: DataTypes.STRING(20), allowNull: true },
  barbershop_id: { type: DataTypes.INTEGER, allowNull: true },
  action: { type: DataTypes.STRING(60), allowNull: false },
  entity: { type: DataTypes.STRING(40), allowNull: false },
  entity_id: { type: DataTypes.STRING(64), allowNull: true },
  before: { type: DataTypes.JSON, allowNull: true, get: json('before') },
  after: { type: DataTypes.JSON, allowNull: true, get: json('after') },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  request_id: { type: DataTypes.STRING(100), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'audit_logs',
  timestamps: false,
  indexes: [
    { name: 'audit_logs_shop_created_idx', fields: ['barbershop_id', 'created_at'] },
    { name: 'audit_logs_actor_idx', fields: ['actor_id'] },
  ],
});

module.exports = AuditLog;
