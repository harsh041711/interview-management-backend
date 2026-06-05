'use strict';

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../config/logger');

const normalize = (err) => {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.unprocessable('Validation failed', { code: 'E_VALIDATION', details });
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid ${err.path}: ${err.value}`, { code: 'E_CAST' });
  }

  if (err.code === 11000 || err.code === 11001) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`${field} already exists`, { code: 'E_DUPLICATE', details: err.keyValue });
  }

  if (err.type === 'entity.too.large') {
    return ApiError.badRequest('Payload too large', { code: 'E_PAYLOAD_TOO_LARGE' });
  }

  return new ApiError(err.statusCode || 500, err.message || 'Internal server error', {
    code: err.code,
    isOperational: false,
  });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  const apiErr = normalize(err);

  if (!apiErr.isOperational || apiErr.statusCode >= 500) {
    logger.error('Unhandled error', {
      method: req.method,
      url: req.originalUrl,
      message: apiErr.message,
      stack: err.stack,
    });
  } else {
    logger.warn('Operational error', {
      method: req.method,
      url: req.originalUrl,
      status: apiErr.statusCode,
      code: apiErr.code,
      message: apiErr.message,
    });
  }

  res.status(apiErr.statusCode).json({
    success: false,
    message: apiErr.message,
    code: apiErr.code,
    ...(apiErr.details ? { details: apiErr.details } : {}),
    ...(env.isProduction ? {} : { stack: err.stack }),
  });
};

module.exports = errorHandler;
