'use strict';

class ApiError extends Error {
  constructor(statusCode, message, { code, details, isOperational = true } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || `E_${statusCode}`;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Bad request', opts) { return new ApiError(400, message, opts); }
  static unauthorized(message = 'Unauthorized', opts) { return new ApiError(401, message, opts); }
  static forbidden(message = 'Forbidden', opts) { return new ApiError(403, message, opts); }
  static notFound(message = 'Resource not found', opts) { return new ApiError(404, message, opts); }
  static conflict(message = 'Conflict', opts) { return new ApiError(409, message, opts); }
  static gone(message = 'Gone', opts) { return new ApiError(410, message, opts); }
  static unprocessable(message = 'Unprocessable entity', opts) { return new ApiError(422, message, opts); }
  static tooMany(message = 'Too many requests', opts) { return new ApiError(429, message, opts); }
  static internal(message = 'Internal server error', opts) { return new ApiError(500, message, { ...opts, isOperational: false }); }
}

module.exports = ApiError;
