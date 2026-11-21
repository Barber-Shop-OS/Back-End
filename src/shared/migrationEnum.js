// Troca o conjunto de valores de uma coluna ENUM de forma portável nas migrations.
// - PostgreSQL: o tipo enum é um objeto separado e o `changeColumn` do Sequelize só ACRESCENTA valores;
//   aqui a coluna vira texto, o tipo é recriado com os valores pedidos e a coluna volta ao enum.
//   Linhas com valores fora da lista falham — migre os dados antes de chamar.
// - MySQL/SQLite: `changeColumn` normal.
const setEnumValues = async (queryInterface, table, column, values, { allowNull = false, defaultValue } = {}) => {
  const { sequelize } = queryInterface;
  if (sequelize.getDialect() !== 'postgres') {
    const { DataTypes } = require('sequelize');
    const definition = { type: DataTypes.ENUM(...values), allowNull };
    if (defaultValue !== undefined) definition.defaultValue = defaultValue;
    return queryInterface.changeColumn(table, column, definition);
  }
  const q = (name) => queryInterface.quoteIdentifier(name);
  const typeName = `enum_${table}_${column}`;
  const list = values.map((value) => sequelize.escape(value)).join(', ');
  await sequelize.query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(column)} DROP DEFAULT`);
  await sequelize.query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(column)} TYPE TEXT`);
  await sequelize.query(`DROP TYPE IF EXISTS ${q(typeName)}`);
  await sequelize.query(`CREATE TYPE ${q(typeName)} AS ENUM (${list})`);
  await sequelize.query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(column)} TYPE ${q(typeName)} USING ${q(column)}::${q(typeName)}`);
  await sequelize.query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(column)} ${allowNull ? 'DROP' : 'SET'} NOT NULL`);
  if (defaultValue !== undefined) {
    await sequelize.query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(column)} SET DEFAULT ${sequelize.escape(defaultValue)}`);
  }
  return undefined;
};

module.exports = { setEnumValues };
