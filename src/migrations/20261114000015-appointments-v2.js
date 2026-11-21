'use strict';
const { setEnumValues } = require('../shared/migrationEnum');

// BE-12: agendamento v2 — intervalo [start_at, end_at) em UTC, snapshots de preço/nome/duração,
// status completos, dados de cancelamento, origem e updated_at.
// Dados existentes: start_at = appointment_date, end_at = start_at + duração do serviço,
// snapshots copiados do serviço e `pendente` → `confirmado`.
const NEW_STATUS = ['confirmado', 'concluido', 'cancelado', 'nao_compareceu'];
const OLD_STATUS = ['pendente', 'confirmado', 'cancelado'];
const TRANSITION_STATUS = [...new Set([...OLD_STATUS, ...NEW_STATUS])];

const indexNames = async (queryInterface) =>
  new Set((await queryInterface.showIndex('appointments')).map((index) => index.name));

const addIndexIfMissing = async (queryInterface, fields, name) => {
  if (!(await indexNames(queryInterface)).has(name)) {
    await queryInterface.addIndex('appointments', fields, { name });
  }
};

const removeIndexIfExists = async (queryInterface, name) => {
  if ((await indexNames(queryInterface)).has(name)) {
    await queryInterface.removeIndex('appointments', name);
  }
};

