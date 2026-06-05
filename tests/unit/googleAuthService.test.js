'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/v1/integrations/google/callback';

const mockGenerateAuthUrl = jest.fn();
const mockGetToken = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockGetTokenInfo = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        refreshAccessToken: mockRefreshAccessToken,
        getTokenInfo: mockGetTokenInfo,
        setCredentials: jest.fn(),
      })),
    },
    oauth2: jest.fn().mockReturnValue({
      userinfo: {
        get: jest.fn().mockResolvedValue({ data: { email: 'connected@example.com' } }),
      },
    }),
  },
}));

const svc = require('../../src/services/googleAuthService');

describe('googleAuthService.buildAuthUrl', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns a URL containing signed state', () => {
    mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/auth?state=signed.state.value');
    const { url, state } = svc.buildAuthUrl();
    expect(typeof url).toBe('string');
    expect(typeof state).toBe('string');
    expect(state.split('.').length).toBe(3); // JWT-shape
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: 'offline',
        prompt: 'consent',
        scope: expect.arrayContaining(['https://www.googleapis.com/auth/calendar.events']),
        state: expect.any(String),
      }),
    );
  });
});

describe('googleAuthService.verifyState', () => {
  test('accepts a state it just produced', () => {
    const { state } = svc.buildAuthUrl();
    expect(svc.verifyState(state)).toBe(true);
  });

  test('rejects a tampered state', () => {
    expect(svc.verifyState('not.a.real.token')).toBe(false);
  });
});

describe('googleAuthService.exchangeCode', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns tokens + connected email', async () => {
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: 'at',
        refresh_token: 'rt',
        expiry_date: Date.now() + 3600_000,
        scope: 'a b c',
      },
    });
    const out = await svc.exchangeCode('auth-code');
    expect(out).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: expect.any(Date),
      scope: 'a b c',
      accountEmail: 'connected@example.com',
    });
  });

  test('throws when Google omits refresh_token (user previously consented)', async () => {
    mockGetToken.mockResolvedValue({ tokens: { access_token: 'at', expiry_date: Date.now() + 3600_000 } });
    await expect(svc.exchangeCode('auth-code')).rejects.toMatchObject({ code: 'E_GOOGLE_NO_REFRESH_TOKEN' });
  });
});

describe('googleAuthService.refreshAccessToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns new access token + expiry', async () => {
    mockRefreshAccessToken.mockResolvedValue({
      credentials: { access_token: 'at2', expiry_date: Date.now() + 3600_000 },
    });
    const out = await svc.refreshAccessToken('rt-existing');
    expect(out.accessToken).toBe('at2');
    expect(out.accessTokenExpiresAt).toBeInstanceOf(Date);
  });

  test('re-throws invalid_grant with E_GOOGLE_TOKEN_REVOKED code', async () => {
    const err = new Error('invalid_grant');
    err.response = { data: { error: 'invalid_grant' } };
    mockRefreshAccessToken.mockRejectedValue(err);
    await expect(svc.refreshAccessToken('rt-bad')).rejects.toMatchObject({ code: 'E_GOOGLE_TOKEN_REVOKED' });
  });
});

describe('googleAuthService.isConfigured', () => {
  test('returns true when env vars are set', () => {
    expect(svc.isConfigured()).toBe(true);
  });
});
