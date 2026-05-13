# Google Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual "paste meeting URL" step in interview scheduling with one-shared-account Google Calendar integration that auto-creates a Calendar event (with native Google Meet link and both attendees) and keeps the event synced through reschedule/cancel.

**Architecture:** A new singleton `GoogleIntegration` MongoDB document stores the connected Google account's tokens. Two new services split responsibilities: `googleAuthService` owns the OAuth dance and token refresh; `googleCalendarService` owns the three Calendar API ops (create/patch/delete) and transparently refreshes tokens before each call. `interviewService` calls the calendar service inside `schedule`, `decideReschedule` (approved branch), and `cancel`. Frontend gets a new Settings page with a Connect/Disconnect control, and `ScheduleInterviewModal` gets a mode toggle (auto-generate vs. manual paste) that falls back to manual on any Google failure.

**Tech Stack:** Node.js + Express + Mongoose, React + Redux Toolkit, `googleapis` (Google's official Node.js client — provides OAuth2Client + Calendar API helpers).

**Spec reference:** `docs/superpowers/specs/2026-05-13-google-calendar-integration-design.md`

---

## Important platform notes

- **API prefix.** This project mounts all routes under `/api/v1` (`env.apiPrefix` default). The spec wrote `/admin/integrations/...` as the conceptual path, but the *actual* HTTP path is `/api/v1/integrations/google/callback`. The Google OAuth redirect URI you register in Google Cloud Console MUST match the actual path: `http://localhost:5000/api/v1/integrations/google/callback`.
- **Service naming clarification.** The spec refers to `applyApprovedReschedule(...)` — in the existing code this is the `decideReschedule(...)` function in `backend/src/services/interviewService.js`, specifically the `if (decision === 'approved')` branch. Tasks refer to it by the real name.
- **Working tree.** This work happens on the `dev` branch directly (the project doesn't use feature branches for these phases). Commit every step.
- **Tests run.** `cd backend && npm test -- --testPathPattern '<pattern>'` runs a single test file.

---

## File structure

### Backend — new files
| File | Purpose |
|---|---|
| `backend/src/models/GoogleIntegration.js` | Singleton Mongoose model — one connected account |
| `backend/src/repositories/googleIntegrationRepository.js` | `findCurrent`, `upsert`, `clear` |
| `backend/src/services/googleAuthService.js` | OAuth URL build, code→token exchange, token refresh |
| `backend/src/services/googleCalendarService.js` | `createEvent`, `patchEvent`, `deleteEvent`, `getAccessToken` (with refresh) |
| `backend/src/controllers/integrationsController.js` | 4 HTTP handlers |
| `backend/src/routes/integrationsRoutes.js` | `/integrations` router |
| `backend/tests/unit/googleAuthService.test.js` | Unit tests for auth service |
| `backend/tests/unit/googleCalendarService.test.js` | Unit tests for calendar service |

### Backend — modified files
| File | Change |
|---|---|
| `backend/package.json` | Add `googleapis` dep |
| `backend/src/config/env.js` | Add `google.*` config block |
| `backend/src/models/Interview.js` | `meetingUrl` optional; new `googleCalendarEventId` field |
| `backend/src/validators/interviewValidator.js` | `scheduleSchema.body.meetingUrl` optional |
| `backend/src/services/interviewService.js` | Auto-create event in `schedule`, patch in `decideReschedule`, delete in `cancel` |
| `backend/src/routes/index.js` | Mount `/integrations` |
| `backend/tests/unit/interviewService.test.js` | Extend with calendar-integration test cases |

### Frontend — new files
| File | Purpose |
|---|---|
| `frontend/src/api/integrationsApi.js` | 3 API helpers |
| `frontend/src/features/settings/settingsSlice.js` | Redux state for Google status |
| `frontend/src/features/settings/SettingsPage.jsx` | Settings UI |
| `frontend/src/features/settings/SettingsPage.scss` | Settings styles |

### Frontend — modified files
| File | Change |
|---|---|
| `frontend/src/layouts/AdminLayout.jsx` | Add Settings nav entry |
| `frontend/src/routes/AppRoutes.jsx` | Register `/admin/settings` |
| `frontend/src/app/store.js` | Register `settings` reducer |
| `frontend/src/features/interviews/ScheduleInterviewModal.jsx` | Mode toggle + fallback |
| `frontend/src/features/interviews/ScheduleInterviewModal.scss` | Mode toggle styles |

---

## Tasks

### Task 1: Install googleapis dependency and add env config

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/config/env.js`
- Modify: `backend/.env.example` (if it exists; else skip)

- [ ] **Step 1: Install googleapis**

Run:
```bash
cd backend && npm install googleapis@^144.0.0
```

Expected: package added to `dependencies` block in `package.json`.

- [ ] **Step 2: Add Google config block to env.js**

Edit `backend/src/config/env.js`. Add this block inside the `env` object, after the `ai` block and before the `smtp` block:

```js
  google: {
    clientId: optional('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: optional('GOOGLE_OAUTH_CLIENT_SECRET'),
    redirectUri: optional('GOOGLE_OAUTH_REDIRECT_URI', 'http://localhost:5000/api/v1/integrations/google/callback'),
    scopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  },
```

- [ ] **Step 3: Add env vars to your local .env**

Open `backend/.env` (NOT example — your actual local file) and append:

```
GOOGLE_OAUTH_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<your-google-oauth-client-secret>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5000/api/v1/integrations/google/callback
```

Then in Google Cloud Console → Credentials → your OAuth Client → "Authorized redirect URIs": confirm `http://localhost:5000/api/v1/integrations/google/callback` is listed (NOT `/admin/integrations/...` — fix it if you set the wrong one). Click Save.

- [ ] **Step 4: Verify env loads without crashing**

Run:
```bash
cd backend && node -e "console.log(require('./src/config/env').google)"
```

Expected output:
```
{
  clientId: '<your-google-oauth-client-id>',
  clientSecret: 'GOCSPX-...',
  redirectUri: 'http://localhost:5000/api/v1/integrations/google/callback',
  scopes: [ 'https://www.googleapis.com/auth/calendar.events', ... ]
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/config/env.js
git commit -m "chore(google): add googleapis dependency and OAuth env config"
```

---

### Task 2: Create GoogleIntegration model

**Files:**
- Create: `backend/src/models/GoogleIntegration.js`

- [ ] **Step 1: Write the model**

Create `backend/src/models/GoogleIntegration.js`:

```js
'use strict';

const mongoose = require('mongoose');

const googleIntegrationSchema = new mongoose.Schema(
  {
    accountEmail: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    accessTokenExpiresAt: { type: Date, required: true },
    scope: { type: String, default: '' },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        // Never leak tokens through JSON serialisation.
        delete ret.accessToken;
        delete ret.refreshToken;
        return ret;
      },
    },
  },
);

module.exports = mongoose.model('GoogleIntegration', googleIntegrationSchema);
```

The `toJSON` transform strips tokens — this lets us safely `res.json(integration)` if we ever need to.

- [ ] **Step 2: Verify model loads**

Run:
```bash
cd backend && node -e "const M = require('./src/models/GoogleIntegration'); console.log(M.modelName, Object.keys(M.schema.paths));"
```

Expected output:
```
GoogleIntegration [ 'accountEmail', 'accessToken', 'refreshToken', 'accessTokenExpiresAt', 'scope', 'connectedBy', 'createdAt', 'updatedAt', '_id', '__v' ]
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/GoogleIntegration.js
git commit -m "feat(google): add GoogleIntegration singleton model"
```

---

### Task 3: Create googleIntegrationRepository

**Files:**
- Create: `backend/src/repositories/googleIntegrationRepository.js`

- [ ] **Step 1: Write the repository**

Create `backend/src/repositories/googleIntegrationRepository.js`:

```js
'use strict';

const GoogleIntegration = require('../models/GoogleIntegration');

// Singleton collection: at most one document.
const findCurrent = () => GoogleIntegration.findOne();

const upsert = (fields) =>
  GoogleIntegration.findOneAndUpdate(
    {},
    { $set: fields },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

const clear = () => GoogleIntegration.deleteMany({});

module.exports = { findCurrent, upsert, clear };
```

- [ ] **Step 2: Verify it loads**

Run:
```bash
cd backend && node -e "console.log(Object.keys(require('./src/repositories/googleIntegrationRepository')))"
```

Expected output:
```
[ 'findCurrent', 'upsert', 'clear' ]
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/repositories/googleIntegrationRepository.js
git commit -m "feat(google): add googleIntegrationRepository"
```

---

### Task 4: Implement googleAuthService

**Files:**
- Create: `backend/src/services/googleAuthService.js`
- Test: `backend/tests/unit/googleAuthService.test.js`

This service handles the OAuth dance: building consent URLs (with signed state to prevent CSRF), exchanging codes for tokens, refreshing expired tokens. It does NOT touch the DB — the calling code persists what it returns.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/googleAuthService.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd backend && npm test -- --testPathPattern googleAuthService
```

Expected: FAIL — `Cannot find module '../../src/services/googleAuthService'`.

- [ ] **Step 3: Implement googleAuthService**

Create `backend/src/services/googleAuthService.js`:

```js
'use strict';

const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

const isConfigured = () =>
  Boolean(env.google.clientId && env.google.clientSecret && env.google.redirectUri);

const requireConfigured = () => {
  if (!isConfigured()) {
    throw new ApiError(500, 'Google OAuth is not configured on this server', {
      code: 'E_GOOGLE_NOT_CONFIGURED',
    });
  }
};

const oauthClient = () => {
  requireConfigured();
  return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
};

const signState = () =>
  jwt.sign({ purpose: 'google_oauth' }, env.jwt.secret, { expiresIn: STATE_TTL_SECONDS });

const verifyState = (state) => {
  try {
    const payload = jwt.verify(state, env.jwt.secret);
    return payload?.purpose === 'google_oauth';
  } catch {
    return false;
  }
};

const buildAuthUrl = () => {
  const client = oauthClient();
  const state = signState();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh_token issuance even if user previously consented
    scope: env.google.scopes,
    state,
  });
  return { url, state };
};

const exchangeCode = async (code) => {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new ApiError(400, 'Google did not return a refresh token. Revoke the previous grant in Google Account permissions and reconnect.', {
      code: 'E_GOOGLE_NO_REFRESH_TOKEN',
    });
  }
  client.setCredentials(tokens);
  // Fetch the email via the userinfo endpoint
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpiresAt: new Date(tokens.expiry_date),
    scope: tokens.scope || '',
    accountEmail: profile.email,
  };
};

