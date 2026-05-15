# Strict MCQ → Coding → Prompt Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a strict assessment pipeline (MCQ → Coding → optional Prompt) via backend gates + frontend visibility, and replace the MCQ-pass shortlist email with "you've cleared the MCQ, coding test coming next" copy.

**Architecture:** Three small, independent changes: (1) email template content edit, (2) two new conflict guards on the `sendCodingTest` and `promptTestService.assign` paths plus a clean-up of the now-dead MCQ-suppression branch in `testService.finalize`, (3) tightened visibility conditions on two buttons in `CandidateDetailPage`. No schema changes, no new endpoints.

**Tech Stack:** Express + Mongoose, Jest (backend); React + Redux Toolkit (frontend). All changes use existing patterns — Joi/`ApiError`, `useSelector`, `useToast`.

**Spec:** [docs/superpowers/specs/2026-05-15-mcq-strict-sequence-design.md](docs/superpowers/specs/2026-05-15-mcq-strict-sequence-design.md)

---

## File Map

| File | Role |
|---|---|
| `backend/src/templates/round1ShortlistedEmail.js` | Update HTML + text content to "MCQ cleared, coding test coming next" |
| `backend/src/services/candidateService.js` | Add MCQ-cleared guard at top of `sendCodingTest` |
| `backend/tests/unit/candidateService.test.js` | New tests for the guard (allow + reject paths) |
| `backend/src/services/promptTestService.js` | Add coding-cleared guard at top of `assign` (and `saveGeneratedAndAssign`) |
| `backend/tests/unit/promptTestService.test.js` | New tests for the guard |
| `backend/src/services/testService.js` | Remove dead MCQ-suppression branch in `finalize` |
| `frontend/src/features/candidates/CandidateDetailPage.jsx` | Tighten visibility on **Send coding test** + **Assign prompt test** buttons |

---

### Task 1: Update the MCQ-pass email content

**Files:**
- Modify: `backend/src/templates/round1ShortlistedEmail.js`

- [ ] **Step 1: Replace the HTML body**

Open `backend/src/templates/round1ShortlistedEmail.js`. Replace the entire `buildShortlistedHtml` function with:

```js
const buildShortlistedHtml = ({ candidate, appName }) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#14532d;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(appName)}</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">You've Cleared the MCQ Assessment</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.7">
          <p style="margin:0 0 14px">Hi <strong>${escapeHtml(candidate.name)}</strong>,</p>
          <p style="margin:0 0 14px">
            Great news — you've successfully cleared the MCQ assessment for the
            <strong>${escapeHtml(appName)}</strong> interview process.
          </p>
          <p style="margin:0 0 14px">
            The next step is a <strong>coding challenge</strong>. Our team is preparing it now;
            you'll receive a separate invitation email with your test link shortly.
          </p>
          <p style="margin:0 0 14px">
            Please keep an eye on your inbox over the next 24–48 hours and make sure
            your contact information is up to date.
          </p>
          <p style="margin:24px 0 0;color:#64748b;font-size:13px">
            If you believe you received this email by mistake, please disregard it.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;color:#94a3b8;font-size:12px;text-align:center">
          Sent by ${escapeHtml(appName)} · ${new Date().toUTCString()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
```

- [ ] **Step 2: Replace the plaintext body**

In the same file, replace `buildShortlistedText` with:

```js
const buildShortlistedText = ({ candidate, appName }) =>
  `Hi ${candidate.name},

Great news — you've successfully cleared the MCQ assessment for the ${appName} interview process.

The next step is a coding challenge. Our team is preparing it now; you'll receive a separate invitation email with your test link shortly.

Please keep an eye on your inbox over the next 24-48 hours and make sure your contact information is up to date.

Best regards,
${appName} Team
`;
```

- [ ] **Step 3: Verify the file is syntactically valid**

Run from `backend/`:

```
node -e "const t = require('./src/templates/round1ShortlistedEmail'); console.log('OK', typeof t.buildShortlistedHtml, typeof t.buildShortlistedText);"
```

Expected: `OK function function`.

- [ ] **Step 4: Run the full backend suite to confirm nothing else broke**

Run from `backend/`:

```
npx jest --no-coverage
```

