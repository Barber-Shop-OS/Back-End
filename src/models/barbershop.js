// Sprint 1.4: Barbershop model for chain/organization management
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { generateUniqueSlug } = require('../shared/slug');

const Barbershop = sequelize.define('Barbershop', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  owner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  // BE-18: perfil público.
  slug: { type: DataTypes.STRING(60), allowNull: false, unique: 'barbershops_slug_unique' },
  description: { type: DataTypes.STRING(1000), allowNull: true },
  phone: { type: DataTypes.STRING(20), allowNull: true },
  whatsapp: { type: DataTypes.STRING(20), allowNull: true },
  instagram: { type: DataTypes.STRING(60), allowNull: true },
  logo_url: { type: DataTypes.STRING(500), allowNull: true },
  cover_url: { type: DataTypes.STRING(500), allowNull: true },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'deleted'),
    allowNull: false,
    defaultValue: 'active',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  // SEC-20: dados pessoais anonimizados após o período de retenção (barbearia encerrada).
  anonymized_at: { type: DataTypes.DATE, allowNull: true },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'barbershops',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  // BE-36: soft delete — excluir não apaga histórico.
  paranoid: true,
  deletedAt: 'deleted_at',
  hooks: {
    // Sem slug informado, gera um único a partir do nome.
    beforeValidate: async (barbershop, options) => {
      if (barbershop.slug) return;
      barbershop.slug = await generateUniqueSlug(barbershop.name, async (candidate) =>
        Boolean(await Barbershop.count({ where: { slug: candidate }, transaction: options.transaction }))
      );
    },
    // bulkCreate não roda beforeValidate por instância: gera os slugs evitando colisão no lote.
    beforeBulkCreate: async (barbershops, options) => {
      const batch = new Set();
      for (const barbershop of barbershops) {
        if (!barbershop.slug) {
          barbershop.slug = await generateUniqueSlug(barbershop.name, async (candidate) =>
            batch.has(candidate) ||
            Boolean(await Barbershop.count({ where: { slug: candidate }, transaction: options.transaction }))
          );
        }
        batch.add(barbershop.slug);
      }
    },
  },
});

module.exports = Barbershop;
