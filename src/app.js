// Sprint 4: Express app with security hardening, request logging, rate limiting, and Swagger docs.
const express = require("express");
const cors = require("cors");
const helmet = require('helmet');
const config = require("./config/config");
const indexRoutes = require("./routes/indexRoutes");
const { NotFoundError } = require("./utils/errorHandler");
const logger = require('./utils/logger');
const requestLoggerMiddleware = require('./middlewares/requestLoggerMiddleware');
const { apiLimiter } = require('./middlewares/rateLimitMiddleware');
const { swaggerUi, specs } = require('./config/swagger');

require("./models/index");
const app = express();

// Middleware
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
// SEC-08: só as origens configuradas recebem cabeçalhos CORS. Requisições sem Origin
// (app mobile, curl, servidor-a-servidor) não dependem de CORS e seguem normalmente.
app.use(
	cors({
		origin: (origin, callback) => callback(null, !origin || config.corsOrigins.includes(origin)),
		credentials: true,
	})
);
app.use(requestLoggerMiddleware);
app.use(apiLimiter);
app.use(express.json());

if (!config.isProduction) {
	app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));
	logger.info('Swagger disponível em http://localhost:3000/api/docs');
}

// Health check endpoint for hosting platforms such as Render.
app.get('/', (req, res) => {
	res.status(200).send('OK');
});

// Routes
app.use(indexRoutes);

// 404 handler for non-existent routes
app.use((req, res, next) => next(new NotFoundError('Rota não encontrada')));

// Global error handler (must be last)
const errorMiddleware = require('./middlewares/errorMiddleware');
app.use(errorMiddleware);

app.set("port", config.port);

module.exports = app;
