'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';

const { generateInterviewToken, verifyInterviewToken, maskToken } = require('../../src/utils/interviewToken');

describe('interviewToken', () => {
  test('two generations produce unique tokens', () => {
    const a = generateInterviewToken();
    const b = generateInterviewToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.token.split('.')).toHaveLength(2);
  });

  test('verifyInterviewToken accepts a valid token', () => {
    const { token } = generateInterviewToken();
    expect(verifyInterviewToken(token)).toBe(true);
  });

  test('verifyInterviewToken rejects tampered signature', () => {
    const { token } = generateInterviewToken();
    const tampered = token.slice(0, -2) + 'aa';
    expect(verifyInterviewToken(tampered)).toBe(false);
  });

  test('verifyInterviewToken rejects malformed input', () => {
    expect(verifyInterviewToken('')).toBe(false);
    expect(verifyInterviewToken('nodot')).toBe(false);
    expect(verifyInterviewToken(null)).toBe(false);
    expect(verifyInterviewToken(undefined)).toBe(false);
    expect(verifyInterviewToken(123)).toBe(false);
  });
});
