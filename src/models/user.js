// Sprint 1.2: Updated User model with extended roles for SaaS
const { DataTypes } = require("sequelize");
const sequelize = require('../config/sequelize');

const User = sequelize.define("users", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true, // BE-28: nulo em conta só-Google
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM("cliente", "barbeiro", "owner", "admin"),
      defaultValue: "cliente",
    },
    // BE-27: null = e-mail ainda não confirmado.
    email_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    token_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // SEC-27: 2FA (TOTP). Segredos cifrados (shared/secretBox); nunca saem da API.
    totp_secret: { type: DataTypes.STRING(255), allowNull: true },
    totp_pending_secret: { type: DataTypes.STRING(255), allowNull: true },
    totp_enabled_at: { type: DataTypes.DATE, allowNull: true },
    totp_recovery_codes: { type: DataTypes.TEXT, allowNull: true },
    totp_last_step: { type: DataTypes.BIGINT, allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // BE-40: aceite dos termos/privacidade.
    terms_accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    terms_version: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
  },
  {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    // BE-36: soft delete — conta excluída não loga nem aparece, mas o histórico fica.
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

module.exports = User;
