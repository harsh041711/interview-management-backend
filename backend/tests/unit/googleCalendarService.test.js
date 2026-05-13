'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/v1/integrations/google/callback';

const mockInsert = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      events: {
        insert: mockInsert,
        patch: mockPatch,
        delete: mockDelete,
      },
    }),
  },
}));

jest.mock('../../src/repositories/googleIntegrationRepository');
jest.mock('../../src/services/googleAuthService');

const gIntegrationRepo = require('../../src/repositories/googleIntegrationRepository');
const gAuth = require('../../src/services/googleAuthService');
const svc = require('../../src/services/googleCalendarService');

describe('googleCalendarService.getAccessToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns existing token when not near expiry', async () => {
    gIntegrationRepo.findCurrent.mockResolvedValue({
      accessToken: 'at-current',
      refreshToken: 'rt',
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000), // 1h ahead
    });
    const token = await svc.getAccessToken();
    expect(token).toBe('at-current');
    expect(gAuth.refreshAccessToken).not.toHaveBeenCalled();
  });

  test('refreshes when within 60s of expiry', async () => {
    gIntegrationRepo.findCurrent.mockResolvedValue({
      accessToken: 'at-old',
      refreshToken: 'rt',
      accessTokenExpiresAt: new Date(Date.now() + 30_000), // 30s ahead -> needs refresh
    });
    gAuth.refreshAccessToken.mockResolvedValue({
      accessToken: 'at-new',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
    });
    gIntegrationRepo.upsert.mockResolvedValue();
    const token = await svc.getAccessToken();
    expect(token).toBe('at-new');
    expect(gIntegrationRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'at-new' }),
    );
  });

  test('clears integration and throws E_GOOGLE_TOKEN_REVOKED on invalid_grant', async () => {
    gIntegrationRepo.findCurrent.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt-bad',
      accessTokenExpiresAt: new Date(Date.now() - 1000), // expired
    });
    const err = Object.assign(new Error('revoked'), { code: 'E_GOOGLE_TOKEN_REVOKED' });
    gAuth.refreshAccessToken.mockRejectedValue(err);
    await expect(svc.getAccessToken()).rejects.toMatchObject({ code: 'E_GOOGLE_TOKEN_REVOKED' });
    expect(gIntegrationRepo.clear).toHaveBeenCalled();
  });

  test('throws E_GOOGLE_NOT_CONNECTED when no integration row exists', async () => {
    gIntegrationRepo.findCurrent.mockResolvedValue(null);
    await expect(svc.getAccessToken()).rejects.toMatchObject({ code: 'E_GOOGLE_NOT_CONNECTED' });
  });
});

describe('googleCalendarService.createEvent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sends correct payload and returns { id, hangoutLink }', async () => {
    gIntegrationRepo.findCurrent.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
    });
    mockInsert.mockResolvedValue({
      data: { id: 'evt123', hangoutLink: 'https://meet.google.com/abc-def-ghi' },
    });
    const out = await svc.createEvent({
      summary: 'Interview: Alice with Bob',
      description: 'desc',
      startISO: '2026-06-01T10:00:00Z',
      endISO: '2026-06-01T10:45:00Z',
      attendees: ['a@example.com', 'b@example.com'],
    });
    expect(out).toEqual({ id: 'evt123', hangoutLink: 'https://meet.google.com/abc-def-ghi' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: 'primary',
      sendUpdates: 'all',
      conferenceDataVersion: 1,
      requestBody: expect.objectContaining({
        summary: 'Interview: Alice with Bob',
        attendees: [{ email: 'a@example.com' }, { email: 'b@example.com' }],
        conferenceData: expect.objectContaining({
          createRequest: expect.objectContaining({
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          }),
        }),
      }),
    }));
  });
});

describe('googleCalendarService.patchEvent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sends only start/end and returns nothing useful', async () => {
    gIntegrationRepo.findCurrent.mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
    });
    mockPatch.mockResolvedValue({ data: { id: 'evt123' } });
    await svc.patchEvent('evt123', { startISO: '2026-06-02T10:00:00Z', endISO: '2026-06-02T10:45:00Z' });
    expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: 'primary',
      eventId: 'evt123',
      sendUpdates: 'all',
      requestBody: {
        start: { dateTime: '2026-06-02T10:00:00Z' },
        end: { dateTime: '2026-06-02T10:45:00Z' },
      },
    }));
  });
});

describe('googleCalendarService.deleteEvent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls delete with eventId and sendUpdates=all', async () => {
    gIntegrationRepo.findCurrent.mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
    });
    mockDelete.mockResolvedValue({});
    await svc.deleteEvent('evt123');
    expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: 'primary',
      eventId: 'evt123',
      sendUpdates: 'all',
    }));
  });
});