Expected: all suites still pass (was 206 after yesterday's work).

- [ ] **Step 5: Commit**

```bash
git add backend/src/templates/round1ShortlistedEmail.js
git commit -m "feat(emails): MCQ-pass email now signals 'coding test coming next'"
```

---

### Task 2: Add MCQ-cleared guard to `sendCodingTest` (TDD)

**Files:**
- Test (modify): `backend/tests/unit/candidateService.test.js`
- Modify: `backend/src/services/candidateService.js`

- [ ] **Step 1: Write the failing tests**

Append the following `describe` block at the bottom of `backend/tests/unit/candidateService.test.js`:

```js
describe('candidateService.sendCodingTest — MCQ-cleared gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    candidateRepository.findById = jest.fn();
  });

  const baseCandidate = (status, overrides = {}) => ({
    id: 'c1',
    _id: 'c1',
    status,
    techStack: ['react'],
    codingTest: undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is resume_approved', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('resume_approved'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is in_progress', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('in_progress'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is completed (MCQ submitted but not graded)', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('completed'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is rejected', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('rejected'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is cheated', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('cheated'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('allows when status is shortlisted', async () => {
    const codingProblemService = require('../../src/services/codingProblemService');
    codingProblemService.sampleForCandidate.mockResolvedValue([
      { id: 'p1', title: 'Problem 1', difficulty: 'medium', supportedLanguages: ['js'] },
    ]);
    candidateRepository.findById.mockResolvedValue(baseCandidate('shortlisted'));
    const out = await svc.sendCodingTest('c1', { problemCount: 1, difficulty: 'medium' }, 'admin1');
    expect(out).toBeDefined();
  });

  test('allows when status is awaiting_decision (re-send after later progression)', async () => {
    const codingProblemService = require('../../src/services/codingProblemService');
    codingProblemService.sampleForCandidate.mockResolvedValue([
      { id: 'p1', title: 'Problem 1', difficulty: 'medium', supportedLanguages: ['js'] },
    ]);
    candidateRepository.findById.mockResolvedValue(baseCandidate('awaiting_decision'));
    const out = await svc.sendCodingTest('c1', { problemCount: 1, difficulty: 'medium' }, 'admin1');
    expect(out).toBeDefined();
  });

  test('allows when status is selected_for_culture', async () => {
    const codingProblemService = require('../../src/services/codingProblemService');
    codingProblemService.sampleForCandidate.mockResolvedValue([
      { id: 'p1', title: 'Problem 1', difficulty: 'medium', supportedLanguages: ['js'] },
    ]);
    candidateRepository.findById.mockResolvedValue(baseCandidate('selected_for_culture'));
    const out = await svc.sendCodingTest('c1', { problemCount: 1, difficulty: 'medium' }, 'admin1');
    expect(out).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run from `backend/`:

```
npx jest tests/unit/candidateService.test.js -t "sendCodingTest — MCQ-cleared gate" --no-coverage
```

Expected: 5 of 8 tests FAIL (the "rejects" ones). The 3 "allows" tests probably PASS already (since there's no gate yet — they reach the existing flow). Verify the failures are about the missing E_MCQ_NOT_CLEARED error.

- [ ] **Step 3: Add the guard in `sendCodingTest`**

Open `backend/src/services/candidateService.js`. Find the `sendCodingTest` function (line ~516):

```js
const sendCodingTest = async (id, { problemCount = 1, durationMinutes = 30, difficulty = 'medium', problemIds }, adminId) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.codingTest?.sentAt && !candidate.codingTest?.submittedAt) {
```

Insert the new guard right after the `if (!candidate)` line, so it becomes:

```js
const sendCodingTest = async (id, { problemCount = 1, durationMinutes = 30, difficulty = 'medium', problemIds }, adminId) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!['shortlisted', 'awaiting_decision', 'selected_for_culture'].includes(candidate.status)) {
    throw ApiError.conflict('Candidate must clear the MCQ test first', { code: 'E_MCQ_NOT_CLEARED' });
  }
  if (candidate.codingTest?.sentAt && !candidate.codingTest?.submittedAt) {
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx jest tests/unit/candidateService.test.js -t "sendCodingTest — MCQ-cleared gate" --no-coverage
```

Expected: 8/8 PASS.

- [ ] **Step 5: Run the full suite — confirm no regressions**

```
npx jest --no-coverage
```

Expected: all suites pass (was 206; should now be 214 with the 8 new tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/candidateService.js backend/tests/unit/candidateService.test.js
git commit -m "feat(candidate-service): gate sendCodingTest behind MCQ-cleared status"
```

---

### Task 3: Add coding-cleared guard to `promptTestService.assign` and friends (TDD)

**Files:**
- Test (modify): `backend/tests/unit/promptTestService.test.js`
- Modify: `backend/src/services/promptTestService.js`

- [ ] **Step 1: Write the failing tests**

Append to the bottom of `backend/tests/unit/promptTestService.test.js`:

```js
describe('promptTestService.assign — coding-test-cleared gate', () => {
  beforeEach(() => jest.clearAllMocks());

  const baseCandidate = (codingOutcome) => ({
    id: 'c1',
    _id: 'c1',
    status: 'shortlisted',
    codingTest: codingOutcome ? { outcome: codingOutcome } : undefined,
    save: jest.fn().mockResolvedValue(undefined),
    promptTest: {},
  });

  test('rejects with E_CODING_NOT_CLEARED when candidate.codingTest is undefined', async () => {
    candidateRepo.findById.mockResolvedValue(baseCandidate(undefined));
    await expect(svc.assign({ candidateId: 'c1', problemId: 'p1' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_CODING_NOT_CLEARED' });
  });

  test('rejects with E_CODING_NOT_CLEARED when codingTest.outcome is null', async () => {
    candidateRepo.findById.mockResolvedValue(baseCandidate(null));
    await expect(svc.assign({ candidateId: 'c1', problemId: 'p1' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_CODING_NOT_CLEARED' });
  });

  test('rejects with E_CODING_NOT_CLEARED when codingTest.outcome is pending_review', async () => {
    candidateRepo.findById.mockResolvedValue(baseCandidate('pending_review'));
    await expect(svc.assign({ candidateId: 'c1', problemId: 'p1' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_CODING_NOT_CLEARED' });
  });

  test('rejects with E_CODING_NOT_CLEARED when codingTest.outcome is rejected', async () => {
    candidateRepo.findById.mockResolvedValue(baseCandidate('rejected'));
    await expect(svc.assign({ candidateId: 'c1', problemId: 'p1' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_CODING_NOT_CLEARED' });
  });

  test('allows when codingTest.outcome is shortlisted', async () => {
    candidateRepo.findById.mockResolvedValue(baseCandidate('shortlisted'));
    problemRepo.findById.mockResolvedValue({ id: 'p1', durationMinutes: 20 });
    subRepo.create.mockResolvedValue({ id: 's1', accessToken: 'tok-abc' });

    const res = await svc.assign({ candidateId: 'c1', problemId: 'p1' });
    expect(res.accessToken).toBe('tok-abc');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx jest tests/unit/promptTestService.test.js -t "coding-test-cleared gate" --no-coverage
```

Expected: 4 FAIL (the "rejects" ones), 1 PASS (the allow path — it falls through to existing flow).

- [ ] **Step 3: Add the guard to `assign`**

Open `backend/src/services/promptTestService.js`. Find the `assign` function (line 15):

```js
const assign = async ({ candidateId, problemId, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const problem = await promptProblemRepository.findById(problemId);
```

Insert the new guard right after the `if (!candidate)` line, so it becomes:

```js
const assign = async ({ candidateId, problemId, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.codingTest?.outcome !== 'shortlisted') {
    throw ApiError.conflict('Candidate must clear the coding test first', { code: 'E_CODING_NOT_CLEARED' });
  }
  const problem = await promptProblemRepository.findById(problemId);
```

- [ ] **Step 4: Add the same guard to `saveGeneratedAndAssign`**

Find `saveGeneratedAndAssign` (line 66):

```js
const saveGeneratedAndAssign = async ({ candidateId, draft, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');

  const problem = await promptProblemRepository.create({
```

Insert the same guard after `if (!candidate)`:

```js
const saveGeneratedAndAssign = async ({ candidateId, draft, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.codingTest?.outcome !== 'shortlisted') {
    throw ApiError.conflict('Candidate must clear the coding test first', { code: 'E_CODING_NOT_CLEARED' });
  }

  const problem = await promptProblemRepository.create({
```

Note: `generateAndAssign` (line 52) doesn't persist anything — it just returns a draft. We don't add the guard there; the user will be blocked when they try to save the draft via `saveGeneratedAndAssign`. This keeps the AI generation pre-flight workflow intact.

- [ ] **Step 5: Run tests to confirm they pass**

```
npx jest tests/unit/promptTestService.test.js -t "coding-test-cleared gate" --no-coverage
```

Expected: 5/5 PASS.

- [ ] **Step 6: Run the full suite — confirm no regressions**

```
npx jest --no-coverage
```

Expected: all suites pass (should now be 219 total).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/promptTestService.js backend/tests/unit/promptTestService.test.js
git commit -m "feat(prompt-test): gate assign + saveGeneratedAndAssign behind coding-test-cleared"
```

---

### Task 4: Remove dead MCQ-suppression branch in `testService.finalize`

**Files:**
- Modify: `backend/src/services/testService.js`

- [ ] **Step 1: Read the current finalize block**

Open `backend/src/services/testService.js` and locate lines 186-216 — the block that starts with the `// Suppress auto-outcome` comment and ends with the closing `}` of the `else` branch.

- [ ] **Step 2: Replace the block**

Replace lines 186-216 (the entire MCQ-suppression + status-flip block) with this simpler version:

```js
  if (outcome === ROUND1_OUTCOMES.DISQUALIFIED) {
    candidate.status = CANDIDATE_STATUS.CHEATED;
  } else if (outcome === ROUND1_OUTCOMES.SHORTLISTED) {
    candidate.status = CANDIDATE_STATUS.SHORTLISTED;
  } else {
    candidate.status = CANDIDATE_STATUS.REJECTED;
  }
  await candidate.save();
  queueReportEmail({ candidate, submission });
  queueRound1OutcomeEmail({ candidate, submission, outcome });
```

(The `codingPending` / `promptPending` / `otherTestPending` variables are no longer referenced anywhere — they were only used in the removed branch. The whole computation goes away.)

- [ ] **Step 3: Verify the file is syntactically valid**

Run from `backend/`:

```
node -e "require('./src/services/testService'); console.log('OK');"
```

Expected: `OK`.

- [ ] **Step 4: Run the full backend suite**

```
npx jest --no-coverage
```

Expected: all suites pass. The existing `round1Outcome.test.js` tests still pass (they only test the pure `decideRound1Outcome` function, which is unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/testService.js
git commit -m "refactor(test-service): remove dead MCQ-suppression branch in finalize

With strict ordering (MCQ → Coding → Prompt), coding/prompt tests can
no longer be sent before MCQ is cleared. The suppression branch that
deferred the status flip when 'another test was pending review' is
therefore unreachable. Simplifies finalize to a straight pass/fail/cheat
flow with both report + outcome emails always firing."
```

---

### Task 5: Tighten action-row visibility on `CandidateDetailPage`

**Files:**
- Modify: `frontend/src/features/candidates/CandidateDetailPage.jsx`

- [ ] **Step 1: Update the "Send coding test" button condition**

Open `frontend/src/features/candidates/CandidateDetailPage.jsx`. Find the existing Send-coding-test block (around line 216-220):

```jsx
        {['resume_approved', 'pending', 'in_progress', 'completed', 'awaiting_decision', 'shortlisted', 'selected_for_culture'].includes(c.status) && (
          <Button variant="secondary" onClick={() => setCodingTestOpen(true)}>
            {c.codingTest?.sentAt ? 'Re-send coding test' : 'Send coding test'}
          </Button>
        )}
```

Replace the visibility condition (the `.includes(c.status)` predicate) so the button appears only post-MCQ-pass:

```jsx
        {['shortlisted', 'awaiting_decision', 'selected_for_culture'].includes(c.status) && (
          <Button variant="secondary" onClick={() => setCodingTestOpen(true)}>
            {c.codingTest?.sentAt ? 'Re-send coding test' : 'Send coding test'}
          </Button>
        )}
```

- [ ] **Step 2: Update the "Assign prompt test" button condition**

Just below the coding-test button block, find the Assign-prompt-test block (around line 221-225):

```jsx
        {['resume_approved', 'pending', 'in_progress', 'completed', 'awaiting_decision', 'shortlisted', 'selected_for_culture'].includes(c.status) && (
          <Button variant="secondary" onClick={() => setPromptTestOpen(true)}>
            {c.promptTest?.sentAt ? 'Re-assign prompt test' : 'Assign prompt test'}
          </Button>
        )}
```

Replace the condition so the button only appears when coding test is cleared:

```jsx
        {c.codingTest?.outcome === 'shortlisted' && (
          <Button variant="secondary" onClick={() => setPromptTestOpen(true)}>
            {c.promptTest?.sentAt ? 'Re-assign prompt test' : 'Assign prompt test'}
          </Button>
        )}
```

- [ ] **Step 3: Verify the frontend builds**

Run from `frontend/`:

```
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/candidates/CandidateDetailPage.jsx
git commit -m "feat(candidate-detail): hide coding-test button until MCQ cleared, prompt-test button until coding cleared"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev servers**

Two terminals:

```
cd backend && npm run dev
```

```
cd frontend && npm run dev
```

- [ ] **Step 2: Pre-MCQ — action row should hide coding/prompt buttons**

In the browser, sign in as admin. Pick a candidate whose status is `resume_approved` (or create one). Open their detail page.

Expected:
- "Send test" button visible.
- **No** "Send coding test" button visible.
- **No** "Assign prompt test" button visible.

If you have a test-only API client, also try `POST /candidates/:id/coding-test/send` directly → expect 409 with `Candidate must clear the MCQ test first`.

- [ ] **Step 3: Candidate completes MCQ with passing score**

Open the candidate test link in incognito; complete the MCQ at ≥60%. Verify the candidate receives the **new email** (subject contains "Cleared the MCQ", body mentions a coding test coming next).

Back as admin, refresh the candidate detail page:
- Status badge reads **Shortlisted**.
- "Send coding test" button NOW visible.
- "Assign prompt test" button still hidden.

- [ ] **Step 4: HR sends coding test → candidate submits → HR reviews**

Click "Send coding test"; pick options; submit. Candidate completes the coding test; HR reviews and clicks **Shortlist** on the coding test review page.

Expected: `candidate.codingTest.outcome === 'shortlisted'`. Refresh the candidate detail page:
- "Assign prompt test" button NOW visible.

- [ ] **Step 5: Try to assign prompt test before coding cleared (negative case)**

Use a different candidate who has `status === 'shortlisted'` but no coding test sent. Via API client / DevTools, call `POST /candidates/:id/prompt-test/assign` with a valid problemId.

Expected: 409 with body message `Candidate must clear the coding test first`.

- [ ] **Step 6: Failed MCQ path**

Pick (or create) another candidate. Have them complete the MCQ at <60%.

Expected:
- Status flips to `rejected`.
- Existing rejection email arrives (not the new "cleared MCQ" email).
- Action row shows only "Delete" — no coding or prompt buttons.

- [ ] **Step 7: Cheated MCQ path**

Have a candidate trigger the tab-switch threshold during the MCQ.

Expected:
- Status flips to `cheated`.
- Existing disqualified email arrives.
- Action row shows only "Delete".

- [ ] **Step 8: Re-send case**

Pick a candidate who is at `awaiting_decision` (all assessments done). Click "Send coding test" again — verify it works (re-send case is allowed by the gate).

- [ ] **Step 9: Live interview phase still works**

Open a candidate who has `codingTest.outcome === 'shortlisted'`. Open the candidate detail page. The **Candidate Timeline** (from earlier today) should show with the "+ Schedule next round" node defaulting to **Technical** (Round 1 live interview). Click it; verify the schedule modal opens with the candidate pre-filled.

This confirms the strict-sequence change doesn't break the downstream live-interview flow.

---

## Self-Review Notes

**Spec coverage check:**

| Spec requirement | Plan task |
|---|---|
| MCQ-pass email content change | Task 1 ✅ |
| `sendCodingTest` MCQ-cleared guard | Task 2 ✅ |
| `promptTestService.assign` + `saveGeneratedAndAssign` coding-cleared guard | Task 3 ✅ |
| `testService.finalize` suppression branch removal | Task 4 ✅ |
| Frontend visibility tightening (coding test button) | Task 5 ✅ |
| Frontend visibility tightening (prompt test button) | Task 5 ✅ |
| Error code `E_MCQ_NOT_CLEARED` | Task 2 ✅ |
| Error code `E_CODING_NOT_CLEARED` | Task 3 ✅ |
| Failed MCQ → rejected + existing email | Task 6 manual step 6 ✅ |
| Cheated MCQ → cheated + existing email | Task 6 manual step 7 ✅ |
| Re-send allowed at `awaiting_decision` / `selected_for_culture` | Task 2 tests + Task 6 manual step 8 ✅ |
| `final_rejected` excluded | Task 2 (allow list omits it) ✅ |

**Placeholder scan:** no TBDs. Every step has full code or a complete shell command.

**Type/name consistency:**
- Error code spelling: `E_MCQ_NOT_CLEARED` and `E_CODING_NOT_CLEARED` used consistently across spec, plan, tests, and implementation snippets.
- Allow-list values (`'shortlisted'`, `'awaiting_decision'`, `'selected_for_culture'`) consistent in service + test + frontend.
- `codingTest?.outcome === 'shortlisted'` consistent in service + frontend.

**Independence:** tasks 1–5 each produce a self-contained commit that compiles and tests green. Task 4 depends on the suppression branch being unreachable, which follows from tasks 2+3; running task 4 before 2/3 would still work technically (the branch becomes dead code, just slightly earlier).

**Out of scope (confirmed not implemented):**
- Action-row UX redesign (dropdown grouping) — separate spec.
- Prompt-test shortlist/reject flow — separate spec.
- Legacy "Select for culture" button cleanup — separate spec.
- Migration of legacy candidates — none needed.
