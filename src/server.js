'use strict';

const http = require('http');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDB } = require('./config/db');
const app = require('./app');
const { initSocket } = require('./sockets/testSocket');

let server;

const start = async () => {
  await connectDB();
  server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    logger.info(`${env.appName} listening on :${env.port} (${env.nodeEnv})`);
    logger.info(`API base: ${env.apiPrefix}`);
  });
};

const shutdown = (signal) => async () => {
  logger.warn(`${signal} received — shutting down gracefully`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', { reason: reason?.message || reason }));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err: err.message, stack: err.stack });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start server', { err: err.message, stack: err.stack });
  process.exit(1);
});
