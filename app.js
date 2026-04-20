const express = require("express");
const cors = require("cors");
const config = require("./src/config/config");
const indexRoutes = require("./src/routes/indexRoutes");
const sequelize = require("./src/config/sequelize");
const { NotFoundError } = require("./src/utils/errorHandler"); // ADD

require("./src/models/index");
const app = express();

app.use(cors());
app.use(express.json());
app.use(indexRoutes);

// ADD: 404 para rotas inexistentes
app.use((req, res, next) => next(new NotFoundError('Rota não encontrada')));

const errorMiddleware = require('./src/middlewares/errorMiddleware');
app.use(errorMiddleware);

sequelize.sync({ force: false }).then(() => {
  console.log("Database & tabelas criadas!");
});

app.set("port", config.port);

module.exports = app;
