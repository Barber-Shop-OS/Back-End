// Sprint 0: JWT authentication middleware with proper error handling
const jwt = require("jsonwebtoken");
const { UnauthorizedError } = require("../utils/errorHandler");
require("dotenv").config();

// Middleware to verify JWT token and attach user to request
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization");

  // Check if token is provided
  if (!token) {
    return next(new UnauthorizedError('Token não fornecido'));
  }

  // Verify and decode JWT
  try {
    const verified = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    return next(new UnauthorizedError('Token inválido ou expirado'));
  }
};

module.exports = authMiddleware;
