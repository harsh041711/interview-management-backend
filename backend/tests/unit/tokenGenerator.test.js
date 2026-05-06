'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';

const { generateTestToken, verifyTestToken, maskToken } = require('../../src/utils/tokenGenerator');

describe('tokenGenerator', () => {
  test('generates unique tokens with future expiry', () => {
    const a = generateTestToken({ minutes: 60 });
    const b = generateTestToken({ minutes: 60 });
    expect(a.token).not.toEqual(b.token);
    expect(a.token.split('.')).toHaveLength(2);
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('verifyTestToken accepts a valid token', () => {
    const { token } = generateTestToken();
    expect(verifyTestToken(token)).toBe(true);
  });

  test('verifyTestToken rejects tampered token', () => {
    const { token } = generateTestToken();
    const tampered = token.slice(0, -2) + 'aa';
    expect(verifyTestToken(tampered)).toBe(false);
  });

  test('verifyTestToken rejects malformed input', () => {
    expect(verifyTestToken('')).toBe(false);
    expect(verifyTestToken('nodot')).toBe(false);
    expect(verifyTestToken(null)).toBe(false);
    expect(verifyTestToken(undefined)).toBe(false);
    expect(verifyTestToken(123)).toBe(false);
  });

  test('maskToken hides middle of value', () => {
    const masked = maskToken('abcdefghijklmnop');
    expect(masked.startsWith('abcd')).toBe(true);
    expect(masked.endsWith('mnop')).toBe(true);
    expect(masked).toContain('…');
  });
});
