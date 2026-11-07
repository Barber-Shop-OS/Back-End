const { Op } = require('sequelize');
const { parsePagination, escapeLike, likeContains } = require('../../../shared/query');

describe('parsePagination', () => {
  it('usa padrões quando ausente', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 10, offset: 0, limit: 10 });
  });

  it('limita pageSize a 100', () => {
    expect(parsePagination({ page: 3, pageSize: 5000 })).toEqual({ page: 3, pageSize: 100, offset: 200, limit: 100 });
  });

  it.each([[{ page: -1, pageSize: 0 }], [{ page: 'x', pageSize: 'y' }], [{ page: 1.5, pageSize: 2.5 }]])(
    'valores inválidos caem no padrão (%p)',
    (query) => {
      expect(parsePagination(query)).toMatchObject({ page: 1, pageSize: 10 });
    }
  );
});

describe('escapeLike / likeContains', () => {
  it('escapa curingas e barra invertida', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('monta LIKE %termo% escapado', () => {
    expect(likeContains('a%b')).toEqual({ [Op.like]: '%a\\%b%' });
  });

  it('corta termos com mais de 100 caracteres', () => {
    const value = likeContains('x'.repeat(500))[Op.like];
    expect(value.length).toBe(102);
  });
});
