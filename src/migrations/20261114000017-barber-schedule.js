'use strict';

// BE-11: jornada semanal do barbeiro (horário local da filial) e bloqueios (UTC).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('barber_working_hours', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      barber_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'barbers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      weekday: { type: Sequelize.TINYINT, allowNull: false },
      start_time: { type: Sequelize.TIME, allowNull: false },
      end_time: { type: Sequelize.TIME, allowNull: false },
    });
    await queryInterface.addIndex('barber_working_hours', ['barber_id', 'weekday'], {
      name: 'barber_working_hours_barber_weekday_idx',
    });

    await queryInterface.createTable('barber_time_off', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      barber_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'barbers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      start_at: { type: Sequelize.DATE, allowNull: false },
      end_at: { type: Sequelize.DATE, allowNull: false },
      reason: { type: Sequelize.STRING(255), allowNull: true },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('barber_time_off', ['barber_id', 'start_at'], { name: 'barber_time_off_barber_start_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('barber_time_off');
    await queryInterface.dropTable('barber_working_hours');
  },
};
