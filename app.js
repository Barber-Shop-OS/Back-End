// Sprint 4: Express app with security hardening, request logging, rate limiting, and Swagger docs.
const express = require("express");
const cors = require("cors");
const helmet = require('helmet');
const config = require("./src/config/config");
const indexRoutes = require("./src/routes/indexRoutes");
const { NotFoundError } = require("./src/utils/errorHandler");
const logger = require('./src/utils/logger');
const requestLoggerMiddleware = require('./src/middlewares/requestLoggerMiddleware');
const { apiLimiter } = require('./src/middlewares/rateLimitMiddleware');
const { swaggerUi, specs } = require('./src/config/swagger');

require("./src/models/index");
const app = express();

// Middleware
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
app.use(cors());
app.use(requestLoggerMiddleware);
app.use(apiLimiter);
app.use(express.json());

if (process.env.NODE_ENV !== 'production') {
	app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));
	logger.info('Swagger disponível em http://localhost:3000/api/docs');
}

// Routes
app.use(indexRoutes);

// 404 handler for non-existent routes
app.use((req, res, next) => next(new NotFoundError('Rota não encontrada')));

// Global error handler (must be last)
const errorMiddleware = require('./src/middlewares/errorMiddleware');
app.use(errorMiddleware);

app.set("port", config.port);

module.exports = app;
