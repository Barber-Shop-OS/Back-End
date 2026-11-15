// Builds and exports Swagger UI plus OpenAPI spec for all module route files.
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BarberOS API',
      version: '1.0.0',
      description: 'API REST para gestão de barbearias - SaaS multi-barbearia com suporte a múltiplas filiais, agendamentos, pagamentos e gestão de barbeiros.',
      termsOfService: 'http://swagger.io/terms/',
      contact: {
        name: 'BarberOS Team',
        email: 'support@barberos.com',
        url: 'https://barberos.com',
      },
      license: {
        name: 'ISC',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Desenvolvimento local',
        variables: {
          protocol: {
            default: 'http',
          },
          hostname: {
            default: 'localhost:3000',
          },
        },
      },
      {
        url: 'https://api.barberos.com',
        description: 'Servidor de produção',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token para autenticação',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Mensagem de erro',
            },
            code: {
              type: 'string',
              description: 'Código de erro',
            },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
            },
            page: {
              type: 'integer',
              example: 1,
            },
            pageSize: {
              type: 'integer',
              example: 10,
            },
            total: {
              type: 'integer',
              example: 0,
            },
            totalPages: {
              type: 'integer',
              example: 0,
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            name: {
              type: 'string',
            },
            email: {
              type: 'string',
              format: 'email',
            },
            role: {
              type: 'string',
              enum: ['cliente', 'barbeiro', 'owner', 'admin'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Barber: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            user_id: {
              type: 'integer',
            },
            branch_id: {
              type: 'integer',
            },
            bio: {
              type: 'string',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Service: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            name: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
            price: {
              type: 'number',
              format: 'float',
            },
            duration: {
              type: 'integer',
              description: 'Duração em minutos',
            },
            barbershop_id: {
              type: 'integer',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Appointment: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            user_id: {
              type: 'integer',
            },
            barber_id: {
              type: 'integer',
            },
            service_id: {
              type: 'integer',
            },
            branch_id: {
              type: 'integer',
            },
            start_at: { type: 'string', format: 'date-time', description: 'Início (UTC)' },
            end_at: { type: 'string', format: 'date-time', description: 'Fim (UTC)' },
            duration_min: { type: 'integer' },
            price_snapshot: { type: 'string', example: '50.00' },
            service_name_snapshot: { type: 'string' },
            notes: { type: 'string', nullable: true },
            source: { type: 'string', enum: ['web', 'mobile', 'balcao'] },
            cancelled_at: { type: 'string', format: 'date-time', nullable: true },
            cancelled_by: { type: 'integer', nullable: true },
            cancel_reason: { type: 'string', nullable: true },
            status: {
              type: 'string',
              enum: ['confirmado', 'concluido', 'cancelado', 'nao_compareceu'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            appointment_id: {
              type: 'integer',
            },
            amount: {
              type: 'number',
              format: 'float',
            },
            method: {
              type: 'string',
              enum: ['PIX', 'CASH'],
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'PAID', 'FAILED'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Barbershop: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            name: {
              type: 'string',
            },
            owner_id: {
              type: 'integer',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Branch: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            name: {
              type: 'string',
            },
            barbershop_id: {
              type: 'integer',
            },
            address_id: {
              type: 'integer',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Address: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            cep: {
              type: 'string',
            },
            number: {
              type: 'integer',
            },
            complement: {
              type: 'string',
            },
            city: {
              type: 'string',
            },
            state: {
              type: 'string',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Auth',
        description: 'Autenticação e autorização de usuários',
      },
      {
        name: 'Billing',
        description: 'Planos e assinatura SaaS',
      },
      {
        name: 'Me',
        description: 'Dados do usuário logado',
      },
      {
        name: 'User',
        description: 'Gestão de usuários',
      },
      {
        name: 'Barber',
        description: 'Gestão de barbeiros',
      },
      {
        name: 'Service',
        description: 'Gestão de serviços',
      },
      {
        name: 'Appointment',
        description: 'Gestão de agendamentos',
      },
      {
        name: 'Availability',
        description: 'Horários livres para agendamento (público)',
      },
      {
        name: 'Payment',
        description: 'Gestão de pagamentos',
      },
      {
        name: 'Barbershop',
        description: 'Gestão de barbearias',
      },
      {
        name: 'Branch',
        description: 'Gestão de filiais',
      },
      {
        name: 'Address',
        description: 'Gestão de endereços',
      },
    ],
  },
  apis: ['./src/modules/**/*.js'],
};

const specs = swaggerJsdoc(options);

module.exports = {
  swaggerUi,
  specs,
};