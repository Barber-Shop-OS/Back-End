'use strict';
const { setEnumValues } = require('../shared/migrationEnum');

// BE-07: pagamento presencial completo — método CARD (maquininha), quem registrou, filial e barbearia
// desnormalizadas (listagem/financeiro sem join) e índice para o relatório por período.
// No SQLite changeColumn recria a tabela sem os índices: garante o único de BE-08 de novo.
const ensureIndexes = async (queryInterface, withNew) => {
  const names = new Set((await queryInterface.showIndex('payments')).map((index) => index.name));
  if (!names.has('payments_appointment_unique')) {
    await queryInterface.addIndex('payments', ['appointment_id'], { name: 'payments_appointment_unique', unique: true });
  }
  if (withNew && !names.has('payments_barbershop_created_idx')) {
    await queryInterface.addIndex('payments', ['barbershop_id', 'created_at'], { name: 'payments_barbershop_created_idx' });
  }
  if (withNew && !names.has('payments_branch_created_idx')) {
    await queryInterface.addIndex('payments', ['branch_id', 'created_at'], { name: 'payments_branch_created_idx' });
  }
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await setEnumValues(queryInterface, 'payments', 'method', ['PIX', 'CASH', 'CARD']);
    await queryInterface.addColumn('payments', 'recorded_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('payments', 'branch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'branches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('payments', 'barbershop_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'barbershops', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('payments', 'updated_at', { type: Sequelize.DATE, allowNull: true });

    // Preenche as colunas desnormalizadas dos pagamentos já existentes.
    await queryInterface.sequelize.query(
      'UPDATE payments SET branch_id = (SELECT a.branch_id FROM appointments a WHERE a.id = payments.appointment_id)'
    );
    await queryInterface.sequelize.query(
      'UPDATE payments SET barbershop_id = (SELECT b.barbershop_id FROM branches b WHERE b.id = payments.branch_id)'
    );
    await ensureIndexes(queryInterface, true);
  },

  down: async (queryInterface) => {
    const names = new Set((await queryInterface.showIndex('payments')).map((index) => index.name));
    for (const name of ['payments_barbershop_created_idx', 'payments_branch_created_idx']) {
      if (names.has(name)) await queryInterface.removeIndex('payments', name);
    }
    await queryInterface.removeColumn('payments', 'updated_at');
    await queryInterface.removeColumn('payments', 'barbershop_id');
    await queryInterface.removeColumn('payments', 'branch_id');
    await queryInterface.removeColumn('payments', 'recorded_by');
    await queryInterface.sequelize.query("UPDATE payments SET method = 'PIX' WHERE method = 'CARD'");
    await setEnumValues(queryInterface, 'payments', 'method', ['PIX', 'CASH']);
    await ensureIndexes(queryInterface, false);
  },
};
