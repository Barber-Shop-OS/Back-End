'use strict';

// BE-28: login com Google. users.password passa a aceitar NULL (conta só-Google) e cada provedor
// externo vinculado fica em user_identities (provider + provider_user_id único).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('users', 'password', { type: Sequelize.STRING, allowNull: true });
    // No SQLite o changeColumn recria a tabela: garante o único de e-mail.
    const indexes = await queryInterface.showIndex('users');
    const emailUnique = indexes.some((index) => index.unique && index.fields.some((field) => field.attribute === 'email'));
    if (!emailUnique) await queryInterface.addIndex('users', ['email'], { name: 'users_email_unique', unique: true });

    await queryInterface.createTable('user_identities', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.STRING(30), allowNull: false },
      provider_user_id: { type: Sequelize.STRING(255), allowNull: false },
      email: { type: Sequelize.STRING(254), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('user_identities', ['provider', 'provider_user_id'], { name: 'user_identities_provider_unique', unique: true });
    await queryInterface.addIndex('user_identities', ['user_id'], { name: 'user_identities_user_idx' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('user_identities', {});
    // Contas só-Google não cabem no schema antigo: recebem uma senha inutilizável (hash aleatório).
    await queryInterface.sequelize.query("UPDATE users SET password = '!google-only' WHERE password IS NULL");
    await queryInterface.changeColumn('users', 'password', { type: Sequelize.STRING, allowNull: false });
  },
};
