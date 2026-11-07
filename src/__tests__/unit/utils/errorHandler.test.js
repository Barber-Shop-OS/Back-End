const {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  toErrorResponse,
  CODES,
} = require('../../../utils/errorHandler');

describe('toErrorResponse (BE-37 / SEC-11)', () => {
  it.each([
    [new ValidationError('x'), 400, CODES.VALIDATION_ERROR],
    [new UnauthorizedError(), 401, CODES.UNAUTHORIZED],
    [new ForbiddenError(), 403, CODES.FORBIDDEN],
    [new NotFoundError(), 404, CODES.NOT_FOUND],
    [new ConflictError('dup'), 409, CODES.CONFLICT],
    [new AppError('custom', 422), 422, CODES.INTERNAL],
  ])('%p → %i / %s', (error, status, code) => {
    const response = toErrorResponse(error);
    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    expect(response.body.message).toBe(error.message);
  });

  it('código específico sobrepõe o padrão', () => {
    const response = toErrorResponse(new ConflictError('E-mail já está em uso', CODES.EMAIL_IN_USE));
    expect(response.body).toEqual({ message: 'E-mail já está em uso', code: 'EMAIL_IN_USE' });
  });

  it('inclui details quando informado', () => {
    const response = toErrorResponse(new ValidationError('Inválido', [{ field: 'name' }]));
    expect(response.body.details).toEqual([{ field: 'name' }]);
  });

  it('erro desconhecido vira 500 genérico sem vazar a mensagem', () => {
    const response = toErrorResponse(new Error("ER_NO_SUCH_TABLE: Table 'barbershop_db.users' doesn't exist"));
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Erro interno do servidor', code: 'INTERNAL' });
  });

  it('erros do Sequelize não vazam SQL', () => {
    const unique = Object.assign(new Error('Duplicate entry x@y for key users.email'), {
      name: 'SequelizeUniqueConstraintError',
    });
    const fk = Object.assign(new Error('Cannot delete or update a parent row: FOREIGN KEY'), {
      name: 'SequelizeForeignKeyConstraintError',
    });
    const db = Object.assign(new Error('SELECT * FROM users WHERE ...'), { name: 'SequelizeDatabaseError' });

    expect(toErrorResponse(unique)).toEqual({ status: 409, body: { message: 'Registro duplicado', code: 'CONFLICT' } });
    expect(toErrorResponse(fk).status).toBe(409);
    expect(JSON.stringify(toErrorResponse(fk).body)).not.toContain('FOREIGN KEY');
    expect(toErrorResponse(db).status).toBe(500);
    expect(JSON.stringify(toErrorResponse(db).body)).not.toContain('SELECT');
  });

  it('JSON malformado → 400 INVALID_JSON', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' });
    expect(toErrorResponse(error)).toEqual({
      status: 400,
      body: { message: 'JSON inválido no corpo da requisição', code: 'INVALID_JSON' },
    });
  });
});
