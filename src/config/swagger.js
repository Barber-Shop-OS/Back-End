// Builds and exports Swagger UI plus OpenAPI spec for all module route files.
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'BarberOS API',
      version: '1.0.0',
      description: 'API REST para gestão de barbearias - SaaS multi-barbearia',
      contact: {
        name: 'BarberOS Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Desenvolvimento local',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/modules/**/*.js'],
};

const specs = swaggerJsdoc(options);

module.exports = {
  swaggerUi,
  specs,
};