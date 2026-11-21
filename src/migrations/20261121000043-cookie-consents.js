'use strict';

// BE-58 (LGPD art. 8º §2º): registro das escolhas do banner de cookies — prova de que o consentimento
// (ou a recusa/revogação) foi dado, em qual versão da política e quando. Só inserção, nunca atualização.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('cookie_consents', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      // Identificador aleatório gerado no navegador (não é dado pessoal por si só).
      consent_id: { type: Sequelize.STRING(36), allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      policy_version: { type: Sequelize.STRING(20), allowNull: false },
      analytics: { type: Sequelize.BOOLEAN, allowNull: false },
      marketing: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      // accept_all | reject_all | custom | withdraw
      action: { type: Sequelize.STRING(20), allowNull: false },
      // HMAC do IP (minimização: o IP em si não é guardado).
      ip_hash: { type: Sequelize.STRING(64), allowNull: true },
      user_agent: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('cookie_consents', ['consent_id', 'created_at'], { name: 'cookie_consents_consent_created_idx' });
    await queryInterface.addIndex('cookie_consents', ['user_id'], { name: 'cookie_consents_user_idx' });
    await queryInterface.addIndex('cookie_consents', ['created_at'], { name: 'cookie_consents_created_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('cookie_consents', {});
  },
};
