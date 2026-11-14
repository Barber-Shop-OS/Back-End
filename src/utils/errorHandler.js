// BE-37 / SEC-11: erros padronizados. Toda resposta de erro é { message, code, details? }.
// Só mensagens de AppError chegam ao cliente; qualquer outro erro vira 500 genérico (sem vazar SQL/stack).
const CODES = require('../shared/errorCodes');

const DEFAULT_CODE_BY_STATUS = {
	400: CODES.VALIDATION_ERROR,
	401: CODES.UNAUTHORIZED,
	402: CODES.PLAN_LIMIT_REACHED,
	403: CODES.FORBIDDEN,
	404: CODES.NOT_FOUND,
	409: CODES.CONFLICT,
	413: CODES.PAYLOAD_TOO_LARGE,
	429: CODES.RATE_LIMITED,
	500: CODES.INTERNAL,
};

class AppError extends Error {
	constructor(message, statusCode = 500, code, details) {
		super(message);
		this.statusCode = statusCode;
		this.code = code || DEFAULT_CODE_BY_STATUS[statusCode] || CODES.INTERNAL;
		if (details !== undefined) this.details = details;
		this.isAppError = true;
	}
}

class ValidationError extends AppError {
	constructor(message, details, code = CODES.VALIDATION_ERROR) {
		super(message, 400, code, details);
	}
}

class NotFoundError extends AppError {
	constructor(message = 'Recurso não encontrado', code = CODES.NOT_FOUND) {
		super(message, 404, code);
	}
}

class UnauthorizedError extends AppError {
	constructor(message = 'Não autorizado', code = CODES.UNAUTHORIZED) {
		super(message, 401, code);
	}
}

class ForbiddenError extends AppError {
	constructor(message = 'Acesso negado', code = CODES.FORBIDDEN) {
		super(message, 403, code);
	}
}

class ConflictError extends AppError {
	constructor(message, code = CODES.CONFLICT, details) {
		super(message, 409, code, details);
	}
}

const GENERIC_INTERNAL_MESSAGE = 'Erro interno do servidor';

/**
 * Converte qualquer erro em { status, body } seguro para o cliente.
 * Erros conhecidos de bibliotecas (JSON inválido, Sequelize) ganham status e mensagem próprios.
 */
const toErrorResponse = (err) => {
	if (err && err.isAppError) {
		const body = { message: err.message, code: err.code };
		if (err.details !== undefined) body.details = err.details;
		return { status: err.statusCode, body };
	}

	// body-parser / express.json
	if (err && err.type === 'entity.parse.failed') {
		return { status: 400, body: { message: 'JSON inválido no corpo da requisição', code: CODES.INVALID_JSON } };
	}
	if (err && err.type === 'entity.too.large') {
		return { status: 413, body: { message: 'Corpo da requisição muito grande', code: CODES.PAYLOAD_TOO_LARGE } };
	}

	// Sequelize: nunca repassar err.message (contém nomes de tabela/coluna e SQL).
	const name = err && err.name;
	if (name === 'SequelizeUniqueConstraintError') {
		return { status: 409, body: { message: 'Registro duplicado', code: CODES.CONFLICT } };
	}
	if (name === 'SequelizeForeignKeyConstraintError') {
		return {
			status: 409,
			body: { message: 'Operação conflita com registros relacionados', code: CODES.CONFLICT },
		};
	}
	if (name === 'SequelizeValidationError') {
		return { status: 400, body: { message: 'Dados inválidos', code: CODES.VALIDATION_ERROR } };
	}

	return { status: 500, body: { message: GENERIC_INTERNAL_MESSAGE, code: CODES.INTERNAL } };
};

const handleErrorResponse = (res, err) => {
	const { status, body } = toErrorResponse(err);
	return res.status(status).json(body);
};

module.exports = {
	AppError,
	ValidationError,
	NotFoundError,
	UnauthorizedError,
	ForbiddenError,
	ConflictError,
	toErrorResponse,
	handleErrorResponse,
	GENERIC_INTERNAL_MESSAGE,
	CODES,
};
