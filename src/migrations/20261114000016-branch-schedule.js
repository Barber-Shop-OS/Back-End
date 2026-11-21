'use strict';

// BE-10: horário de funcionamento (vários intervalos por dia) e fechamentos da filial,
// mais fuso, telefones e flag de ativa em branches.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('branches', 'timezone', {
      type: Sequelize.STRING(64),
      allowNull: false,
      defaultValue: 'America/Sao_Paulo',
    });
    await queryInterface.addColumn('branches', 'phone', { type: Sequelize.STRING(20), allowNull: true });
    await queryInterface.addColumn('branches', 'whatsapp', { type: Sequelize.STRING(20), allowNull: true });
    await queryInterface.addColumn('branches', 'active', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true });

    await queryInterface.createTable('branch_opening_hours', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      branch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      weekday: { type: Sequelize.SMALLINT, allowNull: false },
      opens_at: { type: Sequelize.TIME, allowNull: false },
      closes_at: { type: Sequelize.TIME, allowNull: false },
    });
    await queryInterface.addIndex('branch_opening_hours', ['branch_id', 'weekday'], {
      name: 'branch_opening_hours_branch_weekday_idx',
    });

    await queryInterface.createTable('branch_closures', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      branch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      reason: { type: Sequelize.STRING(255), allowNull: true },
      all_day: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      start_time: { type: Sequelize.TIME, allowNull: true },
      end_time: { type: Sequelize.TIME, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('branch_closures', ['branch_id', 'date'], { name: 'branch_closures_branch_date_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('branch_closures', {});
    await queryInterface.dropTable('branch_opening_hours', {});
    await queryInterface.removeColumn('branches', 'active');
    await queryInterface.removeColumn('branches', 'whatsapp');
    await queryInterface.removeColumn('branches', 'phone');
    await queryInterface.removeColumn('branches', 'timezone');
  },
};
