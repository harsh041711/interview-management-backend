'use strict';

const { generateSetupToken } = require('../../src/utils/setupTokenGenerator');
const accountSetupService = require('../../src/services/accountSetupService');

jest.mock('../../src/repositories/interviewerRepository', () => ({
  findByEmail: jest.fn(),
  findBySetupTokenHash: jest.fn(),
  saveSetupToken: jest.fn(),
  setPassword: jest.fn(),
}));
const repo = require('../../src/repositories/interviewerRepository');

describe('accountSetupService.issueToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('issues token for active interviewer (initial_setup purpose)', async () => {
    repo.findByEmail.mockResolvedValue({ id: 'i1', isActive: true, passwordHash: null });
    repo.saveSetupToken.mockResolvedValue();
    const result = await accountSetupService.issueToken({ email: 'a@b.com', purpose: 'initial_setup' });
    expect(result.email).toBe('a@b.com');
    expect(repo.saveSetupToken).toHaveBeenCalledWith('i1', expect.objectContaining({
      tokenHash: expect.any(String),
      expiresAt: expect.any(Date),
      purpose: 'initial_setup',
    }));
  });

  test('returns silent success for missing email (do not leak existence)', async () => {
    repo.findByEmail.mockResolvedValue(null);
    const result = await accountSetupService.issueToken({ email: 'nope@b.com', purpose: 'forgot_password' });
    expect(result.email).toBe('nope@b.com');
    expect(repo.saveSetupToken).not.toHaveBeenCalled();
  });

  test('throws E_ACCOUNT_INACTIVE for inactive interviewer on forgot_password', async () => {
    repo.findByEmail.mockResolvedValue({ id: 'i1', isActive: false });
    await expect(
      accountSetupService.issueToken({ email: 'a@b.com', purpose: 'forgot_password' }),
    ).rejects.toMatchObject({ code: 'E_ACCOUNT_INACTIVE' });
  });
});

describe('accountSetupService.validateToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns interviewer email/name/purpose when valid', async () => {
    const t = generateSetupToken();
    repo.findBySetupTokenHash.mockResolvedValue({
      id: 'i1', name: 'Inv', email: 'a@b.com', isActive: true,
      setupTokenHash: t.tokenHash, setupTokenExpiresAt: new Date(Date.now() + 1000),
      setupTokenPurpose: 'initial_setup',
    });
    const result = await accountSetupService.validateToken(t.token);
    expect(result).toMatchObject({ email: 'a@b.com', name: 'Inv', purpose: 'initial_setup' });
  });

  test('throws on expired token', async () => {
    const t = generateSetupToken();
    repo.findBySetupTokenHash.mockResolvedValue({
      id: 'i1', email: 'a@b.com', isActive: true,
      setupTokenHash: t.tokenHash, setupTokenExpiresAt: new Date(Date.now() - 1000),
      setupTokenPurpose: 'initial_setup',
    });
    await expect(accountSetupService.validateToken(t.token)).rejects.toMatchObject({
      code: 'E_SETUP_TOKEN_INVALID',
    });
  });

  test('throws on unknown token', async () => {
    repo.findBySetupTokenHash.mockResolvedValue(null);
    await expect(accountSetupService.validateToken('junk')).rejects.toMatchObject({
      code: 'E_SETUP_TOKEN_INVALID',
    });
  });

  test('throws on inactive account', async () => {
    const t = generateSetupToken();
    repo.findBySetupTokenHash.mockResolvedValue({
      id: 'i1', isActive: false,
      setupTokenHash: t.tokenHash, setupTokenExpiresAt: new Date(Date.now() + 1000),
    });
    await expect(accountSetupService.validateToken(t.token)).rejects.toMatchObject({
      code: 'E_ACCOUNT_INACTIVE',
    });
  });
});
