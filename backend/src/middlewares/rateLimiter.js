'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const buildLimiter = ({ windowMs = env.rateLimit.windowMs, max = env.rateLimit.max, message = 'Too many requests, please try again later.' } = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(ApiError.tooMany(message, { code: 'E_RATE_LIMIT' })),
  });

const globalLimiter = buildLimiter();

const loginLimiter = buildLimiter({
  windowMs: 60_000,
  max: env.rateLimit.loginMax,
  message: 'Too many login attempts. Please retry after a minute.',
});

const testStartLimiter = buildLimiter({
  windowMs: 60_000,
  max: 3,
  message: 'Too many test-start attempts.',
});

const rescheduleLimiter = buildLimiter({
  windowMs: 60_000,
  max: 3,
  message: 'Too many reschedule attempts.',
});

module.exports = { globalLimiter, loginLimiter, testStartLimiter, rescheduleLimiter, buildLimiter };
