'use strict';

const crypto = require('crypto');

const TTL_MS = 60 * 60 * 1000;

const generateSetupToken = () => {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('hex');
  const token = `${id}.${secret}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return {
    token,
    tokenHash,
    expiresAt: new Date(Date.now() + TTL_MS),
  };
};

const hashSetupToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const verifySetupToken = (rawToken, expectedHash) => {
  if (!rawToken || !expectedHash) return false;
  const actual = hashSetupToken(rawToken);
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

module.exports = { generateSetupToken, hashSetupToken, verifySetupToken, TTL_MS };
