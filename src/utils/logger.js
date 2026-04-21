// Centralized Winston logger with console and file transports for observability.
const fs = require('fs');
const path = require('path');
const winston = require('winston');

const logsDir = path.resolve(process.cwd(), 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const transports = [
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  }),
];

if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
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
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transports,
});

module.exports = logger;