'use strict';

// BE-18: perfil público da barbearia (slug, contato, imagens, status).
// Barbearias existentes recebem slug gerado do nome (único).
const { generateUniqueSlug } = require('../shared/slug');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const add = (column, definition) => queryInterface.addColumn('barbershops', column, definition);
    await add('slug', { type: Sequelize.STRING(60), allowNull: true });
    await add('description', { type: Sequelize.STRING(1000), allowNull: true });
    await add('phone', { type: Sequelize.STRING(20), allowNull: true });
    await add('whatsapp', { type: Sequelize.STRING(20), allowNull: true });
    await add('instagram', { type: Sequelize.STRING(60), allowNull: true });
    await add('logo_url', { type: Sequelize.STRING(500), allowNull: true });
    await add('cover_url', { type: Sequelize.STRING(500), allowNull: true });
    await add('status', {
      type: Sequelize.ENUM('active', 'suspended', 'deleted'),
      allowNull: false,
      defaultValue: 'active',
    });

    const rows = await queryInterface.sequelize.query('SELECT id, name FROM barbershops ORDER BY id', {
      type: queryInterface.sequelize.QueryTypes.SELECT,
    });
    const used = new Set();
    for (const row of rows) {
      const slug = await generateUniqueSlug(row.name, async (candidate) => used.has(candidate));
      used.add(slug);
      await queryInterface.sequelize.query('UPDATE barbershops SET slug = :slug WHERE id = :id', {
        replacements: { slug, id: row.id },
      });
    }

    await queryInterface.changeColumn('barbershops', 'slug', { type: Sequelize.STRING(60), allowNull: false });
    await queryInterface.addIndex('barbershops', ['slug'], { name: 'barbershops_slug_unique', unique: true });
    // SQLite perde índices no changeColumn: garante o de BE-08.
    const names = new Set((await queryInterface.showIndex('barbershops')).map((index) => index.name));
    if (!names.has('barbershops_owner_idx')) {
      await queryInterface.addIndex('barbershops', ['owner_id'], { name: 'barbershops_owner_idx' });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('barbershops', 'barbershops_slug_unique');
    for (const column of ['status', 'cover_url', 'logo_url', 'instagram', 'whatsapp', 'phone', 'description', 'slug']) {
      await queryInterface.removeColumn('barbershops', column);
    }
  },
};
