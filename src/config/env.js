// BE-02 / SEC-05: valida as variáveis de ambiente no boot. A aplicação não sobe com configuração insegura.
const Joi = require('joi');
const dotenv = require('dotenv');

dotenv.config();

// Valores de exemplo que nunca podem ser usados como segredo real.
const KNOWN_WEAK_SECRETS = ['your_jwt_secret', '********', 'secret', 'changeme', 'test-secret'];

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),

  JWT_SECRET: Joi.string()
    .min(32)
    .invalid(...KNOWN_WEAK_SECRETS)
    .required()
    .messages({
      'any.required': 'JWT_SECRET é obrigatório',
      'string.min': 'JWT_SECRET deve ter pelo menos 32 caracteres (gere com: openssl rand -base64 48)',
      'any.invalid': 'JWT_SECRET está com um valor de exemplo; gere um segredo aleatório',
    }),
  JWT_EXPIRES_IN: Joi.string().default('8h'),

  DB_HOST: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.optional(), otherwise: Joi.required() }),
  DB_PORT: Joi.number().port().default(3306),
  DB_USER: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.optional(), otherwise: Joi.required() }),
  DB_PASS: Joi.string().allow('').default(''),
  DB_NAME: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.optional(), otherwise: Joi.required() }),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),

  // Lista separada por vírgula. Obrigatória em produção (SEC-08).
  CORS_ORIGINS: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('http://localhost:5173,http://localhost:4173'),
  }),
}).unknown(true);

/**
 * Valida um objeto de ambiente e devolve a configuração normalizada.
 * Função pura para poder ser testada sem mexer em process.env.
 */
const loadEnv = (source = process.env) => {
  const { value, error } = schema.validate(source, { abortEarly: false, convert: true });
  if (error) {
    const details = error.details.map((detail) => `- ${detail.message}`).join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${details}`);
  }
  return {
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
    port: value.PORT,
    jwt: {
      secret: value.JWT_SECRET,
      expiresIn: value.JWT_EXPIRES_IN,
      issuer: 'barberos-api',
      audience: 'barberos-app',
      algorithm: 'HS256',
    },
    db: {
      host: value.DB_HOST,
      port: value.DB_PORT,
      user: value.DB_USER,
      pass: value.DB_PASS,
      name: value.DB_NAME,
      ssl: value.DB_SSL,
    },
    corsOrigins: String(value.CORS_ORIGINS)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
};

module.exports = { loadEnv, KNOWN_WEAK_SECRETS };
