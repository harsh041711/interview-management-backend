# Phase 3 — Interviewer Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class interviewer portal: HR creates interviewer → magic-link setup → password login → dashboard with past/upcoming interviews → submit 3-dimension star ratings + comments → edit-permission loop with HR → HR Select/Reject moves candidate to final culture-fit round or final rejection.

**Architecture:** Layer interviewer auth on top of existing Admin auth (shared `/login`, role-based JWT). New `Review` and `ReviewEditRequest` models mirror Phase 2 reschedule flow shape. Auto-transition `shortlisted → awaiting_decision` on first review submission. Phase 2 tokenized `/interview/:token` retired for new Round 2s; legacy in-flight kept working.

**Tech Stack:** Node + Express + Mongoose + Joi (backend); React + Vite + Redux Toolkit + React Router + SCSS (frontend); bcrypt (password hashing); nodemailer (existing).

**Reference spec:** [`docs/superpowers/specs/2026-05-07-phase-3-interviewer-portal-design.md`](../specs/2026-05-07-phase-3-interviewer-portal-design.md)

---

## File Structure

### Backend
- **Models** (modify):
  - `backend/src/models/Interviewer.js` — add auth fields
  - `backend/src/models/Candidate.js` — add `experience`, extend status enum
- **Models** (create):
  - `backend/src/models/Review.js`
  - `backend/src/models/ReviewEditRequest.js`
- **Repositories** (create):
  - `backend/src/repositories/reviewRepository.js`
  - `backend/src/repositories/reviewEditRequestRepository.js`
- **Services** (modify):
  - `backend/src/services/authService.js` — login tries Admin then Interviewer
  - `backend/src/services/interviewerService.js` — setup-link generation, send-setup endpoint
  - `backend/src/services/interviewService.js` — schedule email lazy fallback
  - `backend/src/services/candidateService.js` — Select/Reject mutations
  - `backend/src/services/emailService.js` — 9 new send functions
- **Services** (create):
  - `backend/src/services/accountSetupService.js` — token issue, validate, consume
  - `backend/src/services/reviewService.js`
- **Controllers** (modify):
  - `backend/src/controllers/authController.js` — forgot-password, account/setup
  - `backend/src/controllers/interviewerController.js` — sendSetupLink
  - `backend/src/controllers/candidateController.js` — select, reject
- **Controllers** (create):
  - `backend/src/controllers/myInterviewController.js`
  - `backend/src/controllers/reviewController.js`
- **Middlewares** (modify):
  - `backend/src/middlewares/authMiddleware.js` — `requireRole`, role-aware `requireAuth`
- **Middlewares** (create):
  - `backend/src/middlewares/myInterviewMiddleware.js` — ownership guard
- **Routes** (modify):
  - `backend/src/routes/authRoutes.js`
  - `backend/src/routes/candidateRoutes.js`
  - `backend/src/routes/interviewerRoutes.js`
- **Routes** (create):
  - `backend/src/routes/accountRoutes.js`
  - `backend/src/routes/myInterviewRoutes.js`
  - `backend/src/routes/reviewRoutes.js`
  - `backend/src/routes/reviewEditRequestRoutes.js`
- **Utils** (create):
  - `backend/src/utils/setupTokenGenerator.js` — UUID + SHA-256 hash
- **Templates** (create — 9 new):
  - `backend/src/templates/accountSetupEmail.js` (covers initial + forgot-password via `purpose` flag)
  - `backend/src/templates/reviewSubmittedEmail.js`
  - `backend/src/templates/reviewEditedEmail.js`
  - `backend/src/templates/editRequestSubmittedEmail.js`
  - `backend/src/templates/editRequestApprovedEmail.js`
  - `backend/src/templates/editRequestRejectedEmail.js`
  - `backend/src/templates/cultureFitInviteEmail.js`
  - `backend/src/templates/finalRejectionEmail.js`
- **Constants** (modify):
  - `backend/src/utils/constants.js` — add `ROLE`, `REVIEW_EDIT_STATUS`, extend `CANDIDATE_STATUS`
- **Validators** (create/modify):
  - `backend/src/validators/authValidator.js` — forgotPassword, accountSetup
  - `backend/src/validators/reviewValidator.js`
  - `backend/src/validators/reviewEditRequestValidator.js`
  - `backend/src/validators/candidateValidator.js` — select/reject
  - `backend/src/validators/interviewerValidator.js` — sendSetupLink
- **Tests** (create):
  - `backend/tests/unit/setupTokenGenerator.test.js`
  - `backend/tests/unit/reviewService.test.js`
  - `backend/tests/unit/accountSetupService.test.js`
  - `backend/tests/unit/candidateDecision.test.js`
- **Migration** (create):
  - `backend/src/scripts/migratePhase3.js` (registered in `package.json` as `npm run migrate:phase3`)

### Frontend
- **Layouts** (create):
  - `frontend/src/layouts/InterviewerLayout.jsx` + `.scss`
- **Components** (modify):
  - `frontend/src/components/common/ProtectedRoute.jsx` — accept `role` prop
  - `frontend/src/components/common/StatusBadge.jsx` — 3 new candidate statuses
- **Components** (create):
  - `frontend/src/components/common/StarRating.jsx` + `.scss`
- **API clients** (modify):
  - `frontend/src/api/authApi.js` — forgotPassword, accountSetup
  - `frontend/src/api/interviewerApi.js` — sendSetupLink
  - `frontend/src/api/candidateApi.js` — select, reject
- **API clients** (create):
  - `frontend/src/api/accountApi.js`
  - `frontend/src/api/myInterviewApi.js`
  - `frontend/src/api/reviewApi.js`
  - `frontend/src/api/reviewEditRequestApi.js`
- **Features** (modify):
  - `frontend/src/features/auth/authSlice.js` — store `user.role`
  - `frontend/src/features/auth/LoginPage.jsx` — "Forgot password?" link, role-based redirect
- **Features** (create):
  - `frontend/src/features/accountSetup/` (slice, page, scss)
  - `frontend/src/features/forgotPassword/` (slice, page, scss)
  - `frontend/src/features/myInterviews/` (slice, dashboard page, detail page, review form, scss)
  - `frontend/src/features/reviews/` (slice, viewer panel embedded in candidate detail)
  - `frontend/src/features/reviewEditRequests/` (slice, admin list page, scss)
- **Routing** (modify):
  - `frontend/src/App.jsx` — add new routes, role-aware redirect
- **Store** (modify):
  - `frontend/src/app/store.js` — register new slices

---

## Phase 3A — Auth foundation

### Task 1: Constants — add ROLE and extend CANDIDATE_STATUS

**Files:**
- Modify: `backend/src/utils/constants.js`

- [ ] **Step 1: Open file and add new exports**

```js
// Append before module.exports:

const ROLE = Object.freeze({
  ADMIN: 'admin',
  INTERVIEWER: 'interviewer',
});

const REVIEW_EDIT_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const SETUP_TOKEN_PURPOSE = Object.freeze({
  INITIAL_SETUP: 'initial_setup',
  FORGOT_PASSWORD: 'forgot_password',
});

const PASSWORD_MIN_LENGTH = 8;
```

Extend `CANDIDATE_STATUS` to include `AWAITING_DECISION`, `SELECTED_FOR_CULTURE`, `FINAL_REJECTED`. Update `CANDIDATE_STATUS_LIST` accordingly.

Add to `module.exports`: `ROLE`, `REVIEW_EDIT_STATUS`, `SETUP_TOKEN_PURPOSE`, `PASSWORD_MIN_LENGTH`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/utils/constants.js
git commit -m "feat(constants): add ROLE, REVIEW_EDIT_STATUS, extend CANDIDATE_STATUS for phase 3"
```

---

### Task 2: Setup token generator utility

**Files:**
- Create: `backend/src/utils/setupTokenGenerator.js`
- Test: `backend/tests/unit/setupTokenGenerator.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/unit/setupTokenGenerator.test.js
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
```

- [ ] **Step 2: Run the test — should fail (module not found)**

```bash
cd backend && npx jest tests/unit/setupTokenGenerator.test.js
```

- [ ] **Step 3: Implement the utility**

```js
// backend/src/utils/setupTokenGenerator.js
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
```

- [ ] **Step 4: Run the test — should pass**

```bash
cd backend && npx jest tests/unit/setupTokenGenerator.test.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/setupTokenGenerator.js backend/tests/unit/setupTokenGenerator.test.js
git commit -m "feat(utils): add setup token generator with SHA-256 hash + timing-safe verify"
```

---

### Task 3: Interviewer model — auth fields

**Files:**
- Modify: `backend/src/models/Interviewer.js`

- [ ] **Step 1: Add fields to schema**

```js
// Inside the schema definition, after existing fields:

