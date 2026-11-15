// BE-38 / SEC-09: utilitários de consulta seguros para listagens.
const { Op } = require('sequelize');
const { MAX_PAGE_SIZE } = require('./schemas');

const DEFAULT_PAGE_SIZE = 10;

/** page ≥ 1 e 1 ≤ pageSize ≤ 100, mesmo que a validação de query não tenha rodado. */
const parsePagination = (query = {}) => {
  const page = Number.isInteger(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1;
  const requested =
    Number.isInteger(Number(query.pageSize)) && Number(query.pageSize) > 0 ? Number(query.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(requested, MAX_PAGE_SIZE);
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
};

/** Escapa curingas do LIKE (% _ \) para que o termo seja buscado literalmente. */
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (char) => `\\${char}`);

/** Condição `LIKE %termo%` com escape. Termos acima de 100 caracteres são cortados. */
const likeContains = (value) => ({ [Op.like]: `%${escapeLike(String(value).slice(0, 100))}%` });

/**
 * `coluna LIKE %termo% ESCAPE '!'` com escape explícito — igual em MySQL e SQLite (o SQLite não tem
 * caractere de escape padrão). `column` é 'Modelo.coluna' como aparece na consulta.
 */
const likeMatch = (column, value) => {
  const sequelize = require('../config/sequelize');
  const term = String(value).slice(0, 100).replace(/[!%_]/g, (char) => `!${char}`);
  return sequelize.where(sequelize.col(column), Op.like, sequelize.literal(`${sequelize.escape(`%${term}%`)} ESCAPE '!'`));
};

const paginated = (result, { page, pageSize }) => ({
  items: result.rows,
  page,
  pageSize,
  total: result.count,
  totalPages: Math.ceil(result.count / pageSize),
});

module.exports = { parsePagination, escapeLike, likeContains, likeMatch, paginated, DEFAULT_PAGE_SIZE };
