// Transação para operações com lock de linha (agenda — BE-14/15 — e fila de jobs — BE-16).
// MySQL: READ COMMITTED, para que leituras feitas depois de conseguir um FOR UPDATE enxerguem o que
// outra transação acabou de gravar (em REPEATABLE READ o snapshot seria o do início).
// SQLite (só testes) tem uma única conexão e não aceita transações simultâneas: lá elas são
// enfileiradas em processo. No MySQL quem serializa é o FOR UPDATE.
const { Transaction } = require('sequelize');
const sequelize = require('../config/sequelize');

let sqliteQueue = Promise.resolve();

const lockingTransaction = (fn) => {
  if (sequelize.getDialect() === 'mysql') {
    return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, fn);
  }
  const run = sqliteQueue.then(() => sequelize.transaction(fn));
  sqliteQueue = run.catch(() => {});
  return run;
};

module.exports = { lockingTransaction };
