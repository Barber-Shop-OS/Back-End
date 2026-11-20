// Logger central (winston). BE-42:
//   - todo log carrega `request_id` quando emitido dentro de uma requisição;
//   - campos sensíveis (authorization, password, token, secret, cookie...) são mascarados;
//   - produção: JSON no stdout (coletado pela plataforma) + arquivos em logs/;
//   - desenvolvimento: console legível.
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const requestContext = require('../shared/requestContext');

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const SENSITIVE = /^(authorization|password|new_password|current_password|token|id_token|refresh_token|access_token|secret|cookie|set-cookie|api_?key|tax_?id|card)$/i;

const scrub = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE.test(key) ? '[REDACTED]' : scrub(item, depth + 1);
  }
  return out;
};

const enrich = winston.format((info) => {
  const id = requestContext.requestId();
  if (id && !info.request_id) info.request_id = id;
  for (const key of Object.keys(info)) {
    if (typeof key === 'string' && SENSITIVE.test(key)) info[key] = '[REDACTED]';
    else if (info[key] && typeof info[key] === 'object') info[key] = scrub(info[key]);
  }
  return info;
});

const isProduction = process.env.NODE_ENV === 'production';
const json = winston.format.combine(enrich(), winston.format.timestamp(), winston.format.json());

const transports = [
  new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error', format: json }),
  new winston.transports.File({ filename: path.join(logsDir, 'combined.log'), level: 'info', format: json }),
];

if (isProduction) {
  transports.push(new winston.transports.Console({ format: json }));
} else {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        enrich(),
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) =>
          `[${timestamp}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
        )
      ),
    })
  );
}

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  transports,
});

module.exports = logger;
module.exports.scrub = scrub;
module.exports.enrich = enrich;