passwordHash: { type: String, default: null, select: false },
passwordSetAt: { type: Date, default: null },
setupTokenHash: { type: String, default: null, index: true },
setupTokenExpiresAt: { type: Date, default: null },
setupTokenPurpose: {
  type: String,
  enum: ['initial_setup', 'forgot_password', null],
  default: null,
},
lastLoginAt: { type: Date, default: null },
```

- [ ] **Step 2: Add `comparePassword` method**

```js
// After schema definition, before model export:

interviewerSchema.methods.comparePassword = async function (plain) {
  if (!this.passwordHash) return false;
  const bcrypt = require('bcrypt');
  return bcrypt.compare(plain, this.passwordHash);
};
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/Interviewer.js
git commit -m "feat(models): add auth fields and comparePassword to Interviewer"
```

---

### Task 4: Account setup service

**Files:**
- Create: `backend/src/services/accountSetupService.js`
- Test: `backend/tests/unit/accountSetupService.test.js`

- [ ] **Step 1: Write the failing test (focus on token-issue + validate paths; password-set covered in integration)**

```js
// backend/tests/unit/accountSetupService.test.js
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
```

- [ ] **Step 2: Run test — should fail (module not found)**

```bash
cd backend && npx jest tests/unit/accountSetupService.test.js
```

- [ ] **Step 3: Implement service**

```js
// backend/src/services/accountSetupService.js
'use strict';

const bcrypt = require('bcrypt');
const interviewerRepository = require('../repositories/interviewerRepository');
const { generateSetupToken, hashSetupToken } = require('../utils/setupTokenGenerator');
const ApiError = require('../utils/ApiError');
const { SETUP_TOKEN_PURPOSE, PASSWORD_MIN_LENGTH } = require('../utils/constants');

const issueToken = async ({ email, purpose }) => {
  const lower = (email || '').toLowerCase().trim();
  const interviewer = await interviewerRepository.findByEmail(lower);

  // Silent success on missing for forgot_password to avoid leaking existence;
  // initial_setup paths are admin-only callers that should know the email exists.
  if (!interviewer) {
    if (purpose === SETUP_TOKEN_PURPOSE.FORGOT_PASSWORD) return { email: lower };
    throw ApiError.notFound('Interviewer not found', { code: 'E_INTERVIEWER_NOT_FOUND' });
  }
  if (!interviewer.isActive) {
    throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
  }

  const { token, tokenHash, expiresAt } = generateSetupToken();
  await interviewerRepository.saveSetupToken(interviewer.id, { tokenHash, expiresAt, purpose });
  return { email: lower, name: interviewer.name, token, expiresAt, purpose };
};

const validateToken = async (rawToken) => {
  if (!rawToken) throw ApiError.gone('Setup link invalid or expired', { code: 'E_SETUP_TOKEN_INVALID' });
  const tokenHash = hashSetupToken(rawToken);
  const interviewer = await interviewerRepository.findBySetupTokenHash(tokenHash);
  if (!interviewer || !interviewer.setupTokenExpiresAt || interviewer.setupTokenExpiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Setup link invalid or expired', { code: 'E_SETUP_TOKEN_INVALID' });
  }
  if (!interviewer.isActive) {
    throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
  }
  return {
    email: interviewer.email,
    name: interviewer.name,
    purpose: interviewer.setupTokenPurpose || SETUP_TOKEN_PURPOSE.INITIAL_SETUP,
  };
};

const consumeTokenAndSetPassword = async (rawToken, plainPassword) => {
  if (!plainPassword || plainPassword.length < PASSWORD_MIN_LENGTH) {
    throw ApiError.badRequest(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, { code: 'E_WEAK_PASSWORD' });
  }
  const tokenHash = hashSetupToken(rawToken);
  const interviewer = await interviewerRepository.findBySetupTokenHash(tokenHash);
  if (!interviewer || !interviewer.setupTokenExpiresAt || interviewer.setupTokenExpiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Setup link invalid or expired', { code: 'E_SETUP_TOKEN_INVALID' });
  }
  if (!interviewer.isActive) {
    throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
  }
  const passwordHash = await bcrypt.hash(plainPassword, 12);
  await interviewerRepository.setPassword(interviewer.id, { passwordHash, passwordSetAt: new Date() });
  return interviewer;
};

module.exports = { issueToken, validateToken, consumeTokenAndSetPassword };
```

- [ ] **Step 4: Run test — should pass**

```bash
cd backend && npx jest tests/unit/accountSetupService.test.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/accountSetupService.js backend/tests/unit/accountSetupService.test.js
git commit -m "feat(auth): account setup service (issue/validate/consume token + bcrypt set password)"
```

---

### Task 5: Interviewer repository — auth methods

**Files:**
- Modify: `backend/src/repositories/interviewerRepository.js`

- [ ] **Step 1: Add the methods**

```js
// Append to existing repository:

const findBySetupTokenHash = (tokenHash) => Interviewer.findOne({ setupTokenHash: tokenHash });

const saveSetupToken = (id, { tokenHash, expiresAt, purpose }) =>
  Interviewer.findByIdAndUpdate(
    id,
    { setupTokenHash: tokenHash, setupTokenExpiresAt: expiresAt, setupTokenPurpose: purpose },
    { new: true },
  );

const setPassword = (id, { passwordHash, passwordSetAt }) =>
  Interviewer.findByIdAndUpdate(
    id,
    {
      passwordHash,
      passwordSetAt,
      setupTokenHash: null,
      setupTokenExpiresAt: null,
      setupTokenPurpose: null,
    },
    { new: true },
  );

const findByEmailWithPassword = (email) =>
  Interviewer.findOne({ email: email.toLowerCase() }).select('+passwordHash');

const updateLastLogin = (id) =>
  Interviewer.findByIdAndUpdate(id, { lastLoginAt: new Date() });
```

Add to `module.exports`: `findBySetupTokenHash`, `saveSetupToken`, `setPassword`, `findByEmailWithPassword`, `updateLastLogin`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/interviewerRepository.js
git commit -m "feat(repo): interviewer auth methods (setup token + password + last login)"
```

---

### Task 6: Account setup email template

**Files:**
- Create: `backend/src/templates/accountSetupEmail.js`

- [ ] **Step 1: Implement template**

```js
// backend/src/templates/accountSetupEmail.js
'use strict';

const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const buildAccountSetupHtml = ({ name, setupUrl, purpose, expiresAt, appName }) => {
  const isReset = purpose === 'forgot_password';
  const headline = isReset ? 'Reset your password' : 'Set up your interviewer account';
  const intro = isReset
    ? `We received a request to reset your password for ${escapeHtml(appName)}.`
    : `HR has invited you to the ${escapeHtml(appName)} interviewer portal. Click below to set your password.`;

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f6f6;margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px">
        <tr><td style="padding:28px 32px;background:#0f172a;color:white;border-top-left-radius:10px;border-top-right-radius:10px">
          <div style="font-size:22px;font-weight:600">${headline}</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.6;color:#222">
          <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
          <p>${intro}</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${escapeHtml(setupUrl)}"
               style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600">
              ${isReset ? 'Reset password' : 'Set my password'}
            </a>
          </div>
          <p style="color:#475569;font-size:13px">Or copy this URL into your browser:</p>
          <code style="display:block;background:#f1f5f9;padding:10px;border-radius:6px;font-size:12px;word-break:break-all">${escapeHtml(setupUrl)}</code>
          <p style="color:#64748b;font-size:13px;margin-top:18px">This link expires at <strong>${new Date(expiresAt).toLocaleString()}</strong>. If you didn't request this, you can safely ignore the email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const buildAccountSetupText = ({ name, setupUrl, purpose, expiresAt, appName }) => {
  const isReset = purpose === 'forgot_password';
  return `Hi ${name},

${isReset
    ? `We received a request to reset your password for ${appName}.`
    : `HR has invited you to the ${appName} interviewer portal.`}

${isReset ? 'Reset your password:' : 'Set your password:'}
${setupUrl}

