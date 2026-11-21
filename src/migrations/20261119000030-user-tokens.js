'use strict';

// BE-26 / SEC-26: tokens de uso único da conta (reset de senha; também verificação e troca de
// e-mail — BE-27/BE-29). Só o SHA-256 do token fica no banco.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_tokens', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      purpose: { type: Sequelize.STRING(30), allowNull: false },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      payload: { type: Sequelize.JSON, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('user_tokens', ['user_id', 'purpose'], { name: 'user_tokens_user_purpose_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('user_tokens', {});
  },
};
