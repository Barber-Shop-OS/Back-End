// Sprint 0: Dynamic role-based access control middleware
const User = require('../models/user');
const { ForbiddenError, UnauthorizedError } = require('../utils/errorHandler');

// Factory function: returns middleware that checks if user has one of the allowed roles
const roleMiddleware = (allowedRoles = []) => {
	return async (req, res, next) => {
		try {
			const tokenUser = req.user;

			// Ensure user is authenticated
			if (!tokenUser) {
				return next(new UnauthorizedError('Usuário não autenticado'));
			}

			// Fetch user from database to get current role
			const userExists = await User.findByPk(tokenUser.id, {
				attributes: ['id', 'role'],
			});

			if (!userExists) {
				return next(new UnauthorizedError('Usuário não encontrado'));
			}

			// Check if user's role is in the allowed list
			if (!allowedRoles.includes(userExists.role)) {
				return next(new ForbiddenError(`Acesso restrito. Permissão necessária: ${allowedRoles.join(', ')}`));
			}

			// Update req.user with fresh role from DB
			req.user.role = userExists.role;
			next();
		} catch (error) {
			return next(error);
		}
	};
};

// Legacy export for backward compatibility
const verificaAdm = roleMiddleware(['admin']);

module.exports = roleMiddleware;
module.exports.verificaAdm = verificaAdm;