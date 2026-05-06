'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');

const sign = (value, secret = env.testToken.secret) =>
  crypto.createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);

/**
 * Generate an interview token of form `<uuidHex>.<sig>`.
 * No expiry — the caller persists and manages validity.
 * Returns { token }.
 */
const generateInterviewToken = () => {
  const id = uuidv4().replace(/-/g, '');
  const signature = sign(id);
  const token = `${id}.${signature}`;
  return { token };
};

/**
 * Verify interview token signature in constant-time.
 * Returns true if the signature is valid, false otherwise.
 */
const verifyInterviewToken = (token) => {
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

module.exports = { generateInterviewToken, verifyInterviewToken, maskToken };
