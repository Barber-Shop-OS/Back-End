
// Sprint 0: Error handling with standardized Portuguese messages

class AppError extends Error {
	constructor(message, statusCode = 500) {
		super(message);
		this.statusCode = statusCode;
	}
}

class ValidationError extends AppError {
	constructor(message) {
		super(message, 400);
	}
}

class NotFoundError extends AppError {
	constructor(message) {
		super(message, 404);
	}
}

class UnauthorizedError extends AppError {
	constructor(message = 'Não autorizado') {
		super(message, 401);
	}
}

class ForbiddenError extends AppError {
	constructor(message = 'Acesso negado') {
		super(message, 403);
	}
}

const handleErrorResponse = (res, err) => {
	const status = err.statusCode || 500;
	const message = err.message || 'Erro interno do servidor';
	return res.status(status).json({ message });
};

module.exports = {
	AppError,
	ValidationError,
	NotFoundError,
	UnauthorizedError,
	ForbiddenError,
	handleErrorResponse,
};
