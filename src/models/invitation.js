// BE-22: convite de barbeiro para uma filial. Só o hash do token fica no banco (SEC-26).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Invitation = sequelize.define('Invitation', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  barbershop_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'barbershops', key: 'id' } },
  branch_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' } },
  email: { type: DataTypes.STRING(254), allowNull: false },
  role: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'barbeiro' },
  display_name: { type: DataTypes.STRING(120), allowNull: true },
  token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  accepted_at: { type: DataTypes.DATE, allowNull: true },
  revoked_at: { type: DataTypes.DATE, allowNull: true },
  invited_by: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'invitations',
  timestamps: false,
  indexes: [{ name: 'invitations_branch_email_idx', fields: ['branch_id', 'email'] }],
});

module.exports = Invitation;
