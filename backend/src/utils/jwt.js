'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('./ApiError');

const signAccessToken = (payload) =>
  jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.jwt.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Session expired', { code: 'E_JWT_EXPIRED' });
    }
    throw ApiError.unauthorized('Invalid token', { code: 'E_JWT_INVALID' });
  }
};

module.exports = { signAccessToken, verifyAccessToken };
