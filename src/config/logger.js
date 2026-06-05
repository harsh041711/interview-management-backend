'use strict';

const { createLogger, format, transports } = require('winston');
const env = require('./env');

const { combine, timestamp, errors, splat, json, colorize, printf } = format;

const consoleFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} ${level}: ${stack || message}${metaString}`;
});

const logger = createLogger({
  level: env.isProduction ? 'info' : 'debug',
  format: combine(timestamp(), errors({ stack: true }), splat(), json()),
  defaultMeta: { service: 'interview-management-backend' },
  transports: [
    new transports.Console({
      format: env.isProduction
        ? combine(timestamp(), errors({ stack: true }), splat(), json())
        : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), splat(), consoleFormat),
    }),
  ],
});

logger.stream = {
  write: (message) => logger.http ? logger.http(message.trim()) : logger.info(message.trim()),
};

module.exports = logger;
