'use strict';

// BE-34 / SEC-22: uploads de imagem emitidos pelo back-end (chave aleatória por tenant) e
// confirmados só depois de conferir tamanho, tipo e magic bytes do objeto.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('uploads', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      barbershop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'barbershops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      kind: { type: Sequelize.STRING(20), allowNull: false },
      target_id: { type: Sequelize.INTEGER, allowNull: false },
      object_key: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      content_type: { type: Sequelize.STRING(30), allowNull: false },
      size: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      created_by: { type: Sequelize.INTEGER, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('uploads', {});
  },
};
