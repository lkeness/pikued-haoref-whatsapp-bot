const fs = require('fs');
const winston = require('winston');
const config = require('./config');
const {
  LOGS_DIR,
  ERROR_LOG_MAX_SIZE,
  ERROR_LOG_MAX_FILES,
  COMBINED_LOG_MAX_SIZE,
  COMBINED_LOG_MAX_FILES,
} = require('./constants');

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: `${LOGS_DIR}/error.log`,
      level: 'error',
      maxsize: ERROR_LOG_MAX_SIZE,
      maxFiles: ERROR_LOG_MAX_FILES,
    }),
    new winston.transports.File({
      filename: `${LOGS_DIR}/combined.log`,
      maxsize: COMBINED_LOG_MAX_SIZE,
      maxFiles: COMBINED_LOG_MAX_FILES,
    }),
  ],
});

module.exports = logger;