const refreshAccessToken = async (refreshToken) => {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { credentials } = await client.refreshAccessToken();
    return {
      accessToken: credentials.access_token,
      accessTokenExpiresAt: new Date(credentials.expiry_date),
    };
  } catch (err) {
    const errCode = err?.response?.data?.error || err?.message || '';
    if (String(errCode).includes('invalid_grant')) {
      throw new ApiError(401, 'Google refused the refresh token (user may have revoked access)', {
        code: 'E_GOOGLE_TOKEN_REVOKED',
      });
    }
    throw err;
  }
};

module.exports = {
  isConfigured,
  buildAuthUrl,
  verifyState,
  exchangeCode,
  refreshAccessToken,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd backend && npm test -- --testPathPattern googleAuthService
```

Expected: PASS — all 8 tests across the 5 describe blocks. If state-related test fails on the JWT-shape check, the assertion is `split('.').length === 3` — that's the JWT format (header.payload.signature).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/googleAuthService.js backend/tests/unit/googleAuthService.test.js
git commit -m "feat(google): add googleAuthService with OAuth + state CSRF + token refresh"
```

---

### Task 5: Implement googleCalendarService

**Files:**
- Create: `backend/src/services/googleCalendarService.js`
- Test: `backend/tests/unit/googleCalendarService.test.js`

This service does three things only: create, patch, delete calendar events. Before each call it fetches the current token via `getAccessToken()` which auto-refreshes if within 60s of expiry.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/googleCalendarService.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd backend && npm test -- --testPathPattern googleCalendarService
```

Expected: FAIL — `Cannot find module '../../src/services/googleCalendarService'`.

- [ ] **Step 3: Implement googleCalendarService**

Create `backend/src/services/googleCalendarService.js`:

```js
'use strict';

const { randomUUID } = require('crypto');
const { google } = require('googleapis');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const gIntegrationRepo = require('../repositories/googleIntegrationRepository');
const googleAuthService = require('./googleAuthService');

const REFRESH_SKEW_MS = 60 * 1000;

const getAccessToken = async () => {
  const integration = await gIntegrationRepo.findCurrent();
  if (!integration) {
    throw new ApiError(412, 'Google Calendar is not connected', { code: 'E_GOOGLE_NOT_CONNECTED' });
  }
  const expiresAt = integration.accessTokenExpiresAt?.getTime?.() ?? 0;
  if (expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return integration.accessToken;
  }
  // Refresh
  try {
    const { accessToken, accessTokenExpiresAt } = await googleAuthService.refreshAccessToken(integration.refreshToken);
    await gIntegrationRepo.upsert({ accessToken, accessTokenExpiresAt });
    return accessToken;
  } catch (err) {
    if (err.code === 'E_GOOGLE_TOKEN_REVOKED') {
      await gIntegrationRepo.clear();
    }
    throw err;
  }
};

const buildClient = async () => {
  const accessToken = await getAccessToken();
  const oauth2 = new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
  oauth2.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth2 });
};

const createEvent = async ({ summary, description, startISO, endISO, attendees }) => {
  const calendar = await buildClient();
  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    conferenceDataVersion: 1,
    requestBody: {
      summary,
      description,
      start: { dateTime: startISO },
      end: { dateTime: endISO },
      attendees: (attendees || []).map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: { useDefault: true },
    },
  });
  return { id: res.data.id, hangoutLink: res.data.hangoutLink };
};

const patchEvent = async (eventId, { startISO, endISO }) => {
  const calendar = await buildClient();
  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
    requestBody: {
      start: { dateTime: startISO },
      end: { dateTime: endISO },
    },
  });
};

const deleteEvent = async (eventId) => {
  const calendar = await buildClient();
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
  });
};

module.exports = { getAccessToken, createEvent, patchEvent, deleteEvent };
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd backend && npm test -- --testPathPattern googleCalendarService
```

Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/googleCalendarService.js backend/tests/unit/googleCalendarService.test.js
git commit -m "feat(google): add googleCalendarService with auto-refresh + create/patch/delete"
```

---

### Task 6: Implement integrationsController

**Files:**
- Create: `backend/src/controllers/integrationsController.js`

This exposes 4 endpoints. The `googleCallback` endpoint is the only one without auth — Google itself triggers it via redirect, so we rely on the signed state to authenticate the round-trip.

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/integrationsController.js`:

```js
'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const googleAuthService = require('../services/googleAuthService');
const gIntegrationRepo = require('../repositories/googleIntegrationRepository');
const logger = require('../config/logger');

const googleConnect = asyncHandler(async (_req, res) => {
  if (!googleAuthService.isConfigured()) {
    throw new ApiError(500, 'Google OAuth is not configured on this server', {
      code: 'E_GOOGLE_NOT_CONFIGURED',
    });
  }
  const { url } = googleAuthService.buildAuthUrl();
  return ok(res, { url }, 'Authorization URL generated');
});

const googleCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = env.frontendUrl.replace(/\/$/, '');

  // 1. User declined or Google returned an error
  if (error) {
    logger.warn('Google OAuth callback returned error', { error });
    return res.redirect(`${frontendUrl}/admin/settings?google=denied`);
  }
  // 2. Missing code or state means a bad/forged request
  if (!code || !state || !googleAuthService.verifyState(state)) {
    logger.warn('Google OAuth callback: bad state or missing code');
    return res.redirect(`${frontendUrl}/admin/settings?google=invalid_state`);
  }

  try {
    const tokens = await googleAuthService.exchangeCode(code);
    await gIntegrationRepo.upsert({
      accountEmail: tokens.accountEmail,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      scope: tokens.scope,
      connectedBy: null, // callback is unauthenticated; we don't know who clicked
    });
    return res.redirect(`${frontendUrl}/admin/settings?google=connected`);
  } catch (err) {
    logger.error('Google OAuth callback failed', { err: err.message, code: err.code });
    const reason = err.code === 'E_GOOGLE_NO_REFRESH_TOKEN' ? 'no_refresh_token' : 'exchange_failed';
    return res.redirect(`${frontendUrl}/admin/settings?google=${reason}`);
  }
});

const googleStatus = asyncHandler(async (_req, res) => {
  if (!googleAuthService.isConfigured()) {
    return ok(res, { configured: false, connected: false }, 'Google status');
  }
  const integration = await gIntegrationRepo.findCurrent();
  if (!integration) {
    return ok(res, { configured: true, connected: false }, 'Google status');
  }
  return ok(res, {
    configured: true,
    connected: true,
    accountEmail: integration.accountEmail,
    connectedAt: integration.createdAt,
  }, 'Google status');
});

const googleDisconnect = asyncHandler(async (_req, res) => {
  await gIntegrationRepo.clear();
  return ok(res, { disconnected: true }, 'Google integration disconnected');
});

module.exports = { googleConnect, googleCallback, googleStatus, googleDisconnect };
```

- [ ] **Step 2: Verify the controller exports load**

Run:
```bash
cd backend && node -e "console.log(Object.keys(require('./src/controllers/integrationsController')))"
```

Expected output:
```
[ 'googleConnect', 'googleCallback', 'googleStatus', 'googleDisconnect' ]
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/integrationsController.js
git commit -m "feat(google): add integrationsController with 4 OAuth+status endpoints"
```

---

### Task 7: Add integrationsRoutes and mount into routes/index.js

**Files:**
- Create: `backend/src/routes/integrationsRoutes.js`
- Modify: `backend/src/routes/index.js`

Note: the callback endpoint must NOT require auth (Google's browser redirect doesn't carry a JWT). All other endpoints require admin auth.

- [ ] **Step 1: Write the router**

Create `backend/src/routes/integrationsRoutes.js`:

```js
'use strict';

const express = require('express');
const { requireAuth } = require('../middlewares/authMiddleware');
const integrationsController = require('../controllers/integrationsController');

const router = express.Router();

// Public — Google calls this via 302 redirect from the consent screen.
router.get('/google/callback', integrationsController.googleCallback);

// Admin-only
router.use(requireAuth);
router.get('/google/connect', integrationsController.googleConnect);
router.get('/google/status', integrationsController.googleStatus);
router.post('/google/disconnect', integrationsController.googleDisconnect);

module.exports = router;
```

- [ ] **Step 2: Mount the router in routes/index.js**

Edit `backend/src/routes/index.js`. Add the require near the other route requires:

```js
const integrationsRoutes = require('./integrationsRoutes');
```

Then add the mount near the other `router.use(...)` calls (alphabetical placement is fine — insert after `codingSubmissionRoutes`):

```js
router.use('/integrations', integrationsRoutes);
```

- [ ] **Step 3: Boot the server and verify the routes register**

Run:
```bash
cd backend && timeout 6 npm run dev 2>&1 | head -30
```

Expected: server logs say something like `Server listening on port 5000` and no crash. Hit Ctrl+C or let timeout end it.

Then test the public callback route (no auth required) returns a redirect:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:5000/api/v1/integrations/google/callback?error=access_denied"
```

(Re-start the server in another terminal first with `cd backend && npm run dev`.)

Expected: `302 http://localhost:5173/admin/settings?google=denied`

Then test the auth-required status endpoint returns 401:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5000/api/v1/integrations/google/status"
```

Expected: `401`

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/integrationsRoutes.js backend/src/routes/index.js
git commit -m "feat(google): wire /integrations routes (callback unauthenticated, rest admin)"
```

---

### Task 8: Update Interview model

**Files:**
- Modify: `backend/src/models/Interview.js`

- [ ] **Step 1: Make meetingUrl optional and add googleCalendarEventId**

In `backend/src/models/Interview.js`, change line 22:

```js
    meetingUrl: { type: String, required: true },
```

to:

```js
    meetingUrl: { type: String, default: null },
    googleCalendarEventId: { type: String, default: null },
```

- [ ] **Step 2: Verify the schema accepts a doc without meetingUrl**

Run:
```bash
cd backend && node -e "
const M = require('./src/models/Interview');
const doc = new M({
  candidate: '507f1f77bcf86cd799439011',
  interviewer: '507f1f77bcf86cd799439012',
  scheduledAt: new Date(),
  candidateAccessToken: 'a',
  interviewerAccessToken: 'b',
  scheduledBy: '507f1f77bcf86cd799439013',
});
M.validate(doc).then(() => console.log('OK')).catch((e) => console.log('FAIL', e.message));
"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/Interview.js
git commit -m "feat(interview): make meetingUrl optional and add googleCalendarEventId"
```

---

### Task 9: Update interviewValidator

**Files:**
- Modify: `backend/src/validators/interviewValidator.js`

- [ ] **Step 1: Make meetingUrl optional in scheduleSchema**

In `backend/src/validators/interviewValidator.js`, change line 14:

```js
    meetingUrl: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
```

to:

```js
    meetingUrl: Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).optional(),
```

- [ ] **Step 2: Verify schema accepts both shapes**

Run:
```bash
cd backend && node -e "
const { scheduleSchema } = require('./src/validators/interviewValidator');
const base = { candidateId: '507f1f77bcf86cd799439011', interviewerId: '507f1f77bcf86cd799439012', scheduledAt: new Date(Date.now()+3600000).toISOString() };
console.log('with URL:', scheduleSchema.body.validate({ ...base, meetingUrl: 'https://m.example/x' }).error?.message || 'OK');
console.log('without URL:', scheduleSchema.body.validate(base).error?.message || 'OK');
console.log('empty URL:', scheduleSchema.body.validate({ ...base, meetingUrl: '' }).error?.message || 'OK');
"
```

Expected:
```
with URL: OK
without URL: OK
empty URL: OK
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/validators/interviewValidator.js
git commit -m "feat(interview): allow meetingUrl to be omitted on schedule"
```

---

### Task 10: Wire calendar creation into interviewService.schedule

**Files:**
- Modify: `backend/src/services/interviewService.js`
- Modify: `backend/tests/unit/interviewService.test.js`

- [ ] **Step 1: Write failing tests for the three new behaviours**

Open `backend/tests/unit/interviewService.test.js`. Add these mocks near the top, BEFORE the `require` calls (around line 26):

```js
jest.mock('../../src/repositories/googleIntegrationRepository');
jest.mock('../../src/services/googleCalendarService');
```

Then add these requires after the existing requires (around line 33):

```js
const googleIntegrationRepository = require('../../src/repositories/googleIntegrationRepository');
const googleCalendarService = require('../../src/services/googleCalendarService');
```

Then append this `describe` block to the end of the file:

