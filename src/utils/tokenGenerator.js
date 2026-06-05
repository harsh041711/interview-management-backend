'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');

const sign = (value, secret = env.testToken.secret) =>
  crypto.createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);

/**
 * Generate a candidate test token of form `<uuid>.<sig>`.
 * Returned object includes the raw token and its expiry.
 */
const generateTestToken = ({ minutes = env.testToken.expiryMinutes } = {}) => {
  const id = uuidv4().replace(/-/g, '');
  const signature = sign(id);
  const token = `${id}.${signature}`;
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  return { token, expiresAt };
};

/**
 * Verify token signature in constant-time. Returns true if signature matches.
 * Caller is responsible for checking DB record + expiresAt against current time.
 */
const verifyTestToken = (token) => {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [id, sig] = parts;
  if (!id || !sig) return false;
  const expected = sign(id);
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
};

const maskToken = (token) => {
  if (!token || typeof token !== 'string') return '';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
};

module.exports = { generateTestToken, verifyTestToken, maskToken };
