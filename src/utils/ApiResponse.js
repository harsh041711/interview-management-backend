'use strict';

const ok = (res, data = null, message = 'Success', statusCode = 200, meta) =>
  res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  });

const created = (res, data, message = 'Created') => ok(res, data, message, 201);

const noContent = (res) => res.status(204).send();

module.exports = { ok, created, noContent };
