'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');

const env = require('./config/env');
const logger = require('./config/logger');
const { configureCloudinary } = require('./config/cloudinary');
const { globalLimiter } = require('./middlewares/rateLimiter');
const errorHandler = require('./middlewares/errorHandler');
const notFound = require('./middlewares/notFound');
const apiRouter = require('./routes');

configureCloudinary();

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  exposedHeaders: ['x-request-id'],
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(mongoSanitize({ replaceWith: '_' }));

if (!env.isProduction) {
  app.use(morgan('dev', { stream: { write: (msg) => logger.debug(msg.trim()) } }));
} else {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

app.use(env.apiPrefix, globalLimiter, apiRouter);

app.get('/', (_req, res) => res.json({ name: env.appName, status: 'ok' }));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
