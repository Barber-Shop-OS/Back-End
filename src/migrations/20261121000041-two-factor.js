'use strict';

// SEC-27: 2FA (TOTP) — obrigatório para admin, opcional para os demais.
// totp_secret/totp_pending_secret cifrados (AES-256-GCM); códigos de recuperação como hashes SHA-256 (JSON);
// totp_last_step impede reutilizar o mesmo código.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'totp_secret', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addColumn('users', 'totp_pending_secret', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addColumn('users', 'totp_enabled_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('users', 'totp_recovery_codes', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn('users', 'totp_last_step', { type: Sequelize.BIGINT, allowNull: true });
  },
  down: async (queryInterface) => {
    for (const column of ['totp_last_step', 'totp_recovery_codes', 'totp_enabled_at', 'totp_pending_secret', 'totp_secret']) {
      await queryInterface.removeColumn('users', column);
    }
  },
};