```js
describe('interviewService.schedule — Google Calendar auto-mode', () => {
  beforeEach(() => jest.clearAllMocks());

  test('uses pasted meetingUrl directly when provided (no calendar call)', async () => {
    candidateRepository.findById.mockResolvedValue(makeCandidate());
    interviewerRepository.findById.mockResolvedValue(makeInterviewer());
    interviewRepository.findOverlapping.mockResolvedValue(null);
    interviewRepository.create.mockResolvedValue(makeInterview({ meetingUrl: 'https://meet.example/x' }));
    interviewRepository.findByIdPopulated.mockResolvedValue(makeInterview({ meetingUrl: 'https://meet.example/x' }));

    await interviewService.schedule({
      candidateId: 'cand001', interviewerId: 'ivwr001',
      scheduledAt: new Date(Date.now() + 86400_000),
      durationMinutes: 45,
      meetingUrl: 'https://meet.example/x',
    }, 'admin001');

    expect(googleCalendarService.createEvent).not.toHaveBeenCalled();
    expect(interviewRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ meetingUrl: 'https://meet.example/x', googleCalendarEventId: undefined }),
    );
  });

  test('auto-mode (no meetingUrl) calls calendar and stores hangoutLink + eventId', async () => {
    candidateRepository.findById.mockResolvedValue(makeCandidate());
    interviewerRepository.findById.mockResolvedValue(makeInterviewer());
    interviewRepository.findOverlapping.mockResolvedValue(null);
    googleIntegrationRepository.findCurrent.mockResolvedValue({ accountEmail: 'a@x.com' });
    googleCalendarService.createEvent.mockResolvedValue({
      id: 'evt-123', hangoutLink: 'https://meet.google.com/abc-def-ghi',
    });
    interviewRepository.create.mockResolvedValue(makeInterview({ meetingUrl: 'https://meet.google.com/abc-def-ghi' }));
    interviewRepository.findByIdPopulated.mockResolvedValue(makeInterview());

    await interviewService.schedule({
      candidateId: 'cand001', interviewerId: 'ivwr001',
      scheduledAt: new Date(Date.now() + 86400_000),
      durationMinutes: 45,
      meetingUrl: '',
    }, 'admin001');

    expect(googleCalendarService.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      summary: expect.stringContaining('Alice'),
      attendees: ['alice@example.com', 'bob@example.com'],
    }));
    expect(interviewRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      meetingUrl: 'https://meet.google.com/abc-def-ghi',
      googleCalendarEventId: 'evt-123',
    }));
  });

  test('auto-mode with no integration throws E_GOOGLE_NOT_CONNECTED', async () => {
    candidateRepository.findById.mockResolvedValue(makeCandidate());
    interviewerRepository.findById.mockResolvedValue(makeInterviewer());
    interviewRepository.findOverlapping.mockResolvedValue(null);
    googleIntegrationRepository.findCurrent.mockResolvedValue(null);

    await expect(interviewService.schedule({
      candidateId: 'cand001', interviewerId: 'ivwr001',
      scheduledAt: new Date(Date.now() + 86400_000),
      durationMinutes: 45,
    }, 'admin001')).rejects.toMatchObject({ code: 'E_GOOGLE_NOT_CONNECTED' });
  });

  test('auto-mode calendar failure throws E_CALENDAR_FAILED', async () => {
    candidateRepository.findById.mockResolvedValue(makeCandidate());
    interviewerRepository.findById.mockResolvedValue(makeInterviewer());
    interviewRepository.findOverlapping.mockResolvedValue(null);
    googleIntegrationRepository.findCurrent.mockResolvedValue({ accountEmail: 'a@x.com' });
    googleCalendarService.createEvent.mockRejectedValue(new Error('network down'));

    await expect(interviewService.schedule({
      candidateId: 'cand001', interviewerId: 'ivwr001',
      scheduledAt: new Date(Date.now() + 86400_000),
      durationMinutes: 45,
    }, 'admin001')).rejects.toMatchObject({ code: 'E_CALENDAR_FAILED' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd backend && npm test -- --testPathPattern interviewService
```

Expected: FAIL — the 4 new tests fail because `schedule` currently always uses the passed-in meetingUrl with no calendar logic.

- [ ] **Step 3: Add the calendar-integration logic to schedule()**

In `backend/src/services/interviewService.js`, near the top with the other requires (around line 9), add:

```js
const googleIntegrationRepository = require('../repositories/googleIntegrationRepository');
const googleCalendarService = require('./googleCalendarService');
```

Then replace the entire `schedule` function (currently lines 263–313) with this version:

```js
const schedule = async (
  { candidateId, interviewerId, scheduledAt, durationMinutes, meetingUrl, notes },
  adminId,
) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.status !== CANDIDATE_STATUS.SHORTLISTED) {
    throw ApiError.conflict('Candidate is not shortlisted', { code: 'E_NOT_SHORTLISTED' });
  }

  const interviewer = await interviewerRepository.findById(interviewerId);
  if (!interviewer) throw ApiError.notFound('Interviewer not found');
  if (!interviewer.isActive) {
    throw ApiError.conflict('Interviewer is inactive', { code: 'E_INTERVIEWER_INACTIVE' });
  }

  const duration = durationMinutes || INTERVIEW_DEFAULT_DURATION_MINUTES;
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + duration * 60_000);

  const overlap = await interviewRepository.findOverlapping({ interviewerId, start, end });
  if (overlap) {
    throw ApiError.conflict('Interviewer has another interview in this window', {
      code: 'E_INTERVIEWER_BUSY',
    });
  }

  // Generate two distinct tokens
  let candidateToken, interviewerToken;
  do {
    candidateToken = generateInterviewToken().token;
    interviewerToken = generateInterviewToken().token;
  } while (candidateToken === interviewerToken);

  // Google Calendar branch — if meetingUrl is empty/null, auto-create the event.
  let finalMeetingUrl = (meetingUrl || '').trim();
  let googleCalendarEventId;
  if (!finalMeetingUrl) {
    const integration = await googleIntegrationRepository.findCurrent();
    if (!integration) {
      throw ApiError.badRequest(
        'Google Calendar is not connected. Connect it in Settings or paste a meeting URL manually.',
        { code: 'E_GOOGLE_NOT_CONNECTED' },
      );
    }
    try {
      const event = await googleCalendarService.createEvent({
        summary: `Interview: ${candidate.name} with ${interviewer.name}`,
        description: notes ? `Notes:\n${notes}` : 'Interview scheduled via the interview management system.',
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        attendees: [candidate.email, interviewer.email],
      });
      finalMeetingUrl = event.hangoutLink;
      googleCalendarEventId = event.id;
    } catch (err) {
      if (err.code === 'E_GOOGLE_NOT_CONNECTED' || err.code === 'E_GOOGLE_TOKEN_REVOKED') {
        throw err;
      }
      logger.error('Google Calendar createEvent failed', { err: err.message });
      throw ApiError.badRequest(
        'Couldn\'t auto-generate the meeting on Google Calendar. Paste a meeting URL manually instead.',
        { code: 'E_CALENDAR_FAILED' },
      );
    }
  }

  const saved = await interviewRepository.create({
    candidate: candidateId,
    interviewer: interviewerId,
    scheduledAt: start,
    durationMinutes: duration,
    meetingUrl: finalMeetingUrl,
    googleCalendarEventId,
    notes: notes || undefined,
    candidateAccessToken: candidateToken,
    interviewerAccessToken: interviewerToken,
    status: INTERVIEW_STATUS.SCHEDULED,
    scheduledBy: adminId,
  });

  queueScheduledEmails(saved);
  const populated = await interviewRepository.findByIdPopulated(saved.id);
  return presentInterview(populated || saved);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd backend && npm test -- --testPathPattern interviewService
```