// SQLite devolve DATETIME como "2026-03-10 13:00:00.000 +00:00", que o Date do V8 não entende.
const parseDbDate = (value) => {
  if (value instanceof Date) return value;
  const iso = String(value).trim().replace(' ', 'T').replace(/\s*([+-]\d\d:?\d\d)$/, '$1');
  const date = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida no banco: ${value}`);
  return date;
};

// Data → texto UTC no formato que cada dialeto grava (o escape padrão usaria o fuso local).
const toDbDate = (queryInterface, date) => {
  const text = date.toISOString().replace('T', ' ').replace('Z', '');
  return queryInterface.sequelize.getDialect() === 'sqlite' ? `${text} +00:00` : text;
};

// UPDATE parametrizado: o bulkUpdate sem model grava Date como "[object Object]" no SQLite.
const updateRow = (queryInterface, id, values) => {
  const columns = Object.keys(values);
  const replacements = Object.fromEntries(
    columns.map((column) => [column, values[column] instanceof Date ? toDbDate(queryInterface, values[column]) : values[column]])
  );
  return queryInterface.sequelize.query(
    `UPDATE appointments SET ${columns.map((column) => `${column} = :${column}`).join(', ')} WHERE id = :id`,
    { replacements: { ...replacements, id } }
  );
};

const rows = (queryInterface, sql) =>
  queryInterface.sequelize.query(sql, { type: queryInterface.sequelize.QueryTypes.SELECT });

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const add = (column, definition) => queryInterface.addColumn('appointments', column, definition);

    await add('start_at', { type: Sequelize.DATE, allowNull: true });
    await add('end_at', { type: Sequelize.DATE, allowNull: true });
    await add('duration_min', { type: Sequelize.INTEGER, allowNull: true });
    await add('price_snapshot', { type: Sequelize.DECIMAL(10, 2), allowNull: true });
    await add('service_name_snapshot', { type: Sequelize.STRING(255), allowNull: true });
    await add('notes', { type: Sequelize.STRING(500), allowNull: true });
    await add('cancelled_at', { type: Sequelize.DATE, allowNull: true });
    await add('cancelled_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await add('cancel_reason', { type: Sequelize.STRING(255), allowNull: true });
    await add('source', { type: Sequelize.ENUM('web', 'mobile', 'balcao'), allowNull: false, defaultValue: 'web' });
    await add('updated_at', { type: Sequelize.DATE, allowNull: true });

    // Status: primeiro um ENUM com a união dos valores, migra os dados, depois o ENUM final.
    await setEnumValues(queryInterface, 'appointments', 'status', TRANSITION_STATUS);
    await queryInterface.sequelize.query("UPDATE appointments SET status = 'confirmado' WHERE status = 'pendente'");
    await setEnumValues(queryInterface, 'appointments', 'status', NEW_STATUS, { defaultValue: 'confirmado' });

    const existing = await rows(
      queryInterface,
      `SELECT a.id, a.appointment_date, a.created_at, s.duration, s.price, s.name
         FROM appointments a LEFT JOIN services s ON s.id = a.service_id`
    );
    for (const row of existing) {
      const start = parseDbDate(row.appointment_date);
      const duration = Number(row.duration) || 30;
      await updateRow(
        queryInterface,
        row.id,
        {
          start_at: start,
          end_at: new Date(start.getTime() + duration * 60000),
          duration_min: duration,
          price_snapshot: row.price === null || row.price === undefined ? 0 : Number(row.price).toFixed(2),
          service_name_snapshot: row.name || 'Serviço',
          updated_at: row.created_at ? parseDbDate(row.created_at) : new Date(),
        }
      );
    }

    for (const column of ['start_at', 'end_at']) {
      await queryInterface.changeColumn('appointments', column, { type: Sequelize.DATE, allowNull: false });
    }
    await queryInterface.changeColumn('appointments', 'duration_min', { type: Sequelize.INTEGER, allowNull: false });
    await queryInterface.changeColumn('appointments', 'price_snapshot', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn('appointments', 'service_name_snapshot', {
      type: Sequelize.STRING(255),
      allowNull: false,
    });

    // Índices novos antes de remover os antigos: no MySQL eles passam a servir as FKs.
    await addIndexIfMissing(queryInterface, ['barber_id', 'start_at'], 'appointments_barber_start_idx');
    await addIndexIfMissing(queryInterface, ['branch_id', 'start_at'], 'appointments_branch_start_idx');
    await removeIndexIfExists(queryInterface, 'appointments_barber_date_idx');
    await removeIndexIfExists(queryInterface, 'appointments_branch_date_idx');
    await queryInterface.removeColumn('appointments', 'appointment_date');
    // No SQLite changeColumn/removeColumn recriam a tabela sem os índices: garante todos no fim.
    await addIndexIfMissing(queryInterface, ['barber_id', 'start_at'], 'appointments_barber_start_idx');
    await addIndexIfMissing(queryInterface, ['branch_id', 'start_at'], 'appointments_branch_start_idx');
    await addIndexIfMissing(queryInterface, ['user_id'], 'appointments_user_idx');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('appointments', 'appointment_date', { type: Sequelize.DATE, allowNull: true });
    const existing = await rows(queryInterface, 'SELECT id, start_at FROM appointments');
    for (const row of existing) {
      await updateRow(queryInterface, row.id, { appointment_date: parseDbDate(row.start_at) });
    }
    await queryInterface.changeColumn('appointments', 'appointment_date', { type: Sequelize.DATE, allowNull: false });

    await addIndexIfMissing(queryInterface, ['barber_id', 'appointment_date'], 'appointments_barber_date_idx');
    await addIndexIfMissing(queryInterface, ['branch_id', 'appointment_date'], 'appointments_branch_date_idx');
    await removeIndexIfExists(queryInterface, 'appointments_barber_start_idx');
    await removeIndexIfExists(queryInterface, 'appointments_branch_start_idx');

    await setEnumValues(queryInterface, 'appointments', 'status', TRANSITION_STATUS);
    // O schema antigo não tem concluído/falta: concluído volta como confirmado; falta como cancelado.
    await queryInterface.sequelize.query("UPDATE appointments SET status = 'confirmado' WHERE status = 'concluido'");
    await queryInterface.sequelize.query("UPDATE appointments SET status = 'cancelado' WHERE status = 'nao_compareceu'");
    await setEnumValues(queryInterface, 'appointments', 'status', OLD_STATUS);

    // MySQL não remove coluna com FK: tira a constraint de cancelled_by antes.
    const references = await queryInterface.getForeignKeyReferencesForTable('appointments');
    for (const reference of references.filter((ref) => ref.columnName === 'cancelled_by' && ref.constraintName)) {
      await queryInterface.removeConstraint('appointments', reference.constraintName);
    }

    for (const column of [
      'updated_at',
      'source',
      'cancel_reason',
      'cancelled_by',
      'cancelled_at',
      'notes',
      'service_name_snapshot',
      'price_snapshot',
      'duration_min',
      'end_at',
      'start_at',
    ]) {
      await queryInterface.removeColumn('appointments', column);
    }
    await addIndexIfMissing(queryInterface, ['barber_id', 'appointment_date'], 'appointments_barber_date_idx');
    await addIndexIfMissing(queryInterface, ['branch_id', 'appointment_date'], 'appointments_branch_date_idx');
    await addIndexIfMissing(queryInterface, ['user_id'], 'appointments_user_idx');
  },
};