This link expires at ${new Date(expiresAt).toLocaleString()}.
If you didn't request this, ignore this email.
`;
};

module.exports = { buildAccountSetupHtml, buildAccountSetupText };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/templates/accountSetupEmail.js
git commit -m "feat(email): account setup email template (initial setup + password reset)"
```

---

### Task 7: Email service — `sendAccountSetup`

**Files:**
- Modify: `backend/src/services/emailService.js`

- [ ] **Step 1: Add send function**

```js
// Add import near top with the other template imports:
const { buildAccountSetupHtml, buildAccountSetupText } = require('../templates/accountSetupEmail');

// Add send function:

const sendAccountSetup = async ({ interviewer, setupUrl, purpose, expiresAt }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  if (!interviewer?.email) throw new Error('Interviewer email missing');

  const isReset = purpose === 'forgot_password';
  const subject = isReset ? `Reset your ${env.appName} password` : `Set up your ${env.appName} interviewer account`;
  const html = buildAccountSetupHtml({ name: interviewer.name, setupUrl, purpose, expiresAt, appName: env.appName });
  const text = buildAccountSetupText({ name: interviewer.name, setupUrl, purpose, expiresAt, appName: env.appName });

  const info = await transporter.sendMail({ from: env.smtp.from, to: interviewer.email, subject, text, html });
  logger.info('Account setup email sent', { messageId: info.messageId, to: interviewer.email, purpose });
  return info;
};
```

Add `sendAccountSetup` to `module.exports`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/emailService.js
git commit -m "feat(email): sendAccountSetup function (initial + reset)"
```

---

### Task 8: Auth controller + validator — forgot-password and account/setup

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/validators/authValidator.js`
- Create: `backend/src/routes/accountRoutes.js`
- Modify: `backend/src/routes/index.js` — mount /account
- Modify: `backend/src/routes/authRoutes.js` — add forgot-password

- [ ] **Step 1: Add validators**

```js
// In authValidator.js, append:
const Joi = require('joi');

const forgotPasswordSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().required(),
  }),
};

const accountSetupSchema = {
  body: Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(8).max(200).required(),
  }),
};

const accountSetupTokenParamSchema = {
  params: Joi.object({ token: Joi.string().required() }),
};

module.exports = { ...module.exports, forgotPasswordSchema, accountSetupSchema, accountSetupTokenParamSchema };
```

- [ ] **Step 2: Add controller handlers**

```js
// In authController.js:
const accountSetupService = require('../services/accountSetupService');
const emailService = require('../services/emailService');
const env = require('../config/env');
const jwt = require('../utils/jwt');
const interviewerRepository = require('../repositories/interviewerRepository');

const buildSetupUrl = (token) =>
  `${env.frontendUrl.replace(/\/$/, '')}/account/setup/${token}`;

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await accountSetupService.issueToken({
    email: req.body.email,
    purpose: 'forgot_password',
  });
  if (result.token) {
    setImmediate(async () => {
      try {
        await emailService.sendAccountSetup({
          interviewer: { name: result.name, email: result.email },
          setupUrl: buildSetupUrl(result.token),
          purpose: 'forgot_password',
          expiresAt: result.expiresAt,
        });
      } catch (err) {
        require('../config/logger').error('Forgot-password email failed', { err: err.message });
      }
    });
  }
  return ok(res, { sent: true }, 'If the email exists, a reset link has been sent');
});

const getAccountSetup = asyncHandler(async (req, res) => {
  const data = await accountSetupService.validateToken(req.params.token);
  return ok(res, data, 'Token valid');
});

const postAccountSetup = asyncHandler(async (req, res) => {
  const interviewer = await accountSetupService.consumeTokenAndSetPassword(
    req.body.token, req.body.password,
  );
  await interviewerRepository.updateLastLogin(interviewer.id);
  const token = jwt.sign({ sub: interviewer.id, role: 'interviewer' });
  return ok(res, {
    token,
    user: { id: interviewer.id, name: interviewer.name, email: interviewer.email, role: 'interviewer' },
  }, 'Account ready');
});

module.exports = { ...module.exports, forgotPassword, getAccountSetup, postAccountSetup };
```

- [ ] **Step 3: Wire up routes**

```js
// backend/src/routes/accountRoutes.js
'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const authController = require('../controllers/authController');
const { accountSetupSchema, accountSetupTokenParamSchema } = require('../validators/authValidator');

const router = express.Router();
router.get('/setup/:token', validate(accountSetupTokenParamSchema), authController.getAccountSetup);
router.post('/setup', validate(accountSetupSchema), authController.postAccountSetup);
module.exports = router;
```

```js
// In backend/src/routes/authRoutes.js add:
const { forgotPasswordSchema } = require('../validators/authValidator');
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
```

```js
// In backend/src/routes/index.js add:
const accountRoutes = require('./accountRoutes');
router.use('/account', accountRoutes);
```

- [ ] **Step 4: Manual smoke**

```bash
# Start backend
cd backend && npm run dev
# In another shell:
curl -X POST http://localhost:5000/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"someone@example.com"}'
# Expect 200 with { sent: true } regardless of whether the email exists.
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/validators/authValidator.js backend/src/routes/accountRoutes.js backend/src/routes/authRoutes.js backend/src/routes/index.js
git commit -m "feat(auth): forgot-password + account/setup endpoints"
```

---

### Task 9: Modified auth login — try Admin then Interviewer

**Files:**
- Modify: `backend/src/services/authService.js`

- [ ] **Step 1: Modify login flow**

Change `authService.login` to first try the admin path (existing logic), and on `E_INVALID_CREDENTIALS` or "user not found", retry against the Interviewer collection. Active check applies (interviewer.isActive). On success, return `{ token, user: { id, name, email, role: 'interviewer' } }`.

```js
// Sketch:
const login = async ({ email, password }) => {
  const admin = await adminRepository.findByEmail(email, { withPassword: true });
  if (admin) {
    const ok = await admin.comparePassword(password);
    if (ok) {
      // existing token issuance, set role: 'admin'
      return issueAdminToken(admin);
    }
  }
  const interviewer = await interviewerRepository.findByEmailWithPassword(email);
  if (interviewer) {
    if (!interviewer.isActive) throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
    if (!interviewer.passwordHash) throw ApiError.unauthorized('Account not yet set up', { code: 'E_ACCOUNT_NOT_SET_UP' });
    const ok = await interviewer.comparePassword(password);
    if (ok) {
      await interviewerRepository.updateLastLogin(interviewer.id);
      const token = jwt.sign({ sub: interviewer.id, role: 'interviewer' });
      return { token, user: { id: interviewer.id, name: interviewer.name, email: interviewer.email, role: 'interviewer' } };
    }
  }
  throw ApiError.unauthorized('Invalid credentials', { code: 'E_INVALID_CREDENTIALS' });
};
```

Audit existing `issueAdminToken` (or inline) to set `role: 'admin'` in JWT and the response user.

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/authService.js
git commit -m "feat(auth): login tries Admin then Interviewer; role-aware JWT"
```

---

### Task 10: Auth middleware — `requireRole`

**Files:**
- Modify: `backend/src/middlewares/authMiddleware.js`

- [ ] **Step 1: Add `requireRole` and update `requireAuth` to populate role**

```js
// Inside requireAuth, after decoding the token:
req.user = { id: decoded.sub, role: decoded.role || 'admin' };
// Backwards compat: if a legacy token has no role, default to admin.

// New helper:
const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user || !allowed.includes(req.user.role)) {
    return next(ApiError.forbidden('Forbidden', { code: 'E_FORBIDDEN_ROLE' }));
  }
  next();
};
module.exports.requireRole = requireRole;
```

If existing admin-only routes used `requireAuth`, leave them — but follow up by adding `requireRole('admin')` on every admin-only route in subsequent tasks (done piecemeal where it matters).

- [ ] **Step 2: Commit**

```bash
git add backend/src/middlewares/authMiddleware.js
git commit -m "feat(auth): role-aware requireAuth + requireRole helper"
```

---

### Task 11: Interviewer service — sendSetupLink + invite-on-create flag

**Files:**
- Modify: `backend/src/services/interviewerService.js`
- Modify: `backend/src/controllers/interviewerController.js`
- Modify: `backend/src/routes/interviewerRoutes.js`
- Modify: `backend/src/validators/interviewerValidator.js`

- [ ] **Step 1: Add `sendSetupLink` to service**

```js
// In interviewerService.js:
const accountSetupService = require('./accountSetupService');
const emailService = require('./emailService');
const env = require('../config/env');

