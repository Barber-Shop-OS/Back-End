// BE-34: upload de imagem (logo, capa, foto de barbeiro) — pendente até ser confirmado.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Upload = sequelize.define('Upload', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  barbershop_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'barbershops', key: 'id' }, onDelete: 'CASCADE' },
  kind: { type: DataTypes.STRING(20), allowNull: false },
  target_id: { type: DataTypes.INTEGER, allowNull: false },
  object_key: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  content_type: { type: DataTypes.STRING(30), allowNull: false },
  size: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'uploads',
  timestamps: false,
});

module.exports = Upload;