Expected: PASS — all existing tests plus the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/interviewService.js backend/tests/unit/interviewService.test.js
git commit -m "feat(interview): auto-create Google Calendar event when meetingUrl is omitted"
```

---

### Task 11: Patch calendar event when reschedule is approved

**Files:**
- Modify: `backend/src/services/interviewService.js`
- Modify: `backend/tests/unit/interviewService.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/unit/interviewService.test.js`:

```js
describe('interviewService.decideReschedule — Google Calendar sync', () => {
  beforeEach(() => jest.clearAllMocks());

  test('patches calendar event on approve when googleCalendarEventId is set', async () => {
    const newTime = new Date(Date.now() + 7 * 86400_000);
    const interviewDoc = makeInterview({
      googleCalendarEventId: 'evt-456',
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findById.mockResolvedValue(interviewDoc);
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue({
      _id: 'req1', id: 'req1',
      proposedAt: newTime,
      proposedDurationMinutes: 60,
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findOverlapping.mockResolvedValue(null);
    interviewRepository.findByIdPopulated.mockResolvedValue(interviewDoc);
    googleCalendarService.patchEvent.mockResolvedValue();

    await interviewService.decideReschedule('intv001', { decision: 'approved', note: 'OK' }, 'admin1');

    expect(googleCalendarService.patchEvent).toHaveBeenCalledWith('evt-456', expect.objectContaining({
      startISO: newTime.toISOString(),
    }));
  });

  test('does not call calendar when googleCalendarEventId is null', async () => {
    const interviewDoc = makeInterview({
      googleCalendarEventId: null,
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findById.mockResolvedValue(interviewDoc);
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue({
      _id: 'req1', id: 'req1',
      proposedAt: new Date(Date.now() + 86400_000),
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findOverlapping.mockResolvedValue(null);
    interviewRepository.findByIdPopulated.mockResolvedValue(interviewDoc);

    await interviewService.decideReschedule('intv001', { decision: 'approved' }, 'admin1');

    expect(googleCalendarService.patchEvent).not.toHaveBeenCalled();
  });

  test('calendar failure during approve does not fail the reschedule', async () => {
    const interviewDoc = makeInterview({
      googleCalendarEventId: 'evt-456',
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findById.mockResolvedValue(interviewDoc);
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue({
      _id: 'req1', id: 'req1',
      proposedAt: new Date(Date.now() + 86400_000),
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findOverlapping.mockResolvedValue(null);
    interviewRepository.findByIdPopulated.mockResolvedValue(interviewDoc);
    googleCalendarService.patchEvent.mockRejectedValue(new Error('Calendar 500'));

    const result = await interviewService.decideReschedule('intv001', { decision: 'approved' }, 'admin1');
    expect(result.interview.id).toBe('intv001'); // DB still succeeded
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd backend && npm test -- --testPathPattern interviewService
```

Expected: FAIL — `decideReschedule` doesn't currently call `googleCalendarService.patchEvent`.

- [ ] **Step 3: Add patchEvent call to the approved branch**

In `backend/src/services/interviewService.js`, inside the `decideReschedule` function. Locate the line that reads `await interview.save();` inside the `if (decision === 'approved')` block (around line 437). Right after that line and before `request.status = RESCHEDULE_STATUS.APPROVED;`, insert this block:

```js
    if (interview.googleCalendarEventId) {
      try {
        await googleCalendarService.patchEvent(interview.googleCalendarEventId, {
          startISO: newStart.toISOString(),
          endISO: newEnd.toISOString(),
        });
      } catch (err) {
        logger.error('Google Calendar patchEvent failed', {
          interviewId: interview.id || interview._id,
          eventId: interview.googleCalendarEventId,
          err: err.message,
        });
        // Continue — reschedule already persisted in DB.
      }
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd backend && npm test -- --testPathPattern interviewService
```

Expected: PASS — all existing + new tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/interviewService.js backend/tests/unit/interviewService.test.js
git commit -m "feat(interview): patch Google Calendar event on reschedule approval"
```

---

### Task 12: Delete calendar event on cancel

**Files:**
- Modify: `backend/src/services/interviewService.js`
- Modify: `backend/tests/unit/interviewService.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/unit/interviewService.test.js`:

```js
describe('interviewService.cancel — Google Calendar delete', () => {
  beforeEach(() => jest.clearAllMocks());

  test('deletes calendar event when googleCalendarEventId is set', async () => {
    const doc = makeInterview({
      googleCalendarEventId: 'evt-789',
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findById.mockResolvedValue(doc);
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue(null);
    interviewRepository.findByIdPopulated.mockResolvedValue(doc);
    googleCalendarService.deleteEvent.mockResolvedValue();

    await interviewService.cancel('intv001', { reason: 'no-show' }, 'admin1');

    expect(googleCalendarService.deleteEvent).toHaveBeenCalledWith('evt-789');
  });

  test('does not call calendar when googleCalendarEventId is null', async () => {
    const doc = makeInterview({
      googleCalendarEventId: null,
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findById.mockResolvedValue(doc);
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue(null);
    interviewRepository.findByIdPopulated.mockResolvedValue(doc);

    await interviewService.cancel('intv001', {}, 'admin1');

    expect(googleCalendarService.deleteEvent).not.toHaveBeenCalled();
  });

  test('calendar failure does not block cancel', async () => {
    const doc = makeInterview({
      googleCalendarEventId: 'evt-789',
      save: jest.fn().mockResolvedValue(undefined),
    });
    interviewRepository.findById.mockResolvedValue(doc);
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue(null);
    interviewRepository.findByIdPopulated.mockResolvedValue(doc);
    googleCalendarService.deleteEvent.mockRejectedValue(new Error('Calendar 500'));

    const result = await interviewService.cancel('intv001', {}, 'admin1');
    expect(result.id).toBe('intv001');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd backend && npm test -- --testPathPattern interviewService
```

Expected: FAIL — `cancel` doesn't call deleteEvent yet.

- [ ] **Step 3: Add deleteEvent to cancel()**

In `backend/src/services/interviewService.js`, locate the `cancel` function (around line 464). Find the line `await interview.save();` (around line 488). Right after it, insert:

```js
  if (interview.googleCalendarEventId) {
    try {
      await googleCalendarService.deleteEvent(interview.googleCalendarEventId);
    } catch (err) {
      logger.error('Google Calendar deleteEvent failed', {
        interviewId: interview.id || interview._id,
        eventId: interview.googleCalendarEventId,
        err: err.message,
      });
      // Continue — cancellation already persisted.
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd backend && npm test -- --testPathPattern interviewService
```

Expected: PASS — all tests across the whole interviewService test file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/interviewService.js backend/tests/unit/interviewService.test.js
git commit -m "feat(interview): delete Google Calendar event on cancel"
```

---

### Task 13: Run the full backend test suite as a checkpoint

- [ ] **Step 1: Run all backend tests**

Run:
```bash
cd backend && npm test
```

Expected: all tests pass — none of the existing tests should be broken by these additions. If any unrelated test fails, investigate and fix before moving on.

- [ ] **Step 2: No commit needed** — this is a verification gate, not a change.

---

### Task 14: Frontend — integrationsApi

**Files:**
- Create: `frontend/src/api/integrationsApi.js`

- [ ] **Step 1: Write the API client**

Create `frontend/src/api/integrationsApi.js`:

```js
import { apiClient } from './axios';

export const integrationsApi = {
  googleStatus: () =>
    apiClient.get('/integrations/google/status').then((r) => r.data.data),
  googleConnectUrl: () =>
    apiClient.get('/integrations/google/connect').then((r) => r.data.data.url),
  googleDisconnect: () =>
    apiClient.post('/integrations/google/disconnect').then((r) => r.data.data),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/integrationsApi.js
git commit -m "feat(frontend): add integrationsApi (status, connect URL, disconnect)"
```

---

### Task 15: Frontend — settingsSlice

**Files:**
- Create: `frontend/src/features/settings/settingsSlice.js`

- [ ] **Step 1: Write the slice**

Create `frontend/src/features/settings/settingsSlice.js`:

```js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { integrationsApi } from '@/api/integrationsApi';
import { extractError } from '@/api/axios';

export const fetchGoogleStatus = createAsyncThunk(
  'settings/fetchGoogleStatus',
  async (_, { rejectWithValue }) => {
    try { return await integrationsApi.googleStatus(); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const disconnectGoogle = createAsyncThunk(
  'settings/disconnectGoogle',
  async (_, { rejectWithValue }) => {
    try { return await integrationsApi.googleDisconnect(); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const slice = createSlice({
  name: 'settings',
  initialState: {
    google: {
      configured: false,
      connected: false,
      accountEmail: null,
      connectedAt: null,
    },
    googleLoading: false,
    googleError: null,
  },
  reducers: {
    clearGoogleError(state) { state.googleError = null; },
  },
  extraReducers: (b) => {
    b
      .addCase(fetchGoogleStatus.pending, (s) => { s.googleLoading = true; s.googleError = null; })
      .addCase(fetchGoogleStatus.fulfilled, (s, a) => {
        s.googleLoading = false;
        s.google = { ...s.google, ...a.payload };
      })
      .addCase(fetchGoogleStatus.rejected, (s, a) => {
        s.googleLoading = false;
        s.googleError = a.payload?.message || 'Failed to load Google status';
      })
      .addCase(disconnectGoogle.fulfilled, (s) => {
        s.google = { ...s.google, connected: false, accountEmail: null, connectedAt: null };
      });
  },
});

export const { clearGoogleError } = slice.actions;
export default slice.reducer;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/settingsSlice.js
git commit -m "feat(frontend): add settingsSlice for Google integration status"
```

---

### Task 16: Frontend — register slice in store

**Files:**
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: Wire the reducer**

In `frontend/src/app/store.js`, after the existing imports (around line 16), add:

```js
import settingsReducer from '@/features/settings/settingsSlice';
```

Then inside the `reducer:` object (around line 34), add:

```js
    settings: settingsReducer,
```

The block should look like:

```js
    codingTest: codingTestReducer,
    settings: settingsReducer,
  },
```

- [ ] **Step 2: Verify the build does not error**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build completes successfully (look for `built in` line). Warnings about unused imports are fine.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/store.js
git commit -m "feat(frontend): register settings reducer"
```

---

### Task 17: Frontend — SettingsPage UI

**Files:**
- Create: `frontend/src/features/settings/SettingsPage.jsx`
- Create: `frontend/src/features/settings/SettingsPage.scss`

- [ ] **Step 1: Write the SCSS**

Create `frontend/src/features/settings/SettingsPage.scss`:

```scss
.settings {
  padding: 24px 32px;
  max-width: 900px;

  &__header {
    margin-bottom: 24px;
  }

  &__title {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px;
  }

  &__subtitle {
    color: #64748b;
    font-size: 14px;
  }

  &__section {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 16px;
  }

  &__section-title {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px;
  }

  &__section-sub {
    color: #64748b;
    font-size: 13px;
    margin-bottom: 16px;
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;

    &.is-connected { background: #f0fdf4; border-color: #bbf7d0; }
    &.is-error { background: #fef2f2; border-color: #fecaca; }
  }

  &__status-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #94a3b8;
    .is-connected & { background: #16a34a; }
    .is-error & { background: #dc2626; }
  }

  &__status-text {
    flex: 1;
    font-size: 13.5px;
    color: #0f172a;
    & strong { font-weight: 600; }
  }

  &__actions {
    margin-top: 14px;
    display: flex;
    gap: 10px;
  }

  &__banner {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 12px;

    &--success { background: #f0fdf4; color: #14532d; border: 1px solid #bbf7d0; }
    &--error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  }
}
```

- [ ] **Step 2: Write the SettingsPage component**

Create `frontend/src/features/settings/SettingsPage.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { integrationsApi } from '@/api/integrationsApi';
import { fetchGoogleStatus, disconnectGoogle } from './settingsSlice';
import './SettingsPage.scss';

const QUERY_MESSAGES = {
  connected: { tone: 'success', text: 'Google Calendar connected successfully.' },
  denied: { tone: 'error', text: 'You declined the Google authorization. Try again to connect.' },
  invalid_state: { tone: 'error', text: 'Authorization session expired or was tampered with. Please try again.' },
  no_refresh_token: { tone: 'error', text: 'Google did not return a refresh token. Revoke prior access in your Google Account permissions and reconnect.' },
  exchange_failed: { tone: 'error', text: 'Couldn\'t complete the Google authorization. Please try again.' },
};

export default function SettingsPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const { google, googleLoading, googleError } = useSelector((s) => s.settings);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const banner = useMemo(() => {
    const key = params.get('google');
    return key ? QUERY_MESSAGES[key] : null;
  }, [params]);

  useEffect(() => {
    dispatch(fetchGoogleStatus());
  }, [dispatch]);

  // Clear the ?google=... query param a moment after showing the banner.
  useEffect(() => {
    if (!params.get('google')) return;
    const timer = setTimeout(() => {
      params.delete('google');
      setParams(params, { replace: true });
    }, 5000);
    return () => clearTimeout(timer);
  }, [params, setParams]);

  const onConnect = async () => {
    setConnecting(true);
    try {
      const url = await integrationsApi.googleConnectUrl();
      window.location.href = url;
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Could not start Google authorization' });
      setConnecting(false);
    }
  };

  const onDisconnect = async () => {
    const ok = window.confirm(
      'Disconnect Google Calendar?\n\nExisting interviews keep their meeting links, but new interviews will need a manually pasted URL until you reconnect.',
    );
    if (!ok) return;
    setDisconnecting(true);
    const action = await dispatch(disconnectGoogle());
    setDisconnecting(false);
    if (disconnectGoogle.fulfilled.match(action)) {
      push({ type: 'success', message: 'Google Calendar disconnected' });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed to disconnect' });
    }
  };

  const renderStatus = () => {
    if (!google.configured) {
      return (
        <div className="settings__status is-error">
          <span className="settings__status-dot" />
          <span className="settings__status-text">
            <strong>Not configured.</strong> Google OAuth credentials are missing from the server. Contact your administrator.
          </span>
        </div>
      );
    }
    if (google.connected) {
      return (
        <div className="settings__status is-connected">
          <span className="settings__status-dot" />
          <span className="settings__status-text">
            <strong>Connected</strong> as <code>{google.accountEmail}</code>
            {google.connectedAt && <> · since {new Date(google.connectedAt).toLocaleDateString()}</>}
          </span>
        </div>
      );
    }
    return (
      <div className="settings__status">
        <span className="settings__status-dot" />
        <span className="settings__status-text">
          <strong>Not connected.</strong> Connect a Google account to auto-generate Meet links and send calendar invites.
        </span>
      </div>
    );
  };

  return (
    <div className="settings">
      <header className="settings__header">
        <h1 className="settings__title">Settings</h1>
        <p className="settings__subtitle">Manage integrations and workspace preferences.</p>
      </header>

      {banner && (
        <div className={`settings__banner settings__banner--${banner.tone}`}>{banner.text}</div>
      )}
      {googleError && (
        <div className="settings__banner settings__banner--error">{googleError}</div>
      )}

      <section className="settings__section">
        <h2 className="settings__section-title">Google Calendar</h2>
        <p className="settings__section-sub">
          When connected, scheduling an interview creates a Google Calendar event with an auto-generated Meet link and invites both the candidate and the interviewer.
        </p>

        {googleLoading ? (
          <div className="settings__status"><span className="settings__status-text">Loading…</span></div>
        ) : (
          renderStatus()
        )}

        <div className="settings__actions">
          {google.configured && !google.connected && (
            <Button onClick={onConnect} loading={connecting}>Connect Google Calendar</Button>
          )}
          {google.configured && google.connected && (
            <Button variant="secondary" onClick={onDisconnect} loading={disconnecting}>Disconnect</Button>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/SettingsPage.jsx frontend/src/features/settings/SettingsPage.scss
git commit -m "feat(frontend): add SettingsPage with Google Calendar connect/disconnect"
```

---

### Task 18: Frontend — register route and nav entry

**Files:**
- Modify: `frontend/src/routes/AppRoutes.jsx`
- Modify: `frontend/src/layouts/AdminLayout.jsx`

- [ ] **Step 1: Register the route**

In `frontend/src/routes/AppRoutes.jsx`, after the existing feature imports (around line 33), add:

```jsx
import SettingsPage from '@/features/settings/SettingsPage';
```

Then inside the admin-protected route block (around line 71, near the other admin routes), add:

```jsx
        <Route path="/admin/settings" element={<SettingsPage />} />
```

- [ ] **Step 2: Add nav entry**

In `frontend/src/layouts/AdminLayout.jsx`, modify the `NAV` array (around line 7). Add this entry after the existing entries:

```jsx
  { to: '/admin/settings', label: 'Settings', icon: '⚙' },
```

So the array ends with:
```jsx
  { to: '/coding-problems', label: 'Coding Problems', icon: '⌨' },
  { to: '/admin/review-edit-requests', label: 'Edit requests', icon: '✎' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙' },
];
```

- [ ] **Step 3: Verify the build succeeds**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/AppRoutes.jsx frontend/src/layouts/AdminLayout.jsx
git commit -m "feat(frontend): wire Settings page into admin nav and routes"
```

---

### Task 19: Frontend — Schedule modal mode toggle + fallback

**Files:**
- Modify: `frontend/src/features/interviews/ScheduleInterviewModal.jsx`
- Modify: `frontend/src/features/interviews/ScheduleInterviewModal.scss`

- [ ] **Step 1: Add styles for the mode toggle**

Open `frontend/src/features/interviews/ScheduleInterviewModal.scss` and append this block at the bottom:

```scss
.schedule-form__mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 4px;
}

.schedule-form__mode-btn {
  background: white;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;

  &:hover { border-color: #93c5fd; }
  &.is-on {
    border-color: #2563eb;
    background: #eff6ff;
  }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
}

.schedule-form__mode-title {
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 2px;
}

.schedule-form__mode-sub {
  font-size: 11.5px;
  color: #64748b;
}

.schedule-form__hint {
  font-size: 12px;
  color: #6366f1;
  margin-top: 6px;
  a { color: inherit; text-decoration: underline; }
}
```

- [ ] **Step 2: Rewrite the modal to support both modes**

Replace the entire contents of `frontend/src/features/interviews/ScheduleInterviewModal.jsx` with:

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import DateTimeInput from '@/components/common/DateTimeInput';
import { useToast } from '@/components/common/Toast';
import { useDispatch, useSelector } from 'react-redux';
import { candidateApi } from '@/api/candidateApi';
import { interviewerApi } from '@/api/interviewerApi';
import { fetchGoogleStatus } from '@/features/settings/settingsSlice';
import { scheduleInterview, updateInterview } from './interviewSlice';
import './ScheduleInterviewModal.scss';

const ERROR_MESSAGES = {
  E_NOT_SHORTLISTED: "This candidate isn't shortlisted (so they can't be scheduled)",
  E_INTERVIEWER_INACTIVE: "Interviewer is inactive — re-activate them or pick another",
  E_INTERVIEWER_BUSY: "Interviewer has another interview in this window",
  E_GOOGLE_NOT_CONNECTED: "Google Calendar isn't connected. Paste a meeting URL or connect Google in Settings.",
  E_CALENDAR_FAILED: "Couldn't auto-generate the meeting. Paste a meeting URL manually.",
};

const initialForm = () => ({
  candidateId: '',
  interviewerId: '',
  scheduledAt: '',
  durationMinutes: 45,
  meetingUrl: '',
  notes: '',
});

export default function ScheduleInterviewModal({ open, onClose, initial }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const googleStatus = useSelector((s) => s.settings.google);

  const isEdit = !!initial;

  const [form, setForm] = useState(initialForm);
  const [candidates, setCandidates] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  // Mode: 'auto' (use Google) or 'manual' (paste URL). Forced to 'manual' in edit mode.
  const [mode, setMode] = useState('auto');

  useEffect(() => {
    if (!open) return;
    setFormError('');

    // Fetch Google status when opening (might have changed since app load).
    if (!isEdit) dispatch(fetchGoogleStatus());

    if (isEdit && initial) {
      setForm({
        candidateId: initial.candidate?.id || initial.candidate || '',
        interviewerId: initial.interviewer?.id || initial.interviewer || '',
        scheduledAt: initial.scheduledAt || '',
        durationMinutes: initial.durationMinutes || 45,
        meetingUrl: initial.meetingUrl || '',
        notes: initial.notes || '',
      });
      setMode('manual'); // editing existing — always show the URL field
    } else {
      setForm(initialForm());
    }

    const load = async () => {
      setLoadingData(true);
      try {
        const [cData, iData] = await Promise.all([
          candidateApi.list({ status: 'shortlisted', limit: 100 }),
          interviewerApi.list({ isActive: true, limit: 100 }),
        ]);
        setCandidates(cData.items || []);
        setInterviewers(iData.items || []);
      } catch {
        push({ type: 'error', message: 'Failed to load candidates or interviewers' });
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [open, isEdit, initial, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default mode based on Google status when modal opens fresh (not edit).
  useEffect(() => {
    if (!open || isEdit) return;
    setMode(googleStatus.connected ? 'auto' : 'manual');
  }, [open, isEdit, googleStatus.connected]);

  const handleClose = () => {
    setForm(initialForm());
    setFormError('');
    onClose?.();
  };

  const set = (key) => (val) => {
    if (typeof val === 'object' && val.target) {
      setForm((f) => ({ ...f, [key]: val.target.value }));
    } else {
      setForm((f) => ({ ...f, [key]: val }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.candidateId || !form.interviewerId || !form.scheduledAt) {
      setFormError('Candidate, interviewer, and date/time are required.');
      return;
    }
    if (mode === 'manual') {
      if (!form.meetingUrl) {
        setFormError('Meeting URL is required in manual mode.');
        return;
      }
      if (!/^https?:\/\/.+/.test(form.meetingUrl.trim())) {
        setFormError('Meeting URL must start with http:// or https://');
        return;
      }
    }

    const payload = {
      scheduledAt: form.scheduledAt,
      durationMinutes: Number(form.durationMinutes) || 45,
      notes: form.notes.trim() || undefined,
    };
    if (mode === 'manual') {
      payload.meetingUrl = form.meetingUrl.trim();
    } // else: omit meetingUrl entirely; backend will create event

    if (!isEdit) {
      payload.candidateId = form.candidateId;
      payload.interviewerId = form.interviewerId;
    }

    setBusy(true);
    const action = isEdit
      ? await dispatch(updateInterview({ id: initial.id, payload }))
      : await dispatch(scheduleInterview(payload));
    setBusy(false);

    const matchFn = isEdit ? updateInterview.fulfilled : scheduleInterview.fulfilled;
    if (matchFn.match(action)) {
      push({ type: 'success', message: isEdit ? 'Interview updated' : 'Interview scheduled — invites sent' });
      handleClose();
      return;
    }

    const code = action.payload?.details?.code;
    const msg = ERROR_MESSAGES[code] || action.payload?.message || 'Failed to save interview';
    setFormError(msg);

    // Auto-fall-back to manual mode on Google failures
    if (code === 'E_GOOGLE_NOT_CONNECTED' || code === 'E_GOOGLE_TOKEN_REVOKED' || code === 'E_CALENDAR_FAILED') {
      setMode('manual');
    }
  };

  const autoAvailable = googleStatus.configured && googleStatus.connected;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Edit interview' : 'Schedule interview'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} loading={busy || loadingData}>
            {isEdit ? 'Save changes' : (mode === 'auto' ? 'Schedule with Google Meet' : 'Schedule')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="schedule-form" noValidate>
        {formError && (
          <div className="schedule-form__error">{formError}</div>
        )}

        {loadingData && <p className="schedule-form__loading">Loading candidates and interviewers…</p>}

        {!isEdit && (
          <div className="schedule-form__mode">
            <button
              type="button"
              className={`schedule-form__mode-btn ${mode === 'auto' ? 'is-on' : ''}`}
              onClick={() => setMode('auto')}
              disabled={!autoAvailable}
              title={autoAvailable ? '' : 'Connect Google Calendar in Settings first'}
            >
              <div className="schedule-form__mode-title">⚡ Auto-generate with Google Meet</div>
              <div className="schedule-form__mode-sub">
                {autoAvailable
                  ? 'Creates a Calendar event and sends invites automatically.'
                  : 'Google Calendar not connected.'}
              </div>
            </button>
            <button
              type="button"
              className={`schedule-form__mode-btn ${mode === 'manual' ? 'is-on' : ''}`}
              onClick={() => setMode('manual')}
            >
              <div className="schedule-form__mode-title">✎ Paste meeting URL manually</div>
              <div className="schedule-form__mode-sub">Use any video link — Zoom, Meet, Teams, etc.</div>
            </button>
          </div>
        )}

        {!isEdit && !autoAvailable && googleStatus.configured && (
          <div className="schedule-form__hint">
            Tip: connect Google Calendar from <Link to="/admin/settings">Settings</Link> to auto-generate Meet links.
          </div>
        )}

        <div className="field">
          <span className="field__label">Candidate (shortlisted)</span>
          <select
            className="field__input"
            value={form.candidateId}
            onChange={set('candidateId')}
            disabled={isEdit || loadingData}
            required
          >
            <option value="">— Select candidate —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="field__label">Interviewer (active)</span>
          <select
            className="field__input"
            value={form.interviewerId}
            onChange={set('interviewerId')}
            disabled={isEdit || loadingData}
            required
          >
            <option value="">— Select interviewer —</option>
            {interviewers.map((iv) => (
              <option key={iv.id} value={iv.id}>
                {iv.name}{iv.expertise?.length ? ` · ${iv.expertise.join(', ')}` : ''}
              </option>
            ))}
          </select>
        </div>

        <DateTimeInput
          label="Date & Time"
          value={form.scheduledAt}
          onChange={set('scheduledAt')}
        />

        <Input
          label="Duration (minutes)"
          type="number"
          min="15"
          max="240"
          value={form.durationMinutes}
          onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
          hint="Between 15 and 240 minutes"
        />

        {mode === 'manual' && (
          <Input
            label="Meeting URL"
            type="url"
            value={form.meetingUrl}
            onChange={set('meetingUrl')}
            placeholder="https://meet.google.com/..."
            hint="Must start with https://"
          />
        )}

        <Input
          label="Notes (optional)"
          as="textarea"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Any preparation notes for the interviewer…"
        />
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Verify the build succeeds**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/interviews/ScheduleInterviewModal.jsx frontend/src/features/interviews/ScheduleInterviewModal.scss
git commit -m "feat(frontend): schedule modal — Google Meet auto-gen mode with manual fallback"
```

---

### Task 20: Manual E2E verification

This task has no code changes — it's a checklist of things to confirm in the running app.

- [ ] **Step 1: Boot both servers**

Run in one terminal:
```bash
cd backend && npm run dev
```

Run in another:
```bash
cd frontend && npm run dev
```

Open <http://localhost:5173> and log in as admin.

- [ ] **Step 2: Verify Settings page renders and reports "Not connected"**

Navigate to <http://localhost:5173/admin/settings>. Expected:
- Page renders with a "Google Calendar" section.
- Status: "Not connected".
- "Connect Google Calendar" button is enabled.

- [ ] **Step 3: Run the OAuth flow**

Click "Connect Google Calendar". You should be redirected to Google's consent screen showing the requested scopes (calendar.events, email, profile). Grant access. You should land back on `/admin/settings?google=connected` with:
- A green "Google Calendar connected successfully." banner.
- Status panel now shows "Connected as <your-email>".
- A "Disconnect" button replaces "Connect".

- [ ] **Step 4: Schedule an interview in auto mode**

Pick any shortlisted candidate. Open the Schedule modal — the mode toggle should default to "Auto-generate". Don't fill in any meeting URL. Set date/time, click Schedule.

Expected:
- Modal closes with success toast "Interview scheduled — invites sent".
- Open the new interview's detail page — `meetingUrl` should be a real `https://meet.google.com/...` link.
- Open Google Calendar on the connected account — there's a new event with both candidate and interviewer as attendees, a Meet link, and the description from notes.
- Candidate + interviewer should receive native Google Calendar invitation emails (in addition to the existing custom emails).

- [ ] **Step 5: Approve a reschedule**

From the interviewer view, request a reschedule. Switch to admin and approve. Expected:
- The event time on Google Calendar updates to the new time.
- Both attendees receive a "Event updated" notification from Google.

- [ ] **Step 6: Cancel the interview**

Cancel the interview from the admin Interview detail page. Expected:
- The event disappears from Google Calendar.
- Both attendees receive a Google Calendar cancellation notification.

- [ ] **Step 7: Test disconnect-then-schedule fallback**

Go to Settings, click Disconnect, confirm. Then try scheduling a new interview without a meeting URL. Expected:
- The modal's "Auto-generate" button is disabled (greyed out with tooltip).
- Manual mode is selected by default with a URL input field shown.

- [ ] **Step 8: Test revoked-token fallback**

Reconnect Google. Then go to <https://myaccount.google.com/permissions> and revoke access for this app. Back in the app, try scheduling in auto mode. Expected:
- Schedule fails with the banner "Google Calendar isn't connected. Paste a meeting URL or connect Google in Settings."
- The Settings page now shows "Not connected" (because the backend's `googleCalendarService` cleared the integration on `invalid_grant`).
- The modal auto-switched to manual mode.

- [ ] **Step 9: No commit** — verification only. If any check fails, file a bug task and fix before declaring complete.

---

## Self-review (filled in after writing)

**1. Spec coverage check:**

| Spec section | Plan task(s) |
|---|---|
| §1 Decisions 1-6 | Tasks 4, 5, 10, 11, 12, 17, 19 reflect the choices |
| §2.1 New backend files | Tasks 2 (model), 3 (repo), 4 (auth), 5 (calendar), 6 (controller), 7 (routes) |
| §2.2 Backend modifications | Tasks 7 (routes/index), 8 (Interview model), 9 (validator), 10–12 (interviewService) |
| §2.3 New frontend files | Tasks 14 (api), 15 (slice), 17 (page) |
| §2.4 Backend endpoints | Task 6 (4 handlers) + Task 7 (mount) |
| §2.5 Frontend modifications | Tasks 16 (store), 18 (layout/routes), 19 (modal) |
| §2.6 Dependencies | Task 1 |
| §3.1 Schedule flow | Tasks 10 + 19 |
| §3.2 Reschedule flow | Task 11 |
| §3.3 Cancel flow | Task 12 |
| §3.4 OAuth connect | Tasks 6 + 17 |
| §3.5 Disconnect | Tasks 6 + 17 |
| §3.6 Token refresh | Task 5 (in `getAccessToken`) |
| §4 Data model | Tasks 2, 8 |
| §5 Error matrix | Tasks 4 (codes raised), 6 (callback errors), 10 (E_CALENDAR_FAILED), 19 (UI mapping) |
| §6 Configuration | Task 1 |
| §8 Testing strategy | Tests in Tasks 4, 5, 10, 11, 12, 20 |

**2. Placeholder scan:** No TBDs. Every step has either complete code OR a command with the expected output.

**3. Type/name consistency:**
- `googleCalendarService.createEvent` always takes `{ summary, description, startISO, endISO, attendees }` — same signature in Task 5 implementation, Task 10 caller, Task 5 test.
- `googleCalendarService.patchEvent(eventId, { startISO, endISO })` — same in Task 5 and Task 11.
- `googleCalendarService.deleteEvent(eventId)` — same in Task 5 and Task 12.
- `googleAuthService.refreshAccessToken(refreshToken)` returns `{ accessToken, accessTokenExpiresAt }` — same in Task 4 and Task 5.
- `googleIntegrationRepository.upsert(fields)` — same singleton-upsert API used everywhere.
- Error codes consistent across services and UI: `E_GOOGLE_NOT_CONFIGURED`, `E_GOOGLE_NOT_CONNECTED`, `E_GOOGLE_TOKEN_REVOKED`, `E_GOOGLE_NO_REFRESH_TOKEN`, `E_CALENDAR_FAILED`.

---

## Execution

Plan complete. Recommended next step: invoke superpowers:subagent-driven-development to dispatch one fresh implementer subagent per task, with two-stage review (spec compliance → code quality) between each.
