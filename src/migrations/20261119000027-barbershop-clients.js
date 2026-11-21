'use strict';

// BE-23: clientes da barbearia (CRM) e "cliente rápido" sem conta (agendamento de balcão).
// - barbershop_clients: um registro por pessoa por barbearia; user_id preenchido quando há conta.
// - appointments.client_id → barbershop_clients; appointments.user_id passa a aceitar NULL
//   (agendamento de cliente rápido não tem usuário).
// Dados existentes: cria um cliente por (barbearia, usuário) que já agendou e vincula os agendamentos.
const APPOINTMENT_INDEXES = [
  { fields: ['barber_id', 'start_at'], name: 'appointments_barber_start_idx' },
  { fields: ['branch_id', 'start_at'], name: 'appointments_branch_start_idx' },
  { fields: ['user_id'], name: 'appointments_user_idx' },
];

// No SQLite changeColumn recria a tabela sem os índices: recria os que faltarem.
const ensureAppointmentIndexes = async (queryInterface, extra = []) => {
  const names = new Set((await queryInterface.showIndex('appointments')).map((index) => index.name));
  for (const { fields, name } of [...APPOINTMENT_INDEXES, ...extra]) {
    if (!names.has(name)) await queryInterface.addIndex('appointments', fields, { name });
  }
};

// Sem `references`: no MySQL o MODIFY mantém a FK existente (repetir criaria uma segunda FK).
const userIdColumn = (Sequelize, allowNull) => ({ type: Sequelize.INTEGER, allowNull });

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('barbershop_clients', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      barbershop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'barbershops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      name: { type: Sequelize.STRING(120), allowNull: false },
      phone: { type: Sequelize.STRING(20), allowNull: true },
      email: { type: Sequelize.STRING(254), allowNull: true },
      notes: { type: Sequelize.STRING(1000), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('barbershop_clients', ['barbershop_id', 'user_id'], {
      name: 'barbershop_clients_shop_user_unique',
      unique: true,
    });
    await queryInterface.addIndex('barbershop_clients', ['barbershop_id', 'phone'], { name: 'barbershop_clients_shop_phone_idx' });
    await queryInterface.addIndex('barbershop_clients', ['barbershop_id', 'email'], { name: 'barbershop_clients_shop_email_idx' });
    await queryInterface.addIndex('barbershop_clients', ['barbershop_id', 'name'], { name: 'barbershop_clients_shop_name_idx' });

    await queryInterface.addColumn('appointments', 'client_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'barbershop_clients', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.changeColumn('appointments', 'user_id', userIdColumn(Sequelize, true));
    await ensureAppointmentIndexes(queryInterface, [{ fields: ['client_id'], name: 'appointments_client_idx' }]);

    // Backfill: um cliente por (barbearia, usuário) com agendamento.
    await queryInterface.sequelize.query(`
      INSERT INTO barbershop_clients (barbershop_id, user_id, name, phone, email, created_at, updated_at)
      SELECT DISTINCT b.barbershop_id, u.id, u.name, u.phone, u.email, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM appointments a
      JOIN branches b ON b.id = a.branch_id
      JOIN users u ON u.id = a.user_id
    `);
    await queryInterface.sequelize.query(`
      UPDATE appointments SET client_id = (
        SELECT c.id FROM barbershop_clients c
        JOIN branches b ON b.barbershop_id = c.barbershop_id
        WHERE b.id = appointments.branch_id AND c.user_id = appointments.user_id
      )
      WHERE user_id IS NOT NULL
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Agendamentos de cliente rápido não têm usuário: não cabem no schema antigo.
    await queryInterface.sequelize.query('DELETE FROM appointments WHERE user_id IS NULL');
    const names = new Set((await queryInterface.showIndex('appointments')).map((index) => index.name));
    if (names.has('appointments_client_idx')) await queryInterface.removeIndex('appointments', 'appointments_client_idx');
    await queryInterface.removeColumn('appointments', 'client_id');
    await queryInterface.changeColumn('appointments', 'user_id', userIdColumn(Sequelize, false));
    await ensureAppointmentIndexes(queryInterface);
    await queryInterface.dropTable('barbershop_clients', {});
  },
};