const buildSetupUrl = (token) =>
  `${env.frontendUrl.replace(/\/$/, '')}/account/setup/${token}`;

const sendSetupLink = async (id) => {
  const interviewer = await interviewerRepository.findById(id);
  if (!interviewer) throw ApiError.notFound('Interviewer not found');
  const result = await accountSetupService.issueToken({
    email: interviewer.email,
    purpose: 'initial_setup',
  });
  setImmediate(async () => {
    try {
      await emailService.sendAccountSetup({
        interviewer,
        setupUrl: buildSetupUrl(result.token),
        purpose: 'initial_setup',
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      require('../config/logger').error('Setup email failed', { err: err.message });
    }
  });
  return { sentTo: interviewer.email };
};

module.exports = { ...module.exports, sendSetupLink };
```

- [ ] **Step 2: Add `?sendSetup=true` handling to existing `createInterviewer`**

In the controller, after creating, if `req.query.sendSetup === 'true'`, call `interviewerService.sendSetupLink(created.id)` (don't await response time-critical path; can await for simplicity here).

- [ ] **Step 3: Add controller + route + validator**

```js
// interviewerController.js append:
const sendSetupLink = asyncHandler(async (req, res) => {
  const result = await interviewerService.sendSetupLink(req.params.id);
  return ok(res, result, 'Setup link sent');
});

// interviewerRoutes.js add (with requireAuth, requireRole('admin')):
router.post('/:id/send-setup-link', validate(idParamSchema), interviewerController.sendSetupLink);
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/interviewerService.js backend/src/controllers/interviewerController.js backend/src/routes/interviewerRoutes.js backend/src/validators/interviewerValidator.js
git commit -m "feat(interviewer): send-setup-link endpoint + create-with-sendSetup option"
```

---

### Task 12: Interview schedule email — lazy fallback for unactivated interviewer

**Files:**
- Modify: `backend/src/services/emailService.js`
- Modify: `backend/src/services/interviewService.js`
- Modify: `backend/src/templates/interviewScheduledEmail.js`

- [ ] **Step 1: Extend `interviewScheduledEmail` template to accept `setupUrl`**

In the existing template, add an `if (recipient === 'interviewer' && setupUrl)` block that renders an "Activate your account" CTA above the dashboard URL.

- [ ] **Step 2: Modify `interviewService.queueScheduledEmails` to pass setup URL when needed**

```js
// In ensurePopulated branch where we email the interviewer:
let setupUrl = null;
if (!interviewer.passwordHash) {
  const result = await accountSetupService.issueToken({
    email: interviewer.email, purpose: 'initial_setup',
  });
  if (result.token) setupUrl = buildSetupUrl(result.token);
}
await emailService.sendInterviewScheduled({ ..., setupUrl });
```

- [ ] **Step 3: Modify `emailService.sendInterviewScheduled` to forward `setupUrl` to template**

(Add the param, pass to `buildScheduledHtml`/`Text`.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/{emailService,interviewService}.js backend/src/templates/interviewScheduledEmail.js
git commit -m "feat(interview): lazy fallback embeds setup link in interviewer's scheduled email when no password"
```

---

## Phase 3B — Dashboard, Reviews, Edit-loop

### Task 13: Review and ReviewEditRequest models

**Files:**
- Create: `backend/src/models/Review.js`
- Create: `backend/src/models/ReviewEditRequest.js`

- [ ] **Step 1: Create `Review.js`**

```js
'use strict';
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  interview: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true, unique: true },
  interviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
  ratings: {
    knowledge: { type: Number, required: true, min: 1, max: 5 },
    communication: { type: Number, required: true, min: 1, max: 5 },
    confidence: { type: Number, required: true, min: 1, max: 5 },
  },
  comments: { type: String, required: true, minlength: 10, maxlength: 2000, trim: true },
  submittedAt: { type: Date, default: Date.now },
  lastEditedAt: { type: Date, default: null },
  editCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true },
}, { timestamps: true });

reviewSchema.virtual('averageRating').get(function () {
  const r = this.ratings;
  return Math.round(((r.knowledge + r.communication + r.confidence) / 3) * 10) / 10;
});

reviewSchema.set('toJSON', { virtuals: true, transform: (_d, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Review', reviewSchema);
```

- [ ] **Step 2: Create `ReviewEditRequest.js`**

```js
'use strict';
const mongoose = require('mongoose');
const { REVIEW_EDIT_STATUS } = require('../utils/constants');

const reviewEditRequestSchema = new mongoose.Schema({
  review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true, index: true },
  interviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true },
  reason: { type: String, default: null, maxlength: 1000 },
  status: { type: String, enum: Object.values(REVIEW_EDIT_STATUS), default: REVIEW_EDIT_STATUS.PENDING, index: true },
  consumed: { type: Boolean, default: false },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: null },
}, { timestamps: true });

// Partial unique index: at most one pending request per review
reviewEditRequestSchema.index(
  { review: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: REVIEW_EDIT_STATUS.PENDING } },
);

module.exports = mongoose.model('ReviewEditRequest', reviewEditRequestSchema);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/Review.js backend/src/models/ReviewEditRequest.js
git commit -m "feat(models): Review and ReviewEditRequest with partial unique pending index"
```

---

### Task 14: Review repository

**Files:**
- Create: `backend/src/repositories/reviewRepository.js`

- [ ] **Step 1: Implement repository**

```js
'use strict';
const Review = require('../models/Review');

const create = (data) => Review.create(data);
const findById = (id) => Review.findById(id).populate('candidate').populate('interviewer');
const findByIdRaw = (id) => Review.findById(id);
const findByInterview = (interviewId) => Review.findOne({ interview: interviewId });
const findByCandidate = (candidateId) => Review.findOne({ candidate: candidateId }).populate('interviewer');
const updateById = (id, patch) => Review.findByIdAndUpdate(id, patch, { new: true });

module.exports = { create, findById, findByIdRaw, findByInterview, findByCandidate, updateById };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/reviewRepository.js
git commit -m "feat(repo): reviewRepository"
```

---

### Task 15: ReviewEditRequest repository

**Files:**
- Create: `backend/src/repositories/reviewEditRequestRepository.js`

- [ ] **Step 1: Implement repository**

```js
'use strict';
const ReviewEditRequest = require('../models/ReviewEditRequest');
const { REVIEW_EDIT_STATUS } = require('../utils/constants');

const create = (data) => ReviewEditRequest.create(data);
const findById = (id) => ReviewEditRequest.findById(id).populate({ path: 'review', populate: ['candidate', 'interviewer'] });
const findPendingForReview = (reviewId) =>
  ReviewEditRequest.findOne({ review: reviewId, status: REVIEW_EDIT_STATUS.PENDING });
const findApprovedNotConsumed = (reviewId) =>
  ReviewEditRequest.findOne({ review: reviewId, status: REVIEW_EDIT_STATUS.APPROVED, consumed: false });
const findHistory = (reviewId) =>
  ReviewEditRequest.find({ review: reviewId }).sort({ createdAt: -1 });
const list = async ({ page = 1, limit = 20, status } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    ReviewEditRequest.find(filter)
      .populate({ path: 'review', populate: ['candidate', 'interviewer'] })
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    ReviewEditRequest.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};
const updateById = (id, patch) => ReviewEditRequest.findByIdAndUpdate(id, patch, { new: true });

module.exports = { create, findById, findPendingForReview, findApprovedNotConsumed, findHistory, list, updateById };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/reviewEditRequestRepository.js
git commit -m "feat(repo): reviewEditRequestRepository"
```

---

### Task 16: Review service (submit, edit, edit-request, decide)

**Files:**
- Create: `backend/src/services/reviewService.js`
- Test: `backend/tests/unit/reviewService.test.js`

- [ ] **Step 1: Write failing test scaffolding**

```js
// reviewService.test.js — sketch covering: submit guard (interview must be completed),
// duplicate prevention, candidate auto-transition, edit guard (no approval, approval consumed),
// editRequest pending duplicate guard.
// (Mock all repositories.)
```

- [ ] **Step 2: Implement service**

```js
'use strict';
const reviewRepository = require('../repositories/reviewRepository');
const editRequestRepository = require('../repositories/reviewEditRequestRepository');
const interviewRepository = require('../repositories/interviewRepository');
const candidateRepository = require('../repositories/candidateRepository');
const emailService = require('./emailService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { CANDIDATE_STATUS, INTERVIEW_STATUS, REVIEW_EDIT_STATUS } = require('../utils/constants');

const submit = async ({ interviewId, interviewerId, ratings, comments }) => {
  const interview = await interviewRepository.findByIdPopulated(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');
  if (String(interview.interviewer._id || interview.interviewer) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your interview', { code: 'E_FORBIDDEN' });
  }
  if (interview.status !== INTERVIEW_STATUS.COMPLETED) {
    throw ApiError.conflict('Interview must be completed first', { code: 'E_INTERVIEW_NOT_COMPLETED' });
  }
  const existing = await reviewRepository.findByInterview(interviewId);
  if (existing) throw ApiError.conflict('Review already submitted', { code: 'E_REVIEW_EXISTS' });

  const review = await reviewRepository.create({
    interview: interviewId,
    interviewer: interviewerId,
    candidate: interview.candidate._id || interview.candidate,
    ratings,
    comments,
    submittedAt: new Date(),
    createdBy: interviewerId,
  });

  // Auto-transition: shortlisted → awaiting_decision
  const candidate = await candidateRepository.findById(review.candidate);
  if (candidate && candidate.status === CANDIDATE_STATUS.SHORTLISTED) {
    candidate.status = CANDIDATE_STATUS.AWAITING_DECISION;
    await candidate.save();
  }

  // Fire HR email
  setImmediate(async () => {
    try {
      await emailService.sendReviewSubmitted({ review, candidate, interviewer: interview.interviewer });
    } catch (err) { logger.error('Review submitted email failed', { err: err.message }); }
  });

  return review;
};

const edit = async ({ reviewId, interviewerId, ratings, comments }) => {
  const review = await reviewRepository.findByIdRaw(reviewId);
  if (!review) throw ApiError.notFound('Review not found');
  if (String(review.interviewer) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your review', { code: 'E_FORBIDDEN' });
  }
  const approval = await editRequestRepository.findApprovedNotConsumed(reviewId);
  if (!approval) {
    throw ApiError.forbidden('Edit not approved', { code: 'E_EDIT_NOT_APPROVED' });
  }
  if (ratings) review.ratings = ratings;
  if (comments) review.comments = comments;
  review.editCount += 1;
  review.lastEditedAt = new Date();
  await review.save();

  approval.consumed = true;
  await approval.save();

  // Fire HR email
  setImmediate(async () => {
    try {
      const populated = await reviewRepository.findById(reviewId);
      await emailService.sendReviewEdited({
        review: populated,
        candidate: populated.candidate,
        interviewer: populated.interviewer,
      });
    } catch (err) { logger.error('Review edited email failed', { err: err.message }); }
  });
  return review;
};

const requestEdit = async ({ reviewId, interviewerId, reason }) => {
  const review = await reviewRepository.findByIdRaw(reviewId);
  if (!review) throw ApiError.notFound('Review not found');
  if (String(review.interviewer) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your review', { code: 'E_FORBIDDEN' });
  }
  const pending = await editRequestRepository.findPendingForReview(reviewId);
  if (pending) throw ApiError.conflict('Edit request pending', { code: 'E_EDIT_REQUEST_PENDING' });
  const request = await editRequestRepository.create({
    review: reviewId, interviewer: interviewerId, reason: reason || null,
    status: REVIEW_EDIT_STATUS.PENDING,
  });
  setImmediate(async () => {
    try {
      const populated = await editRequestRepository.findById(request.id);
      await emailService.sendEditRequestSubmitted({ request: populated });
    } catch (err) { logger.error('Edit-request email failed', { err: err.message }); }
  });
  return request;
};

const decideEdit = async ({ requestId, decision, note, adminId }) => {
  const request = await editRequestRepository.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');
  if (request.status !== REVIEW_EDIT_STATUS.PENDING) {
    throw ApiError.conflict('Request already decided', { code: 'E_ALREADY_DECIDED' });
  }
  const updated = await editRequestRepository.updateById(requestId, {
    status: decision, decidedBy: adminId, decidedAt: new Date(), decisionNote: note || null,
  });
  setImmediate(async () => {
    try {
      const populated = await editRequestRepository.findById(updated.id);
      if (decision === REVIEW_EDIT_STATUS.APPROVED) {
        await emailService.sendEditRequestApproved({ request: populated });
      } else {
        await emailService.sendEditRequestRejected({ request: populated });
      }
    } catch (err) { logger.error('Edit decision email failed', { err: err.message }); }
  });
  return updated;
};

module.exports = { submit, edit, requestEdit, decideEdit };
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/reviewService.js backend/tests/unit/reviewService.test.js
git commit -m "feat(review): submit/edit/request/decide service with auto-transition + emails"
```

---

### Task 17: Email service — review-related sends (5 functions)

**Files:**
- Create: 5 templates under `backend/src/templates/`
- Modify: `backend/src/services/emailService.js`

- [ ] **Step 1: Create the 5 templates**

`reviewSubmittedEmail.js` — to HR, includes ratings + average + comments + candidate name.
`reviewEditedEmail.js` — to HR, similar with "(Updated)" badge and editCount.
`editRequestSubmittedEmail.js` — to HR, includes interviewer name + reason + admin URL to /admin/review-edit-requests.
`editRequestApprovedEmail.js` — to interviewer, "You can now edit your review."
`editRequestRejectedEmail.js` — to interviewer, "Your edit request was not approved."

Each follows the existing template pattern (escapeHtml, table layout). Keep concise.

- [ ] **Step 2: Add 5 send functions in emailService.js**

```js
const sendReviewSubmitted = async ({ review, candidate, interviewer }) => { /* ... */ };
const sendReviewEdited = async ({ review, candidate, interviewer }) => { /* ... */ };
const sendEditRequestSubmitted = async ({ request }) => { /* uses resolveHrEmail */ };
const sendEditRequestApproved = async ({ request }) => { /* to interviewer */ };
const sendEditRequestRejected = async ({ request }) => { /* to interviewer */ };
```

Add all to module.exports.

- [ ] **Step 3: Commit**

```bash
git add backend/src/templates/{reviewSubmittedEmail,reviewEditedEmail,editRequestSubmittedEmail,editRequestApprovedEmail,editRequestRejectedEmail}.js backend/src/services/emailService.js
git commit -m "feat(email): 5 review-related email senders + templates"
```

---

### Task 18: My-interview controller + route + middleware

**Files:**
- Create: `backend/src/controllers/myInterviewController.js`
- Create: `backend/src/routes/myInterviewRoutes.js`
- Create: `backend/src/middlewares/myInterviewMiddleware.js`
- Modify: `backend/src/routes/index.js` — mount `/me/interviews`

- [ ] **Step 1: Implement ownership middleware**

```js
// backend/src/middlewares/myInterviewMiddleware.js
'use strict';
const interviewRepository = require('../repositories/interviewRepository');
const ApiError = require('../utils/ApiError');

const requireMyInterview = async (req, _res, next) => {
  try {
    const interview = await interviewRepository.findByIdPopulated(req.params.id);
    if (!interview) throw ApiError.notFound('Interview not found');
    if (String(interview.interviewer._id || interview.interviewer) !== String(req.user.id)) {
      throw ApiError.forbidden('Not your interview', { code: 'E_FORBIDDEN' });
    }
    req.interview = interview;
    next();
  } catch (err) { next(err); }
};

module.exports = { requireMyInterview };
```

- [ ] **Step 2: Implement controller**

```js
// myInterviewController.js
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const interviewRepository = require('../repositories/interviewRepository');
const reviewRepository = require('../repositories/reviewRepository');
const editRequestRepository = require('../repositories/reviewEditRequestRepository');
const reviewService = require('../services/reviewService');
const { INTERVIEW_STATUS } = require('../utils/constants');

const list = asyncHandler(async (req, res) => {
  const all = await interviewRepository.list({ interviewerId: req.user.id, limit: 200 });
  const upcoming = [], past = [];
  for (const i of all.items) {
    if ([INTERVIEW_STATUS.SCHEDULED, INTERVIEW_STATUS.RESCHEDULE_REQUESTED].includes(i.status)) {
      upcoming.push(i);
    } else {
      past.push(i);
    }
  }
  // Annotate past with review state
  const enriched = await Promise.all(past.map(async (i) => {
    const review = await reviewRepository.findByInterview(i._id || i.id);
    const pending = review ? await editRequestRepository.findPendingForReview(review._id) : null;
    return { ...i.toObject(), reviewSubmitted: !!review, pendingEditRequest: pending };
  }));
  return ok(res, { upcoming, past: enriched }, 'OK');
});

const detail = asyncHandler(async (req, res) => {
  const review = await reviewRepository.findByInterview(req.interview.id);
  const pending = review ? await editRequestRepository.findPendingForReview(review._id) : null;
  const approved = review ? await editRequestRepository.findApprovedNotConsumed(review._id) : null;
  return ok(res, {
    interview: req.interview,
    review,
    pendingEditRequest: pending,
    canEdit: !!approved,
  }, 'OK');
});

const submitReview = asyncHandler(async (req, res) => {
  const review = await reviewService.submit({
    interviewId: req.params.id,
    interviewerId: req.user.id,
    ratings: req.body.ratings,
    comments: req.body.comments,
  });
  return ok(res, { review }, 'Review submitted');
});

const editReview = asyncHandler(async (req, res) => {
  const review = await reviewService.edit({
    reviewId: req.params.reviewId,
    interviewerId: req.user.id,
    ratings: req.body.ratings,
    comments: req.body.comments,
  });
  return ok(res, { review }, 'Review updated');
});

const requestEdit = asyncHandler(async (req, res) => {
  const request = await reviewService.requestEdit({
    reviewId: req.params.reviewId,
    interviewerId: req.user.id,
    reason: req.body.reason,
  });
  return ok(res, { request }, 'Edit requested');
});

module.exports = { list, detail, submitReview, editReview, requestEdit };
```

- [ ] **Step 3: Implement routes**

```js
// myInterviewRoutes.js
const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { requireMyInterview } = require('../middlewares/myInterviewMiddleware');
const ctrl = require('../controllers/myInterviewController');
const { idParamSchema } = require('../validators/interviewValidator');
const { reviewSubmitSchema, reviewEditSchema, editRequestSchema } = require('../validators/reviewValidator');

const router = express.Router();
router.use(requireAuth, requireRole('interviewer'));
router.get('/interviews', ctrl.list);
router.get('/interviews/:id', validate(idParamSchema), requireMyInterview, ctrl.detail);
router.post('/interviews/:id/review', validate({ ...idParamSchema, ...reviewSubmitSchema }), requireMyInterview, ctrl.submitReview);
router.patch('/reviews/:reviewId', validate(reviewEditSchema), ctrl.editReview);
router.post('/reviews/:reviewId/edit-request', validate(editRequestSchema), ctrl.requestEdit);

module.exports = router;
```

Mount in `routes/index.js`: `router.use('/me', myInterviewRoutes);`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/myInterviewController.js backend/src/routes/myInterviewRoutes.js backend/src/middlewares/myInterviewMiddleware.js backend/src/routes/index.js backend/src/validators/reviewValidator.js
git commit -m "feat(interviewer): /me/interviews and review submit/edit/request endpoints"
```

---

### Task 19: Review-edit-request admin routes

**Files:**
- Create: `backend/src/routes/reviewEditRequestRoutes.js`
- Modify: `backend/src/controllers/reviewController.js` (or new controller)

- [ ] **Step 1: Implement controller actions**

```js
// reviewEditRequestController.js
const list = asyncHandler(async (req, res) => {
  const result = await editRequestRepository.list(req.query);
  return ok(res, result, 'OK');
});
const decide = asyncHandler(async (req, res) => {
  const updated = await reviewService.decideEdit({
    requestId: req.params.id, decision: req.body.decision, note: req.body.note, adminId: req.user.id,
  });
  return ok(res, { request: updated }, 'Decided');
});
```

- [ ] **Step 2: Routes (admin only)**

```js
const router = express.Router();
router.use(requireAuth, requireRole('admin'));
router.get('/', validate(listSchema), ctrl.list);
router.post('/:id/decide', validate(decideSchema), ctrl.decide);
```

Mount at `/review-edit-requests`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/reviewEditRequestController.js backend/src/routes/reviewEditRequestRoutes.js backend/src/validators/reviewEditRequestValidator.js backend/src/routes/index.js
git commit -m "feat(admin): review-edit-request list + decide endpoints"
```

---

### Task 20: Reviews admin read endpoints

**Files:**
- Create: `backend/src/routes/reviewRoutes.js`
- Create: `backend/src/controllers/reviewController.js`

- [ ] **Step 1: Controller**

```js
const getByCandidate = asyncHandler(async (req, res) => {
  const review = await reviewRepository.findByCandidate(req.query.candidate);
  if (!review) return ok(res, { review: null }, 'OK');
  const history = await editRequestRepository.findHistory(review.id);
  return ok(res, { review, history }, 'OK');
});

const getOne = asyncHandler(async (req, res) => {
  const review = await reviewRepository.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  const history = await editRequestRepository.findHistory(review.id);
  return ok(res, { review, history }, 'OK');
});
```

- [ ] **Step 2: Routes (admin)**

```js
router.use(requireAuth, requireRole('admin'));
router.get('/', validate(listByCandidateSchema), ctrl.getByCandidate);
router.get('/:id', validate(idParamSchema), ctrl.getOne);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/{routes/reviewRoutes,controllers/reviewController}.js backend/src/routes/index.js
git commit -m "feat(admin): reviews read endpoints (by candidate + by id with history)"
```

---

## Phase 3C — HR Final Decision

### Task 21: Candidate select/reject service + endpoints

**Files:**
- Modify: `backend/src/services/candidateService.js`
- Modify: `backend/src/controllers/candidateController.js`
- Modify: `backend/src/routes/candidateRoutes.js`
- Modify: `backend/src/validators/candidateValidator.js`
- Test: `backend/tests/unit/candidateDecision.test.js`

- [ ] **Step 1: Write failing test**

```js
// candidateDecision.test.js — guards: must be awaiting_decision, must have a review.
// Mocks reviewRepository, candidateRepository, emailService.
```

- [ ] **Step 2: Add `select` and `reject` to service**

```js
const select = async (id) => {
  const c = await candidateRepository.findById(id);
  if (!c) throw ApiError.notFound('Candidate not found');
  if (c.status !== CANDIDATE_STATUS.AWAITING_DECISION) {
    throw ApiError.conflict('Candidate not awaiting decision', { code: 'E_BAD_STATUS' });
  }
  const review = await reviewRepository.findByCandidate(id);
  if (!review) throw ApiError.conflict('No review yet', { code: 'E_NO_REVIEW' });
  c.status = CANDIDATE_STATUS.SELECTED_FOR_CULTURE;
  await c.save();
  setImmediate(async () => {
    try { await emailService.sendCultureFitInvite({ candidate: c }); }
    catch (err) { logger.error('Culture-fit email failed', { err: err.message }); }
  });
  return presentCandidate(c);
};

const reject = async (id, { note } = {}) => {
  const c = await candidateRepository.findById(id);
  if (!c) throw ApiError.notFound('Candidate not found');
  if (c.status !== CANDIDATE_STATUS.AWAITING_DECISION) {
    throw ApiError.conflict('Candidate not awaiting decision', { code: 'E_BAD_STATUS' });
  }
  const review = await reviewRepository.findByCandidate(id);
  if (!review) throw ApiError.conflict('No review yet', { code: 'E_NO_REVIEW' });
  c.status = CANDIDATE_STATUS.FINAL_REJECTED;
  await c.save();
  setImmediate(async () => {
    try { await emailService.sendFinalRejection({ candidate: c, note: note || null }); }
    catch (err) { logger.error('Final rejection email failed', { err: err.message }); }
  });
  return presentCandidate(c);
};
```

- [ ] **Step 3: Controller + routes**

```js
// controller:
const selectCandidate = asyncHandler(async (req, res) => {
  const c = await candidateService.select(req.params.id);
  return ok(res, { candidate: c }, 'Candidate selected');
});
const rejectCandidate = asyncHandler(async (req, res) => {
  const c = await candidateService.reject(req.params.id, req.body);
  return ok(res, { candidate: c }, 'Candidate rejected');
});

// routes:
router.post('/:id/select', validate(idParamSchema), candidateController.selectCandidate);
router.post('/:id/reject', validate(rejectSchema), candidateController.rejectCandidate);
```

- [ ] **Step 4: Add 2 email templates + 2 send functions**

`cultureFitInviteEmail.js` and `finalRejectionEmail.js`. Add `sendCultureFitInvite` and `sendFinalRejection` in emailService.

- [ ] **Step 5: Commit**

```bash
git add backend/src/{services,controllers,routes,validators}/{candidate,email}* backend/src/templates/{cultureFitInvite,finalRejection}Email.js backend/tests/unit/candidateDecision.test.js
git commit -m "feat(candidate): HR Select/Reject endpoints + culture-fit invite + final rejection emails"
```

---

### Task 22: Migration script

**Files:**
- Create: `backend/src/scripts/migratePhase3.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Create script**

```js
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../config/env');

async function run() {
  await mongoose.connect(env.mongoUri);
  const Candidate = require('../models/Candidate');
  const Question = require('../models/Question');

  const c = await Candidate.updateMany(
    { experience: { $in: [null, undefined] } },
    { $set: { experience: 'mid' } },
  );
  const q = await Question.updateMany(
    { experience: { $in: [null, undefined] } },
    { $set: { experience: 'any' } },
  );
  const t = await Question.updateMany(
    { timesUsed: { $in: [null, undefined] } },
    { $set: { timesUsed: 0 } },
  );
  console.log(`Backfilled ${c.modifiedCount} candidates, ${q.modifiedCount} questions (experience), ${t.modifiedCount} questions (timesUsed)`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Add npm script**

```json
"migrate:phase3": "node src/scripts/migratePhase3.js"
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/scripts/migratePhase3.js backend/package.json
git commit -m "feat(migration): phase 3 backfill script (experience defaults + timesUsed init)"
```

---

## Phase 3 Frontend

### Task 23: ProtectedRoute role support + StatusBadge

**Files:**
- Modify: `frontend/src/components/common/ProtectedRoute.jsx`
- Modify: `frontend/src/components/common/StatusBadge.jsx`

- [ ] **Step 1: Extend ProtectedRoute**

```jsx
export default function ProtectedRoute({ children, role }) {
  const user = useSelector((s) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  return children;
}
```

- [ ] **Step 2: Add new candidate statuses to StatusBadge**

In `VARIANTS` add: `awaiting_decision: 'warn'`, `selected_for_culture: 'success'`, `final_rejected: 'danger'`.
In `LABELS` add: `'Awaiting decision'`, `'Selected — culture round'`, `'Rejected (final)'`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/ProtectedRoute.jsx frontend/src/components/common/StatusBadge.jsx
git commit -m "feat(common): ProtectedRoute role guard + 3 phase-3 candidate statuses"
```

---

### Task 24: StarRating component

**Files:**
- Create: `frontend/src/components/common/StarRating.jsx` + `.scss`

- [ ] **Step 1: Implement**

```jsx
import './StarRating.scss';

export default function StarRating({ value = 0, onChange, readOnly = false, label }) {
  return (
    <div className="star-rating">
      {label && <span className="star-rating__label">{label}</span>}
      <div className="star-rating__row" role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star-rating__star ${value >= n ? 'is-on' : ''}`}
            onClick={() => !readOnly && onChange?.(n)}
            disabled={readOnly}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            role="radio"
            aria-checked={value === n}
          >★</button>
        ))}
        <span className="star-rating__value">{value || '—'}/5</span>
      </div>
    </div>
  );
}
```

SCSS: gold stars with hover bump. Keep concise.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/common/StarRating.{jsx,scss}
git commit -m "feat(common): StarRating component (1-5, click to set, accessible)"
```

---

### Task 25: Auth slice — store role + login redirect

**Files:**
- Modify: `frontend/src/features/auth/authSlice.js`
- Modify: `frontend/src/features/auth/LoginPage.jsx`
- Modify: `frontend/src/api/authApi.js`

- [ ] **Step 1: Slice**

Ensure `state.user = { id, name, email, role }` after login (`role` should be in the API response).

- [ ] **Step 2: LoginPage redirect**

```jsx
useEffect(() => {
  if (loginStatus === 'succeeded' && user) {
    navigate(user.role === 'interviewer' ? '/interviewer/dashboard' : '/dashboard', { replace: true });
  }
}, [loginStatus, user, navigate]);
```

Add a "Forgot password?" link below the form linking to `/forgot-password`.

- [ ] **Step 3: API**

Add `forgotPassword(email)` to `authApi.js`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/auth/{authSlice,LoginPage}.{jsx,js} frontend/src/api/authApi.js
git commit -m "feat(auth): store role on login + role-based redirect + forgot password link"
```

---

### Task 26: Forgot password page + API

**Files:**
- Create: `frontend/src/features/forgotPassword/ForgotPasswordPage.jsx` + `.scss`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Page**

Simple form: email input + submit. Calls `authApi.forgotPassword(email)`. On success show "If the email exists, a reset link has been sent."

- [ ] **Step 2: Route**

In App.jsx add `<Route path="/forgot-password" element={<ForgotPasswordPage />} />` inside the public/auth section.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/forgotPassword/* frontend/src/App.jsx
git commit -m "feat(auth): /forgot-password page"
```

---

### Task 27: Account setup page + API + slice

**Files:**
- Create: `frontend/src/api/accountApi.js`
- Create: `frontend/src/features/accountSetup/{accountSetupSlice,SetupPasswordPage}.{js,jsx}` + `.scss`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: API**

```js
export const accountApi = {
  validateToken: (token) => apiClient.get(`/account/setup/${token}`).then((r) => r.data.data),
  setup: ({ token, password }) => apiClient.post('/account/setup', { token, password }).then((r) => r.data.data),
};
```

- [ ] **Step 2: Slice with two thunks (`validateSetupToken`, `submitSetup`).**

- [ ] **Step 3: SetupPasswordPage**

On mount, dispatch `validateSetupToken(token)`. If 410, render an error card with "Request a new link" button to `/forgot-password`. On success, render password + confirm form. On submit, dispatch `submitSetup` → on success persist token + user + redirect to `/interviewer/dashboard`.

Headline copy adapts based on `purpose`:
- `initial_setup`: "Welcome — set your password"
- `forgot_password`: "Reset your password"

- [ ] **Step 4: Route + store**

```jsx
<Route path="/account/setup/:token" element={<SetupPasswordPage />} />
```

Register `accountSetup` reducer in store.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/accountApi.js frontend/src/features/accountSetup/* frontend/src/App.jsx frontend/src/app/store.js
git commit -m "feat(auth): /account/setup/:token page (initial setup + reset)"
```

---

### Task 28: InterviewerLayout

**Files:**
- Create: `frontend/src/layouts/InterviewerLayout.jsx` + `.scss`

- [ ] **Step 1: Implement**

Mirrors AdminLayout shape but with sidebar items: Dashboard (`/interviewer/dashboard`), and a Logout button in header. Show user's name from `state.auth.user`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/layouts/InterviewerLayout.{jsx,scss}
git commit -m "feat(layout): InterviewerLayout"
```

---

### Task 29: My-interviews API + slice

**Files:**
- Create: `frontend/src/api/myInterviewApi.js`
- Create: `frontend/src/features/myInterviews/myInterviewsSlice.js`
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: API**

```js
export const myInterviewApi = {
  list: () => apiClient.get('/me/interviews').then((r) => r.data.data),
  detail: (id) => apiClient.get(`/me/interviews/${id}`).then((r) => r.data.data),
  submitReview: (id, payload) => apiClient.post(`/me/interviews/${id}/review`, payload).then((r) => r.data.data),
  editReview: (reviewId, payload) => apiClient.patch(`/me/reviews/${reviewId}`, payload).then((r) => r.data.data),
  requestEdit: (reviewId, reason) => apiClient.post(`/me/reviews/${reviewId}/edit-request`, { reason }).then((r) => r.data.data),
};
```

- [ ] **Step 2: Slice with thunks** for each.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/myInterviewApi.js frontend/src/features/myInterviews/myInterviewsSlice.js frontend/src/app/store.js
git commit -m "feat(my-interviews): API + slice"
```

---

### Task 30: Interviewer dashboard page

**Files:**
- Create: `frontend/src/features/myInterviews/InterviewerDashboardPage.jsx` + `.scss`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Page**

Two sections:
- **Upcoming**: card list (candidate name, scheduled time, "Open" → `/interviewer/interviews/:id`).
- **Past**: card list (candidate name, completed date, status pill: "Reviewed" / "Pending review" / "Edit pending"; CTA → "Submit review" or "View review").

Empty state for each section if zero rows.

- [ ] **Step 2: Route**

```jsx
<Route path="/interviewer/dashboard" element={
  <ProtectedRoute role="interviewer">
    <InterviewerLayout><InterviewerDashboardPage /></InterviewerLayout>
  </ProtectedRoute>
} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/myInterviews/InterviewerDashboardPage.{jsx,scss} frontend/src/App.jsx
git commit -m "feat(interviewer): dashboard with upcoming + past + review state badges"
```

---

### Task 31: Interview detail + review form

**Files:**
- Create: `frontend/src/features/myInterviews/MyInterviewDetailPage.jsx` + `.scss`
- Create: `frontend/src/features/myInterviews/ReviewForm.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: ReviewForm**

3 StarRating inputs (knowledge, communication, confidence) + comments textarea (10–2000) + Submit button. If `mode='edit'`, prefilled and submit calls editReview.

- [ ] **Step 2: MyInterviewDetailPage**

Shows interview details (scheduled time, candidate info, candidate resume download if available, Join Meeting button if status=scheduled, etc.). Below:
- If `interview.status !== completed`: review section disabled with hint.
- Else if `!review`: render ReviewForm in submit mode.
- Else: render ratings (read-only StarRating + comments). Show button:
  - If `pendingEditRequest`: banner "Edit request pending HR review."
  - Else if `canEdit`: render ReviewForm in edit mode.
  - Else: "Request edit" button → modal with reason textarea.

- [ ] **Step 3: Route**

```jsx
<Route path="/interviewer/interviews/:id" element={
  <ProtectedRoute role="interviewer">
    <InterviewerLayout><MyInterviewDetailPage /></InterviewerLayout>
  </ProtectedRoute>
} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/myInterviews/{MyInterviewDetailPage.jsx,MyInterviewDetailPage.scss,ReviewForm.jsx} frontend/src/App.jsx
git commit -m "feat(interviewer): interview detail + review submit/edit/request UI"
```

---

### Task 32: HR review-edit-requests page

**Files:**
- Create: `frontend/src/api/reviewEditRequestApi.js`
- Create: `frontend/src/features/reviewEditRequests/{reviewEditRequestsSlice,ReviewEditRequestsPage}.{js,jsx}` + `.scss`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: API + slice**

`list({ status })`, `decide(id, { decision, note })`.

- [ ] **Step 2: Page**

Table: Interviewer, Candidate, Submitted, Reason, [Approve] [Reject] inline buttons. Approve/Reject opens a small inline note input + confirm. After action, refresh list.

- [ ] **Step 3: Route**

`/admin/review-edit-requests` (existing AdminLayout, role=admin).

- [ ] **Step 4: Add nav item to AdminLayout sidebar.**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/reviewEditRequestApi.js frontend/src/features/reviewEditRequests/* frontend/src/App.jsx frontend/src/app/store.js frontend/src/layouts/AdminLayout.jsx
git commit -m "feat(admin): review-edit-requests page with inline approve/reject"
```

---

### Task 33: HR review viewer (candidate detail panel) + Select/Reject buttons

**Files:**
- Create: `frontend/src/api/reviewApi.js`
- Create: `frontend/src/features/reviews/{reviewSlice,ReviewPanel}.{js,jsx}` + `.scss`
- Modify: `frontend/src/features/candidates/CandidateListPage.jsx`
- Modify: `frontend/src/features/candidates/candidateSlice.js`
- Modify: `frontend/src/api/candidateApi.js`

- [ ] **Step 1: API + slice for reviews**

`getByCandidate(id)`, returns `{ review, history }`.

- [ ] **Step 2: ReviewPanel component**

Embedded in candidate detail (or as a row under the candidate in list). Shows: 3 stars read-only, average, comments, submitted/edited timestamps, edit-request history.

- [ ] **Step 3: Candidate API + slice — select/reject thunks**

```js
select: (id) => apiClient.post(`/candidates/${id}/select`).then(r => r.data.data),
reject: (id, note) => apiClient.post(`/candidates/${id}/reject`, { note }).then(r => r.data.data),
```

Slice handles both: replaces candidate in list with returned value.

- [ ] **Step 4: CandidateListPage actions**

When `c.status === 'awaiting_decision'`:
- Add **Select** (primary) and **Reject** (danger) buttons in the actions column.
- On click, optional confirm dialog; for Reject, optional note input.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/{reviewApi,candidateApi}.js frontend/src/features/reviews/* frontend/src/features/candidates/{CandidateListPage.jsx,candidateSlice.js}
git commit -m "feat(admin): review viewer panel + Select/Reject candidate buttons"
```

---

### Task 34: Candidate experience field (modal + list)

**Files:**
- Modify: `backend/src/models/Candidate.js`
- Modify: `backend/src/validators/candidateValidator.js`
- Modify: `frontend/src/features/candidates/CreateCandidateModal.jsx`
- Modify: `frontend/src/features/candidates/CandidateListPage.jsx`

- [ ] **Step 1: Add `experience` enum to Candidate schema**

```js
experience: { type: String, enum: ['entry', 'mid', 'senior'], default: 'mid', required: true },
```

- [ ] **Step 2: Add to Joi createCandidateSchema**

```js
experience: Joi.string().valid('entry', 'mid', 'senior').required(),
```

- [ ] **Step 3: Modal — add radio group**

After tech-stack section:

```jsx
<div className="field">
  <span className="field__label">Experience</span>
  <div className="exp-toggle">
    {['entry', 'mid', 'senior'].map((e) => (
      <button type="button" key={e}
        className={`chip-toggle ${form.experience === e ? 'is-on' : ''}`}
        onClick={() => setForm({ ...form, experience: e })}>
        {e}
      </button>
    ))}
  </div>
</div>
```

Initial form value: `experience: 'mid'`. Pass into create payload.

- [ ] **Step 4: List — show experience chip per row + filter**

Add to filters bar a select with All / Entry / Mid / Senior; pass as query param.

- [ ] **Step 5: Commit**

```bash
git add backend/src/{models/Candidate,validators/candidateValidator}.js frontend/src/features/candidates/{CreateCandidateModal,CandidateListPage}.jsx
git commit -m "feat(candidate): add experience field with form + list filter"
```

---

### Task 35: Interviewer admin list — Send setup link button + status badge

**Files:**
- Modify: `frontend/src/features/interviewers/{InterviewerListPage,interviewerSlice}.{jsx,js}`
- Modify: `frontend/src/api/interviewerApi.js`

- [ ] **Step 1: API**

```js
sendSetupLink: (id) => apiClient.post(`/interviewers/${id}/send-setup-link`).then(r => r.data.data),
```

- [ ] **Step 2: Slice — `sendInterviewerSetupLink` thunk** (no state mutation needed beyond toast).

- [ ] **Step 3: List page**

Per row, show a small "Account active" badge if `interviewer.passwordSetAt`, else "Setup pending."
Add a "Send setup link" button (or "Resend" if pending). Confirm modal then dispatch thunk; show toast on success.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/{features/interviewers/*,api/interviewerApi.js}
git commit -m "feat(admin): interviewer setup link button + account status badge"
```

---

### Task 36: Final smoke test + README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run backend tests**

```bash
cd backend && npm test
```
All previous + new tests pass.

- [ ] **Step 2: Run frontend build**

```bash
cd frontend && npm run build
```
Build clean.

- [ ] **Step 3: Manual end-to-end smoke**

1. Start backend + frontend. Run `npm run migrate:phase3`.
2. Log in as admin. Create a new interviewer; click "Send setup link."
3. Open the email link in incognito → set password → land on interviewer dashboard.
4. As admin, schedule a Round 2 (mark its candidate as shortlisted manually if needed).
5. As admin, mark the interview completed.
6. As interviewer, refresh dashboard, click the past interview, submit ratings + comments.
7. As admin, open the candidate page → see review → click Select; check candidate inbox for culture-fit email.
8. Repeat with another candidate, click Reject; check inbox.
9. As interviewer, request edit on a previously-submitted review; as admin approve; confirm edit unlocks.

- [ ] **Step 4: Update README**

Add a "Phase 3" section to the root README.md describing the new interviewer portal, auth flow, rating workflow, and HR final-decision step.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: phase 3 — interviewer portal, ratings, HR final decision"
```

---

## Definition of Done

- All 36 tasks committed
- `npm test` (backend) green
- `npm run build` (frontend) green
- Manual end-to-end smoke test passes (creation → setup → schedule → review → select/reject)
- Migration script run without errors
- No new secrets committed
