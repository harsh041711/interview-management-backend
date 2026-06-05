'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';

const { decideRound1Outcome } = require('../../src/services/testService');

describe('decideRound1Outcome', () => {
  test('percentage 80, no cheat → shortlisted', () => {
    expect(decideRound1Outcome({ percentage: 80, cheatDetected: false })).toBe('shortlisted');
  });

  test('percentage 50, no cheat → shortlisted (>= threshold, not >)', () => {
    expect(decideRound1Outcome({ percentage: 50, cheatDetected: false })).toBe('shortlisted');
  });

  test('percentage 49.9, no cheat → rejected', () => {
    expect(decideRound1Outcome({ percentage: 49.9, cheatDetected: false })).toBe('rejected');
  });

  test('percentage 100, cheat detected → disqualified', () => {
    expect(decideRound1Outcome({ percentage: 100, cheatDetected: true })).toBe('disqualified');
  });
});
