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
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("cliente", "barbeiro", "owner", "admin"),
      defaultValue: "cliente",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false, 
  }
);

module.exports = User;
