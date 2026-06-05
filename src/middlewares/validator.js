'use strict';

const ApiError = require('../utils/ApiError');

const SOURCES = ['body', 'query', 'params'];

const validate = (schemas) => (req, _res, next) => {
  for (const source of SOURCES) {
    const schema = schemas?.[source];
    if (!schema) continue;
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(ApiError.unprocessable('Validation failed', { code: 'E_VALIDATION', details }));
    }
    req[source] = value;
  }
  return next();
};

module.exports = validate;
