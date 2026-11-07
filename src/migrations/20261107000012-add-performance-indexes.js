'use strict';

// BE-08: índices para as consultas de agenda, escopo por tenant e pagamentos.
// Idempotente: só cria o índice se ainda não existir um com o mesmo nome.
const INDEXES = [
  { table: 'appointments', fields: ['barber_id', 'appointment_date'], name: 'appointments_barber_date_idx' },
  { table: 'appointments', fields: ['branch_id', 'appointment_date'], name: 'appointments_branch_date_idx' },
  { table: 'appointments', fields: ['user_id'], name: 'appointments_user_idx' },
  { table: 'barbers', fields: ['branch_id'], name: 'barbers_branch_idx' },
  { table: 'barbers', fields: ['user_id'], name: 'barbers_user_idx' },
  { table: 'branches', fields: ['barbershop_id'], name: 'branches_barbershop_idx' },
  { table: 'barbershops', fields: ['owner_id'], name: 'barbershops_owner_idx' },
  { table: 'services', fields: ['barbershop_id'], name: 'services_barbershop_idx' },
  // Um pagamento por agendamento (regra já aplicada no service; agora garantida no banco).
  { table: 'payments', fields: ['appointment_id'], name: 'payments_appointment_unique', unique: true },
];

const existingIndexNames = async (queryInterface, table) => {
  const indexes = await queryInterface.showIndex(table);
  return new Set(indexes.map((index) => index.name));
};

module.exports = {
  up: async (queryInterface) => {
    for (const { table, fields, name, unique } of INDEXES) {
      const names = await existingIndexNames(queryInterface, table);
      if (!names.has(name)) {
        await queryInterface.addIndex(table, fields, { name, unique: Boolean(unique) });
      }
    }
  },

  down: async (queryInterface) => {
    for (const { table, name } of [...INDEXES].reverse()) {
      const names = await existingIndexNames(queryInterface, table);
      if (names.has(name)) {
        await queryInterface.removeIndex(table, name);
      }
    }
  },
};
