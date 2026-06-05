const { generateSetupToken, hashSetupToken, verifySetupToken } = require('../../src/utils/setupTokenGenerator');

describe('setupTokenGenerator', () => {
  test('generates raw token + hash + expiresAt 60 minutes ahead', () => {
    const before = Date.now();
    const result = generateSetupToken();
    const after = Date.now();
    expect(result.token).toMatch(/^[a-f0-9-]{36}\.[a-f0-9]{64}$/);
    expect(result.tokenHash).toHaveLength(64);
    const ttl = result.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(60 * 60 * 1000 - 5);
    expect(result.expiresAt.getTime() - after).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  test('generates unique tokens', () => {
    const a = generateSetupToken();
    const b = generateSetupToken();
    expect(a.token).not.toEqual(b.token);
  });

  test('hashSetupToken is deterministic', () => {
    expect(hashSetupToken('abc')).toEqual(hashSetupToken('abc'));
  });

  test('verifySetupToken matches in constant time', () => {
    const r = generateSetupToken();
    expect(verifySetupToken(r.token, r.tokenHash)).toBe(true);
    expect(verifySetupToken('wrong', r.tokenHash)).toBe(false);
  });
});
