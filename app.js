// Sprint 0.0: Express app setup with proper middleware and error handling
const express = require("express");
const cors = require("cors");
const config = require("./src/config/config");
const indexRoutes = require("./src/routes/indexRoutes");
const sequelize = require("./src/config/sequelize");
const { NotFoundError } = require("./src/utils/errorHandler");

require("./src/models/index");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(indexRoutes);

// 404 handler for non-existent routes
app.use((req, res, next) => next(new NotFoundError('Rota não encontrada')));

// Global error handler (must be last)
const errorMiddleware = require('./src/middlewares/errorMiddleware');
app.use(errorMiddleware);

// Database connection (removed sync - use migrations in production)
// In development, you can enable this for rapid prototyping:
// sequelize.sync({ force: false }).then(() => {
//   console.log("Database & tabelas criadas!");
// });

app.set("port", config.port);

module.exports = app;
