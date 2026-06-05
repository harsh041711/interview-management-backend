# Phase 2 — Interview Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Interview Management System with the post-Round-1 workflow: auto pass/fail/disqualified emails to candidates, interviewer roster, Round 2 scheduling with system-wrapped meeting URLs, and a reschedule request loop.

**Architecture:** Same layered backend (controllers → services → repositories → models) and feature-based frontend (Redux Toolkit) as Phase 1. Phase 2 adds three new models (`Interviewer`, `Interview`, `RescheduleRequest`), six new email templates, a public token-based wrapper page (`/interview/:token`) mirroring the Phase 1 candidate test flow, and three new admin features (Interviewers, Interviews, Interview Detail). Hardcoded `PASS_THRESHOLD_PERCENT = 50`. Tokens generated via UUIDv4 + HMAC-SHA256, no expiry — access auto-locks via `Interview.status`.

**Tech Stack:** Node.js, Express, MongoDB/Mongoose, Joi, JWT (admin), HMAC-signed UUID tokens (public), Nodemailer, Winston, React 18 + Vite, Redux Toolkit, Axios, SCSS, react-router-dom v6.

**Spec:** [`docs/superpowers/specs/2026-05-06-phase-2-interview-process-design.md`](../specs/2026-05-06-phase-2-interview-process-design.md)

---

## File Structure

### Backend additions

```
backend/src/
├── config/env.js                                         # MODIFY: add interview.defaultDurationMinutes
├── models/
│   ├── Candidate.js                                      # MODIFY: status enum +shortlisted/+rejected
│   ├── Submission.js                                     # MODIFY: +round1Outcome, +round1ResultEmailedAt, +round1ResultEmailError
│   ├── Interviewer.js                                    # NEW
│   ├── Interview.js                                      # NEW
│   └── RescheduleRequest.js                              # NEW
├── repositories/
│   ├── interviewerRepository.js                          # NEW
│   ├── interviewRepository.js                            # NEW
│   └── rescheduleRequestRepository.js                    # NEW
├── services/
│   ├── interviewerService.js                             # NEW
│   ├── interviewService.js                               # NEW
│   ├── candidateService.js                               # MODIFY: cascade-delete interviews+reschedules
│   ├── testService.js                                    # MODIFY: queue Round 1 outcome email + status transitions
│   └── emailService.js                                   # MODIFY: add 6 send* functions
├── controllers/
│   ├── interviewerController.js                          # NEW
│   ├── interviewController.js                            # NEW (admin)
│   └── interviewPublicController.js                      # NEW (token-based)
├── routes/
│   ├── index.js                                          # MODIFY: mount /interviewers, /interviews, /interview
│   ├── interviewerRoutes.js                              # NEW
│   ├── interviewRoutes.js                                # NEW (admin)
│   └── interviewPublicRoutes.js                          # NEW (/interview, token-based)
├── middlewares/
│   └── interviewMiddleware.js                            # NEW (token guard + viewerRole)
├── validators/
│   ├── interviewerValidator.js                           # NEW
│   └── interviewValidator.js                             # NEW
├── utils/
│   ├── constants.js                                      # MODIFY: +PASS_THRESHOLD_PERCENT, +INTERVIEW_STATUS, +RESCHEDULE_STATUS, +ROUND1_OUTCOMES, +CANDIDATE_STATUS additions
│   └── interviewToken.js                                 # NEW (mirrors tokenGenerator.js)
├── templates/
│   ├── round1ShortlistedEmail.js                         # NEW
│   ├── round1RejectedEmail.js                            # NEW
│   ├── round1DisqualifiedEmail.js                        # NEW
│   ├── interviewScheduledEmail.js                        # NEW
│   ├── rescheduleRequestedEmail.js                       # NEW (to admin)
│   ├── rescheduleApprovedEmail.js                        # NEW
│   └── rescheduleRejectedEmail.js                        # NEW
└── scripts/
    └── backfill-round1-outcomes.js                       # NEW (one-shot migration helper)

backend/tests/
├── unit/
│   ├── interviewToken.test.js                            # NEW
│   ├── interviewService.test.js                          # NEW
│   └── round1Outcome.test.js                             # NEW (small unit on the outcome decision in testService)
└── integration/                                          # OPTIONAL — only if time allows
```

### Frontend additions

```
frontend/src/
├── api/
│   ├── interviewerApi.js                                 # NEW
│   ├── interviewApi.js                                   # NEW
│   └── interviewViewApi.js                               # NEW (per-token client builder)
├── app/store.js                                          # MODIFY: register 3 new reducers
├── features/
│   ├── interviewers/
│   │   ├── interviewerSlice.js                           # NEW
│   │   ├── InterviewerListPage.jsx                       # NEW
│   │   ├── InterviewerListPage.scss                      # NEW
│   │   ├── InterviewerFormModal.jsx                      # NEW
│   │   └── InterviewerFormModal.scss                     # NEW
│   ├── interviews/
│   │   ├── interviewSlice.js                             # NEW
│   │   ├── InterviewListPage.jsx                         # NEW
│   │   ├── InterviewListPage.scss                        # NEW
│   │   ├── ScheduleInterviewModal.jsx                    # NEW
│   │   ├── ScheduleInterviewModal.scss                   # NEW
│   │   ├── InterviewDetailPage.jsx                       # NEW
│   │   └── InterviewDetailPage.scss                      # NEW
│   ├── interviewView/
│   │   ├── interviewViewSlice.js                         # NEW
│   │   ├── InterviewViewPage.jsx                         # NEW (public token-based)
│   │   ├── InterviewViewPage.scss                        # NEW
│   │   ├── RescheduleRequestForm.jsx                     # NEW
│   │   └── RescheduleRequestForm.scss                    # NEW
│   ├── candidates/CandidateListPage.jsx                  # MODIFY: status filter additions
│   ├── submissions/SubmissionDetailPage.jsx              # MODIFY: round 1 outcome panel
│   └── dashboard/DashboardPage.jsx                       # MODIFY: 3 new stat cards
├── components/common/
│   ├── StatusBadge.jsx                                   # MODIFY: status variant map
│   ├── DateTimeInput.jsx                                 # NEW
│   ├── DateTimeInput.scss                                # NEW
│   ├── CopyButton.jsx                                    # NEW
│   └── CopyButton.scss                                   # NEW
├── layouts/AdminLayout.jsx                               # MODIFY: NAV array adds 2 items
├── routes/AppRoutes.jsx                                  # MODIFY: 4 new routes
└── utils/datetime.js                                     # NEW (formatScheduledAt, localTimezoneLabel)
```

---

## Phases

Same as Phase 1: each phase produces runnable, testable software. Engineers commit at meaningful checkpoints, not after every micro-edit. Type names and shapes in earlier tasks are referenced exactly by later tasks.

### Phase 2A — Backend foundation: constants, models, Round 1 outcome emails

**Deliverable:** Candidate submitting Round 1 receives the correct one of three emails (shortlisted / rejected / disqualified). `Candidate.status` flips to `shortlisted` or `rejected`. Interviewer entity is creatable via API. No scheduling yet.

- [ ] **2A.1** Extend constants in [`backend/src/utils/constants.js`](../../backend/src/utils/constants.js): add `PASS_THRESHOLD_PERCENT = 50`, `INTERVIEW_DEFAULT_DURATION_MINUTES = 45`, `INTERVIEW_STATUS = { SCHEDULED, RESCHEDULE_REQUESTED, COMPLETED, CANCELLED }` and `INTERVIEW_STATUS_LIST`, `RESCHEDULE_STATUS = { PENDING, APPROVED, REJECTED }` and `RESCHEDULE_STATUS_LIST`, `ROUND1_OUTCOMES = { SHORTLISTED: 'shortlisted', REJECTED: 'rejected', DISQUALIFIED: 'disqualified' }` and `ROUND1_OUTCOMES_LIST`, and add `SHORTLISTED: 'shortlisted'`, `REJECTED: 'rejected'` to the existing `CANDIDATE_STATUS` freeze object. Re-derive `CANDIDATE_STATUS_LIST = Object.values(CANDIDATE_STATUS)` so the union picks them up.
- [ ] **2A.2** Extend [`backend/src/config/env.js`](../../backend/src/config/env.js): under the `test` key add `interview: { defaultDurationMinutes: toInt(process.env.INTERVIEW_DEFAULT_DURATION_MINUTES, 45) }` as a sibling to `test`. Append `INTERVIEW_DEFAULT_DURATION_MINUTES=45` to [`backend/.env.example`](../../backend/.env.example) under a new `# ====== Interviews ======` section.
- [ ] **2A.3** Modify [`backend/src/models/Candidate.js`](../../backend/src/models/Candidate.js) — the `status` enum is already wired via `CANDIDATE_STATUS_LIST`, so updating constants in 2A.1 is sufficient. No code change beyond confirming the import resolves.
- [ ] **2A.4** Modify [`backend/src/models/Submission.js`](../../backend/src/models/Submission.js): add three fields after `submittedAt`: `round1Outcome: { type: String, enum: [...Object.values(ROUND1_OUTCOMES), null], default: null, index: true }`, `round1ResultEmailedAt: { type: Date, default: null }`, `round1ResultEmailError: { type: String, default: null }`. Import `ROUND1_OUTCOMES` from `../utils/constants` at top of file.
- [ ] **2A.5** Build [`backend/src/utils/interviewToken.js`](../../backend/src/utils/interviewToken.js) — mirrors `tokenGenerator.js` but no expiry. Exports `generateInterviewToken()` returning `{ token }` (string `<uuidHex>.<sig>`), `verifyInterviewToken(token)` returning boolean (constant-time HMAC compare), `maskToken(token)`. Use `env.testToken.secret` as the HMAC key (same secret reused — server-side anyway, a single rotation point).
- [ ] **2A.6** Write unit test [`backend/tests/unit/interviewToken.test.js`](../../backend/tests/unit/interviewToken.test.js): covers (a) two generations are unique, (b) `verifyInterviewToken` accepts valid token, (c) tampered signature rejected, (d) malformed input rejected. Mirror the structure of `tokenGenerator.test.js`. Run `npm test` in `backend/`. Expected: 4 new passing tests, total now 18.
- [ ] **2A.7** Build [`backend/src/models/Interviewer.js`](../../backend/src/models/Interviewer.js) per spec §5.1. Indexes: `email` unique (already implicit via `unique: true`), `{ isActive: 1, createdAt: -1 }` compound. `toJSON.transform` strips `__v`.
- [ ] **2A.8** Build [`backend/src/repositories/interviewerRepository.js`](../../backend/src/repositories/interviewerRepository.js) with `create`, `findById`, `findByEmail`, `updateById`, `deleteById`, `list({page, limit, search, isActive})` (same regex+escape pattern as `candidateRepository`), `countActive`.
- [ ] **2A.9** Build [`backend/src/validators/interviewerValidator.js`](../../backend/src/validators/interviewerValidator.js): export `createInterviewerSchema`, `updateInterviewerSchema`, `idParamSchema`, `listInterviewersSchema`. `name` (2–120), `email` (lowercase, valid), `expertise` (array of 1–60 char strings, ≤10), `notes` (≤500), `isActive` (boolean, optional, only on update). List schema accepts `page`, `limit`, `search` (`.empty('')`), `isActive` (boolean).
- [ ] **2A.10** Build [`backend/src/services/interviewerService.js`](../../backend/src/services/interviewerService.js) — `create`, `list`, `detail`, `update`, `remove`. `remove` first calls `interviewRepository.countByInterviewer(id)` (added in 2B) to block; until 2B exists, stub the count check with `// blocked-on-2B-count: returns 0`. Use `ApiError.conflict` if count > 0. `update` rejects email change to a duplicate (`ApiError.conflict`).
- [ ] **2A.11** Build [`backend/src/controllers/interviewerController.js`](../../backend/src/controllers/interviewerController.js) — `createInterviewer`, `listInterviewers`, `getInterviewer`, `updateInterviewer`, `deleteInterviewer`. Uses `asyncHandler`, `ok`, `created`, `noContent`.
- [ ] **2A.12** Build [`backend/src/routes/interviewerRoutes.js`](../../backend/src/routes/interviewerRoutes.js): `requireAuth` + per-route validators, exporting routes per spec §6.1.
- [ ] **2A.13** Modify [`backend/src/routes/index.js`](../../backend/src/routes/index.js): add `router.use('/interviewers', require('./interviewerRoutes'))`. Restart backend, smoke-test `POST /api/v1/interviewers` via curl.
- [ ] **2A.14** Build [`backend/src/templates/round1ShortlistedEmail.js`](../../backend/src/templates/round1ShortlistedEmail.js) — exports `buildShortlistedHtml({candidate, appName})` and `buildShortlistedText(...)`. Tone: positive. Score is **not** disclosed (per spec §7); message says HR will be in touch with next steps. Reuse the `escapeHtml` helper inline (small enough to repeat per template). Subject line in caller; body content here.
- [ ] **2A.15** Build [`backend/src/templates/round1RejectedEmail.js`](../../backend/src/templates/round1RejectedEmail.js) — neutral tone, no score, no specifics on which questions failed.
- [ ] **2A.16** Build [`backend/src/templates/round1DisqualifiedEmail.js`](../../backend/src/templates/round1DisqualifiedEmail.js) — firm tone: "violation of test rules detected (tab switch / window blur), submission has been disqualified, no further consideration".
- [ ] **2A.17** Modify [`backend/src/services/emailService.js`](../../backend/src/services/emailService.js): add `sendRound1Result({candidate, submission, outcome})` that resolves the right template by `outcome` and sends. Also add private helper `getResolvedFrom()` that returns `env.smtp.from` (single source of truth). Returns nodemailer `info` on success, throws otherwise.
- [ ] **2A.18** Modify [`backend/src/services/testService.js`](../../backend/src/services/testService.js) `finalize` function: after computing `evalResult`, decide `outcome`:
  - `cheatDetected === true` → `outcome = 'disqualified'`, `candidate.status = CHEATED` (existing behavior preserved)
  - else if `evalResult.percentage >= PASS_THRESHOLD_PERCENT` → `outcome = 'shortlisted'`, `candidate.status = SHORTLISTED`
  - else → `outcome = 'rejected'`, `candidate.status = REJECTED`

  Persist `submission.round1Outcome = outcome`. After the existing HR-report queue, queue a second `setImmediate` that calls `emailService.sendRound1Result({candidate, submission: populated, outcome})`, on success stamps `submission.round1ResultEmailedAt = new Date()` via `submissionRepository.updateById`, on failure stamps `round1ResultEmailError = err.message`. Use a new helper `queueRound1OutcomeEmail({candidate, submission, outcome})` co-located in `testService.js` (mirrors existing `queueReportEmail`).
- [ ] **2A.19** Modify [`backend/src/repositories/submissionRepository.js`](../../backend/src/repositories/submissionRepository.js): no change required if `updateById` already exists; verify and add `updateById` if missing (it does — confirmed in Phase 1 plan).
- [ ] **2A.20** Write unit test [`backend/tests/unit/round1Outcome.test.js`](../../backend/tests/unit/round1Outcome.test.js): pure function `decideRound1Outcome({percentage, cheatDetected})` extracted from `testService.js` into a small helper inside `testService.js` (export it for testing). Cases: `{percentage: 80, cheat: false} → 'shortlisted'`, `{percentage: 50, cheat: false} → 'shortlisted'` (≥, not >), `{percentage: 49.9, cheat: false} → 'rejected'`, `{percentage: 100, cheat: true} → 'disqualified'`. Run `npm test`. Expected: 4 new passing.
- [ ] **2A.21** Manual smoke test:
  1. Restart backend.
  2. Create candidate with techStack `Nodejs` (existing question bank).
  3. Open candidate test link in incognito, capture photo, complete test scoring ≥50% — confirm shortlisted email arrives, candidate row in admin shows `Shortlisted` badge (assumes 2C extends StatusBadge — fall back to raw status string for now).
  4. Repeat with deliberately wrong answers to score <50% — confirm rejected email.
  5. Repeat triggering tab-switch auto-submit — confirm disqualified email.
- [ ] **2A.22** Run `npm test` in `backend/`. Expected: 18 passing tests (14 original + 4 from interviewToken; round1Outcome's 4 are folded into the count). Document any deviation in commit message.
- [ ] **2A.23** Commit:
  ```bash
  git add backend/src backend/tests backend/.env.example
  git commit -m "feat(backend): phase 2a — round 1 outcome emails + interviewer CRUD foundation

   - Adds three round 1 outcome email templates (shortlisted/rejected/disqualified)
   - Extends Candidate.status with shortlisted/rejected
   - Extends Submission with round1Outcome and email status tracking
   - Adds Interviewer model + repository + service + controller + routes
   - Adds interviewToken util (UUIDv4 + HMAC, no expiry)
   - testService.finalize now queues outcome email per spec
   - Tests: +interviewToken, +round1Outcome decision; total 18 passing"
  ```

### Phase 2B — Backend: Interview + RescheduleRequest + scheduling emails

**Deliverable:** HR can schedule a Round 2 interview via API; both parties receive email with their unique URL; interviewer can request reschedule via tokenized POST; HR can approve/reject; cancel/complete supported. No frontend yet.

- [ ] **2B.1** Build [`backend/src/models/Interview.js`](../../backend/src/models/Interview.js) per spec §5.2. Indexes per spec. `toJSON.transform` strips `__v`. Hide `candidateAccessToken` and `interviewerAccessToken` from `toJSON` only when serialized for non-admin (we'll enforce role-based stripping at the controller layer; toJSON keeps both visible to admin).
- [ ] **2B.2** Build [`backend/src/models/RescheduleRequest.js`](../../backend/src/models/RescheduleRequest.js) per spec §5.3.
- [ ] **2B.3** Build [`backend/src/repositories/interviewRepository.js`](../../backend/src/repositories/interviewRepository.js): `create`, `findById` (basic), `findByIdPopulated` (populates `candidate`, `interviewer`), `findByCandidateAccessToken`, `findByInterviewerAccessToken`, `updateById`, `deleteById`, `countByInterviewer(interviewerId, statuses?)`, `countByCandidate(candidateId)`, `list({page, limit, status, candidateId, interviewerId, from, to})` (date range filter on `scheduledAt`), `findOverlapping({interviewerId, start, end, excludeInterviewId?})` returning the first overlapping doc or null. Overlap query: `{ interviewer: id, status: { $in: [SCHEDULED, RESCHEDULE_REQUESTED] }, _id: { $ne: exclude }, scheduledAt: { $lt: end }, $expr: { $gt: [{$add: ['$scheduledAt', {$multiply: ['$durationMinutes', 60000]}]}, start] } }`. (Use Mongoose `aggregate` if `$expr` in `find` is awkward.)
- [ ] **2B.4** Build [`backend/src/repositories/rescheduleRequestRepository.js`](../../backend/src/repositories/rescheduleRequestRepository.js): `create`, `findPendingForInterview(interviewId)`, `findByInterview(interviewId)` (full history), `updateById`.
- [ ] **2B.5** Build [`backend/src/middlewares/interviewMiddleware.js`](../../backend/src/middlewares/interviewMiddleware.js): `requireInterviewToken` middleware. Pulls token from `x-interview-token` header (or `?token=` query as fallback). Uses `verifyInterviewToken` then tries `findByCandidateAccessToken` and `findByInterviewerAccessToken`. On match, attaches `req.interview` (Mongoose doc) and `req.viewerRole = 'candidate' | 'interviewer'`. Returns `410` if `interview.status` is `completed` or `cancelled` (response shape `{ success: false, message: 'Interview is <status>', code: 'E_INTERVIEW_LOCKED' }`). Returns `401` on invalid token.
- [ ] **2B.6** Build [`backend/src/validators/interviewValidator.js`](../../backend/src/validators/interviewValidator.js): exports `scheduleSchema`, `updateInterviewSchema`, `cancelSchema`, `completeSchema`, `rescheduleDecisionSchema`, `rescheduleRequestSchema` (public), `listInterviewsSchema`, `idParamSchema`. URL validation via `Joi.string().uri({ scheme: ['http','https'] })`. Future-date custom rule: `Joi.date().iso().greater('now')`. `proposedAt` requires `.greater(Joi.ref('$nowPlus15Min'))` — pass via Joi context in the validator middleware *or* simpler: implement in service guard (see 2B.8).
- [ ] **2B.7** Modify [`backend/src/middlewares/validator.js`](../../backend/src/middlewares/validator.js) — confirm it passes `req` context to schemas; if not, no change needed (we'll do the 15-minute check service-side per 2B.8).
- [ ] **2B.8** Build [`backend/src/services/interviewService.js`](../../backend/src/services/interviewService.js). Functions and guards:
  - `presentInterview(interview, { viewerRole? })` → sanitized payload. For admin: includes both tokens + `meetingUrl`. For `viewerRole === 'candidate'`: `{ id, schedule:{scheduledAt,durationMinutes}, candidate:{name,email}, interviewer:{name,expertise}, meetingUrl, status, viewerRole:'candidate', canRequestReschedule:false, latestPendingReschedule? }`. For `'interviewer'`: same shape but `canRequestReschedule = (status === 'scheduled' && no pending request)` and exposes `notes` (HR notes are interviewer-only per spec §9.3).
  - `schedule({ candidateId, interviewerId, scheduledAt, durationMinutes, meetingUrl, notes }, adminId)`: candidate must be `shortlisted` or throw `ApiError.conflict('candidate is not shortlisted', { code: 'E_NOT_SHORTLISTED' })`; interviewer `isActive` or throw `E_INTERVIEWER_INACTIVE`; overlap check via `findOverlapping`, throw `E_INTERVIEWER_BUSY` if positive; `scheduledAt > now+1min` (defensive even though Joi enforces); generate two tokens via `interviewToken.generate()` ensuring they differ; persist; queue scheduled emails (one to candidate, one to interviewer).
  - `update(id, patch, adminId)`: only allowed when `status === SCHEDULED` and no pending reschedule; if `scheduledAt`, `durationMinutes`, or `meetingUrl` changed, queue scheduled emails again to both parties. Otherwise (notes-only change) no email.
  - `requestReschedule(interview, viewerRole, { proposedAt, proposedDurationMinutes, reason })`: viewerRole must be `'interviewer'` or throw `E_FORBIDDEN`; interview status must be `SCHEDULED` else `E_NOT_RESCHEDULABLE`; no existing pending request; create reschedule doc; flip interview to `RESCHEDULE_REQUESTED`; queue admin notification email. Returns the new pending request.
  - `decideReschedule(interviewId, { decision, note }, adminId)`: find latest pending; on `approved`: re-run overlap check on the proposed time excluding the current interview, mutate `Interview.scheduledAt` and `durationMinutes` if proposedDuration provided, flip status back to `SCHEDULED`, stamp `decidedBy/decidedAt/decisionNote`, queue approved emails to both. On `rejected`: just stamp + flip status back to `SCHEDULED`, queue rejected email to interviewer only.
  - `cancel(id, { reason })`: any non-terminal → `CANCELLED`, stamp `cancelledAt/cancelReason`. No email by default in spec. (Optional: surface this as a future enhancement.)
  - `complete(id, { note })`: status must be `SCHEDULED` (not while reschedule pending); stamp `completedAt/completionNote`. No email.
  - `list(query)`, `detail(id)` — standard.
- [ ] **2B.9** Build email-queueing helpers inside `interviewService.js` (co-located, like `queueReportEmail` in `testService`): `queueScheduledEmails(interview)`, `queueRescheduleRequestedEmail(interview, request)`, `queueRescheduleApprovedEmails(interview, request)`, `queueRescheduleRejectedEmail(interview, request)`. Each uses `setImmediate` and logs failures.
- [ ] **2B.10** Build [`backend/src/templates/interviewScheduledEmail.js`](../../backend/src/templates/interviewScheduledEmail.js): exports `buildScheduledHtml({ recipient: 'candidate'|'interviewer', candidate, interviewer, scheduledAt, durationMinutes, meetingUrl, accessUrl, notes? })` and `buildScheduledText(...)`. Big "Open my interview page" button → `accessUrl` (the wrapper URL). Includes both `scheduledAt` formatted via `Date.prototype.toLocaleString` server-side and the same as ISO so clients can re-render. Interviewer variant includes the HR notes block.
- [ ] **2B.11** Build [`backend/src/templates/rescheduleRequestedEmail.js`](../../backend/src/templates/rescheduleRequestedEmail.js): to admin; shows candidate name, interviewer name, original time, proposed time, reason, deep link to `/interviews/:id` in the admin panel.
- [ ] **2B.12** Build [`backend/src/templates/rescheduleApprovedEmail.js`](../../backend/src/templates/rescheduleApprovedEmail.js): both parties; shows new schedule + access URL.
- [ ] **2B.13** Build [`backend/src/templates/rescheduleRejectedEmail.js`](../../backend/src/templates/rescheduleRejectedEmail.js): interviewer only; shows original schedule (still standing) + HR's `decisionNote`.
- [ ] **2B.14** Modify [`backend/src/services/emailService.js`](../../backend/src/services/emailService.js): add `sendInterviewScheduled({ recipient, interview, candidate, interviewer, accessUrl })`, `sendRescheduleRequested({ admin, interview, request, candidate, interviewer })`, `sendRescheduleApproved({ recipient, interview, candidate, interviewer, accessUrl, decisionNote })`, `sendRescheduleRejected({ interview, candidate, interviewer, request })`. Each uses the matching template, builds subject (e.g. `"Interview scheduled — Round 2 on Mon May 11"`), and sends.
- [ ] **2B.15** Build [`backend/src/controllers/interviewController.js`](../../backend/src/controllers/interviewController.js) — admin-side: `scheduleInterview`, `listInterviews`, `getInterview`, `updateInterview`, `cancelInterview`, `completeInterview`, `decideReschedule`. Each uses `asyncHandler`, returns via `ok`/`created`/`noContent`. Strips tokens? Admin sees them — needed for the "Copy candidate link" / "Copy interviewer link" UI buttons.
- [ ] **2B.16** Build [`backend/src/controllers/interviewPublicController.js`](../../backend/src/controllers/interviewPublicController.js): `getDetails(req, res)` returns `interviewService.presentInterview(req.interview, { viewerRole: req.viewerRole })`. `submitReschedule(req, res)` enforces role, calls `interviewService.requestReschedule(req.interview, req.viewerRole, req.body)`, returns the pending request envelope.
- [ ] **2B.17** Build [`backend/src/routes/interviewRoutes.js`](../../backend/src/routes/interviewRoutes.js) (admin) per spec §6.2 — `requireAuth`, validators on each route.
- [ ] **2B.18** Build [`backend/src/routes/interviewPublicRoutes.js`](../../backend/src/routes/interviewPublicRoutes.js): wraps `requireInterviewToken`, then `GET /details`, `POST /reschedule` (with `validate(rescheduleRequestSchema)`). Use the new `rescheduleLimiter` defined in next step.
- [ ] **2B.19** Modify [`backend/src/middlewares/rateLimiter.js`](../../backend/src/middlewares/rateLimiter.js): add `rescheduleLimiter = buildLimiter({ windowMs: 60_000, max: 3, message: 'Too many reschedule attempts.' })` and export it.
- [ ] **2B.20** Modify [`backend/src/routes/index.js`](../../backend/src/routes/index.js): add `router.use('/interviews', require('./interviewRoutes'))` and `router.use('/interview', require('./interviewPublicRoutes'))`. Confirm singular vs plural.
- [ ] **2B.21** Modify [`backend/src/services/candidateService.js`](../../backend/src/services/candidateService.js) `remove` function: before deleting candidate, call `interviewRepository` to find all interviews by candidate; for each, delete reschedule requests via `rescheduleRequestRepository.deleteByInterview(id)` (add this method to the repo) then delete the interview. Wrap in a `try/catch` and continue with photo cleanup.
- [ ] **2B.22** Modify [`backend/src/repositories/rescheduleRequestRepository.js`](../../backend/src/repositories/rescheduleRequestRepository.js) — add `deleteByInterview(interviewId)` (`deleteMany({interview: interviewId})`).
- [ ] **2B.23** Modify [`backend/src/services/interviewerService.js`](../../backend/src/services/interviewerService.js) `remove`: replace the stub from 2A with real check — call `interviewRepository.countByInterviewer(id, { statuses: ['scheduled','reschedule_requested'] })`; if > 0, throw `ApiError.conflict('Interviewer has active interviews — cancel or complete them first', { code: 'E_INTERVIEWER_IN_USE' })`.
- [ ] **2B.24** Write unit test [`backend/tests/unit/interviewService.test.js`](../../backend/tests/unit/interviewService.test.js): mock the repos via `jest.mock`. Cases:
  - `schedule` rejects when candidate not shortlisted (error code `E_NOT_SHORTLISTED`).
  - `schedule` rejects when interviewer is inactive (`E_INTERVIEWER_INACTIVE`).
  - `schedule` rejects on overlap (`E_INTERVIEWER_BUSY`).
  - `schedule` succeeds — returns interview with two distinct tokens.
  - `requestReschedule` rejects when viewerRole is `candidate` (`E_FORBIDDEN`).
  - `requestReschedule` rejects when interview status is not `scheduled`.
  - `requestReschedule` rejects when pending exists.
  - `decideReschedule` `approved` mutates `scheduledAt` and `durationMinutes` and resets status to `scheduled`.
  - `decideReschedule` `rejected` keeps original time and resets status to `scheduled`.

  Mock `emailService.send*` to no-op so nothing tries SMTP.
- [ ] **2B.25** Run `npm test`. Expected: ~9 new passing tests on top of 18 → 27 total.
- [ ] **2B.26** Manual smoke test via curl:
  1. Login as admin → save JWT.
  2. `POST /interviewers` create one with your own email.
  3. Pick a `shortlisted` candidate from earlier.
  4. `POST /interviews` with `scheduledAt` 5 minutes from now and a valid Zoom URL. Confirm both emails arrive.
  5. Hit `GET /interview/details` with `x-interview-token` from the interviewer URL → confirm `viewerRole: 'interviewer'` and `canRequestReschedule: true`.
  6. `POST /interview/reschedule` proposing a new time → confirm admin receives notification email.
  7. `POST /interviews/:id/reschedule-decision` with `{ decision: 'approved', note: 'OK' }` → confirm both receive approval email and the time mutated.
  8. `POST /interviews/:id/complete` → confirm subsequent calls to `GET /interview/details` return `410`.
- [ ] **2B.27** Update [`backend/README.md`](../../backend/README.md) with new endpoint tables (Interviewers + Interviews + public Interview), new env var, and the email count: now 8 templates total (2 from Phase 1 + 6 from Phase 2). Append a one-paragraph "Phase 2" section.
- [ ] **2B.28** Commit:
  ```bash
  git add backend/src backend/tests backend/README.md
  git commit -m "feat(backend): phase 2b — interview scheduling, reschedule loop, public token API

   - Models: Interview, RescheduleRequest
   - Service guards: shortlisted-only, active-interviewer, no-overlap, single-pending
   - Public token middleware (HMAC-verified, viewerRole inference, 410 on locked)
   - 4 new email templates (scheduled, requested, approved, rejected)
   - candidateService.remove cascades to interviews + reschedule requests
   - Tests: +9 interviewService cases; total 27 passing"
  ```

### Phase 2C — Frontend admin: interviewers + interviews + status touches

**Deliverable:** HR can fully drive interviewer roster and Round 2 scheduling from the browser, including pending reschedule decisions. New stat cards on dashboard. Status badges colored correctly.

- [ ] **2C.1** Build [`frontend/src/utils/datetime.js`](../../frontend/src/utils/datetime.js): `formatScheduledAt(isoString, opts?)` returns `"Mon, May 11, 2026 · 14:30 IST"`-style; `localTimezoneLabel()` returns `Intl.DateTimeFormat().resolvedOptions().timeZone` (e.g. `Asia/Kolkata`); `toDateTimeLocalValue(iso)` returns `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`; `fromDateTimeLocalValue(value)` returns ISO string. Pure functions, no React.
- [ ] **2C.2** Build [`frontend/src/components/common/DateTimeInput.jsx`](../../frontend/src/components/common/DateTimeInput.jsx) + `.scss`: wraps `<input type="datetime-local">`. Props: `label`, `value` (ISO string), `onChange(isoString)`, `min` (ISO, defaults to "now+1min"), `error`, `hint`. Renders a small "in your timezone — `<localTimezoneLabel>`" hint underneath. Uses existing `field` SCSS class palette.
- [ ] **2C.3** Build [`frontend/src/components/common/CopyButton.jsx`](../../frontend/src/components/common/CopyButton.jsx) + `.scss`: small button. Props: `text`, `label`, `onCopied?`. Uses `copyToClipboard` from `utils/formatters`. On success toasts via `useToast`.
- [ ] **2C.4** Modify [`frontend/src/components/common/StatusBadge.jsx`](../../frontend/src/components/common/StatusBadge.jsx): extend `VARIANTS` and `LABELS` maps with `shortlisted: 'success'`, `rejected: 'danger'`, `scheduled: 'info'`, `reschedule_requested: 'warn'`, `cancelled: 'pending'`. Confirm SCSS `.status-badge--*` modifiers all exist.
- [ ] **2C.5** Build [`frontend/src/api/interviewerApi.js`](../../frontend/src/api/interviewerApi.js): `list(params)`, `detail(id)`, `create(payload)`, `update(id, payload)`, `remove(id)`. Same shape as existing `candidateApi.js`.
- [ ] **2C.6** Build [`frontend/src/api/interviewApi.js`](../../frontend/src/api/interviewApi.js): `list(params)`, `detail(id)`, `schedule(payload)`, `update(id, payload)`, `cancel(id, body)`, `complete(id, body)`, `decideReschedule(id, body)`.
- [ ] **2C.7** Build [`frontend/src/features/interviewers/interviewerSlice.js`](../../frontend/src/features/interviewers/interviewerSlice.js): mirrors `candidateSlice` shape — thunks `fetchInterviewers`, `fetchInterviewer`, `createInterviewer`, `updateInterviewer`, `deleteInterviewer`. State: `list`, `meta`, `selected`, `status`, `error`, `createStatus`.
- [ ] **2C.8** Build [`frontend/src/features/interviews/interviewSlice.js`](../../frontend/src/features/interviews/interviewSlice.js): thunks `fetchInterviews`, `fetchInterview`, `scheduleInterview`, `updateInterview`, `cancelInterview`, `completeInterview`, `decideReschedule`. State adds `selected`, `selectedStatus` for detail page.
- [ ] **2C.9** Modify [`frontend/src/app/store.js`](../../frontend/src/app/store.js): register `interviewers: interviewerReducer`, `interviews: interviewReducer`, `interviewView: interviewViewReducer` (the third one is added in Phase 2D — leave a TODO comment to add then, or add the import now and a stub reducer that just returns `{}` until 2D fills it).
- [ ] **2C.10** Build [`frontend/src/features/interviewers/InterviewerListPage.jsx`](../../frontend/src/features/interviewers/InterviewerListPage.jsx) + `.scss`: header with title + `+ New interviewer` button + `Search` input + `Active only` toggle. Table columns: Name, Email, Expertise (chips), Active (toggle pill), Created, Actions (Edit / Delete). Empty state.
- [ ] **2C.11** Build [`frontend/src/features/interviewers/InterviewerFormModal.jsx`](../../frontend/src/features/interviewers/InterviewerFormModal.jsx) + `.scss`: name, email, expertise (comma-separated input → split, trim), notes (textarea), active toggle (only on edit). On submit dispatches `createInterviewer` or `updateInterviewer`.
- [ ] **2C.12** Build [`frontend/src/features/interviews/InterviewListPage.jsx`](../../frontend/src/features/interviews/InterviewListPage.jsx) + `.scss`: header + filters (status select with all 4 statuses + "All", date-range pickers, candidate/interviewer filter combo). Table: Date/Time, Candidate, Interviewer, Status badge, Actions (View → links to detail). Click row → `/interviews/:id`.
- [ ] **2C.13** Build [`frontend/src/features/interviews/ScheduleInterviewModal.jsx`](../../frontend/src/features/interviews/ScheduleInterviewModal.jsx) + `.scss`: candidate picker (dropdown of `shortlisted` candidates only — fetches via `candidateApi.list({ status: 'shortlisted', limit: 100 })`), interviewer picker (dropdown of active interviewers — fetches via `interviewerApi.list({ isActive: true, limit: 100 })`), `DateTimeInput` for `scheduledAt`, number input for `durationMinutes` (default 45), `meetingUrl` text input with URL validation, `notes` textarea. On submit dispatches `scheduleInterview`. Surface server `E_*` errors as red banner.
- [ ] **2C.14** Build [`frontend/src/features/interviews/InterviewDetailPage.jsx`](../../frontend/src/features/interviews/InterviewDetailPage.jsx) + `.scss`. Layout:
  - Top card: schedule (date+time formatted, duration, status badge), candidate row (avatar + name + Round 1 score link), interviewer row (name + expertise chips), meeting URL (with `CopyButton`).
  - Two `CopyButton`s for "Candidate link" and "Interviewer link" — uses `${VITE_FRONTEND_URL}/interview/<token>` URLs (read from `interview.candidateAccessToken` / `interview.interviewerAccessToken`).
  - **Pending reschedule banner** if `interview.latestPendingReschedule` exists: original time, proposed time, reason, decision form (`note` input + Approve / Reject buttons).
  - **Reschedule history list** (collapsible) of all approved/rejected requests.
  - **Edit / Cancel / Complete** actions: Edit opens `ScheduleInterviewModal` pre-filled (only enabled when status === 'scheduled' AND no pending reschedule). Cancel and Complete are confirmable (`window.confirm` with reason input).
- [ ] **2C.15** Modify [`frontend/src/layouts/AdminLayout.jsx`](../../frontend/src/layouts/AdminLayout.jsx): extend `NAV` array with `{ to: '/interviewers', label: 'Interviewers', icon: '◈' }` and `{ to: '/interviews', label: 'Interviews', icon: '⌖' }` after `Submissions`.
- [ ] **2C.16** Modify [`frontend/src/routes/AppRoutes.jsx`](../../frontend/src/routes/AppRoutes.jsx): inside the protected `<AdminLayout />` block add three routes:
  ```jsx
  <Route path="/interviewers" element={<InterviewerListPage />} />
  <Route path="/interviews" element={<InterviewListPage />} />
  <Route path="/interviews/:id" element={<InterviewDetailPage />} />
  ```
- [ ] **2C.17** Modify [`frontend/src/features/candidates/CandidateListPage.jsx`](../../frontend/src/features/candidates/CandidateListPage.jsx): extend `STATUSES` array with `'shortlisted'` and `'rejected'` so they appear in the filter dropdown.
- [ ] **2C.18** Modify [`frontend/src/features/submissions/SubmissionDetailPage.jsx`](../../frontend/src/features/submissions/SubmissionDetailPage.jsx): in the `&__meta` row add a third tile showing Round 1 outcome:
  ```jsx
  <div>
    <strong>Round 1 outcome:</strong>{' '}
    {selected.round1Outcome ? <StatusBadge status={selected.round1Outcome} /> : '—'}
  </div>
  <div>
    <strong>Result email:</strong>{' '}
    {selected.round1ResultEmailedAt
      ? `Sent ${formatDate(selected.round1ResultEmailedAt)}`
      : selected.round1ResultEmailError
        ? <span className="submission-detail__email-error">Failed: {selected.round1ResultEmailError}</span>
        : 'Pending'}
  </div>
  ```
  Also extend `LABELS` map in `StatusBadge.jsx` for `disqualified: 'Disqualified'` so the badge renders.
- [ ] **2C.19** Modify [`frontend/src/features/dashboard/DashboardPage.jsx`](../../frontend/src/features/dashboard/DashboardPage.jsx): extend `KEYS` with `{ key: 'shortlisted', label: 'Shortlisted', tone: 'success' }`, `{ key: 'rejected', label: 'Rejected', tone: 'warn' }`. For "Interviews this week", fetch via `interviewApi.list({ from: <monday>, to: <sunday>, limit: 100 })` on mount and show count in a fourth card.
- [ ] **2C.20** Manual smoke test:
  1. Restart frontend.
  2. Navigate `Interviewers` → create one with your own email (so you can receive emails).
  3. Find a `shortlisted` candidate.
  4. `Interviews` → `+ Schedule` → fill in form pointing to a future time.
  5. Confirm both emails arrive.
  6. Open `/interviews/:id` → click "Copy interviewer link" → open in private window.
  7. (This will currently error since Phase 2D's view page isn't built yet — verify the URL pattern and stop here.)
- [ ] **2C.21** Run `npm run build` in `frontend/`. Expected: clean build.
- [ ] **2C.22** Commit:
  ```bash
  git add frontend/src
  git commit -m "feat(frontend): phase 2c — admin UI for interviewers and interviews

   - Interviewer CRUD list + form modal
   - Interview list + schedule modal (shortlisted candidates only) + detail page
   - Pending reschedule banner with approve/reject decision form
   - Status badge: +shortlisted/+rejected/+scheduled/+reschedule_requested/+cancelled
   - Dashboard: +Shortlisted/Rejected/Interviews-this-week cards
   - Submission detail: Round 1 outcome + email status panel
   - DateTimeInput + CopyButton common components
   - Sidebar: +Interviewers, +Interviews"
  ```

### Phase 2D — Frontend public: interview view page + reschedule form

**Deliverable:** Candidate and interviewer can each open their tokenized URL, see schedule, click "Join meeting" to open external URL. Interviewer can also click "Request reschedule" to submit a new time. After HR decides, both reload to see the updated time. Interview ends → page shows the locked state.

- [ ] **2D.1** Build [`frontend/src/api/interviewViewApi.js`](../../frontend/src/api/interviewViewApi.js): `buildInterviewClient(token)` returns an `axios` instance with `x-interview-token` header. Exports `getDetails()` and `requestReschedule({ proposedAt, proposedDurationMinutes, reason })` factories.
- [ ] **2D.2** Build [`frontend/src/features/interviewView/interviewViewSlice.js`](../../frontend/src/features/interviewView/interviewViewSlice.js): thunks `fetchInterviewDetails({ token })`, `submitReschedule({ token, proposedAt, proposedDurationMinutes, reason })`. State: `details`, `viewerRole`, `loadStatus`, `loadError`, `submitStatus`, `submitError`. Action `resetInterviewView`.
- [ ] **2D.3** Modify [`frontend/src/app/store.js`](../../frontend/src/app/store.js): replace stub from 2C with `interviewView: interviewViewReducer`.
- [ ] **2D.4** Build [`frontend/src/features/interviewView/InterviewViewPage.jsx`](../../frontend/src/features/interviewView/InterviewViewPage.jsx) + `.scss`. On mount: read `:token` param, dispatch `fetchInterviewDetails`. Render states:
  - Loading → `<Loader fullscreen />`
  - Failed (401 / 410) → friendly error card matching the test-page style: "This interview link is invalid or has ended."
  - Loaded:
    - Hero card: schedule (formatted via `datetime.formatScheduledAt`) + duration + status badge.
    - Two-column row: candidate card (just name) and interviewer card (name + expertise chips).
    - Big "Join meeting" button → `window.open(meetingUrl, '_blank', 'noopener')`. Hidden if status is `completed` / `cancelled`.
    - HR notes panel — only when `viewerRole === 'interviewer'` and `notes` present.
    - Reschedule section:
      - If `latestPendingReschedule` exists → banner "Reschedule requested for `<proposedAt>`, awaiting HR review."
      - Else if `viewerRole === 'interviewer' && canRequestReschedule` → `<RescheduleRequestForm token={token} />` rendered inline, collapsible.
- [ ] **2D.5** Build [`frontend/src/features/interviewView/RescheduleRequestForm.jsx`](../../frontend/src/features/interviewView/RescheduleRequestForm.jsx) + `.scss`: collapsible form with `DateTimeInput` for `proposedAt`, optional `proposedDurationMinutes` number input (placeholder "same as current"), optional `reason` textarea, Submit button. On dispatch success replaces itself with the pending banner via dispatching another `fetchInterviewDetails` to refresh state.
- [ ] **2D.6** Modify [`frontend/src/routes/AppRoutes.jsx`](../../frontend/src/routes/AppRoutes.jsx): inside the `<PublicLayout />` block (already used for the candidate test flow), add `<Route path="/interview/:token" element={<InterviewViewPage />} />`.
- [ ] **2D.7** Manual end-to-end smoke test:
  1. Restart frontend.
  2. Resume from Phase 2C step 7 — open the interviewer URL in a private window.
  3. Confirm schedule renders, viewerRole shows interviewer-only HR notes.
  4. Click "Request reschedule" → submit a time → confirm banner shows pending and HR receives notification email.
  5. In admin window: open interview detail → approve with a note → confirm both emails arrive with new time.
  6. Refresh interviewer URL → confirm new time renders, banner gone.
  7. Mark interview complete in admin → refresh interviewer URL → confirm "ended" lock state.
- [ ] **2D.8** Run `npm run build` in `frontend/` and `npm test` in `backend/`. Both green. Clean up `dist/`.
- [ ] **2D.9** Update [`README.md`](../../README.md) (root) with a Phase 2 section: list new capabilities, add `/interviewers`, `/interviews`, `/interview/:token` to the routes summary, and bump the email count. Update the screenshot/summary text where needed.
- [ ] **2D.10** Commit:
  ```bash
  git add frontend/src README.md
  git commit -m "feat(frontend): phase 2d — public interview view page + reschedule request form

   - /interview/:token wrapper page (candidate view + interviewer view)
   - Interviewer-only HR notes + reschedule request form
   - Pending reschedule banner reflects across both roles
   - Locked state on completed/cancelled interviews
   - Routes: /interview/:token under PublicLayout"
  ```

---

## Self-review notes (author's checklist against the spec)

**Spec coverage check** (each spec section → task that implements it):
- Spec §3 Auto pass/fail/disqualified email → 2A.14–2A.18
- Spec §3 Candidate.status `shortlisted`/`rejected` → 2A.1, 2A.18 (transition logic), 2C.4 (UI)
- Spec §3 Interviewer CRUD → 2A.7–2A.13, 2C.5/2C.7/2C.10/2C.11
- Spec §3 Schedule Round 2 → 2B.1–2B.3, 2B.8–2B.17, 2C.13
- Spec §3 Email both parties on schedule → 2B.10, 2B.14
- Spec §3 System wrapper page `/interview/:token` → 2D.4–2D.6
- Spec §3 Interviewer-initiated reschedule → 2B.8 (`requestReschedule`), 2D.5
- Spec §3 HR approve/reject reschedule → 2B.8 (`decideReschedule`), 2C.14 (decision UI)
- Spec §3 HR direct edit re-notifies → 2B.8 (`update`), 2C.14 (Edit modal)
- Spec §3 HR cancel / complete → 2B.8, 2C.14
- Spec §5.1–5.3 Models → 2A.7, 2B.1, 2B.2
- Spec §5.4 Candidate.status, Submission extensions → 2A.1, 2A.4
- Spec §5.5 State machines → 2B.8 (guards enforce them)
- Spec §5.6 Cascade → 2B.21 (candidate delete), 2B.23 (interviewer delete guard)
- Spec §6 API surface → 2A.12 (interviewers), 2B.17 (interviews admin), 2B.18 (public)
- Spec §6.5 Service guards (overlap, shortlisted-only, etc.) → 2B.8 + 2B.24 unit tests
- Spec §7 Six new email templates + triggers → 2A.14/15/16, 2B.10/11/12/13
- Spec §8 Constants & env → 2A.1, 2A.2
- Spec §9 Frontend → all 2C and 2D tasks
- Spec §10 Security (rateLimiter for reschedule, token strength) → 2A.5 (token), 2B.19 (limiter)
- Spec §11 Tests → 2A.6 (interviewToken), 2A.20 (round1Outcome), 2B.24 (interviewService)

**Placeholder scan:** No `TBD` / `TODO` / "fill in details" markers. Every task references concrete files, has a clear acceptance gate (test passing or smoke step), and includes commit instructions at phase boundaries.

**Type / name consistency check:**
- Constants name: `PASS_THRESHOLD_PERCENT` used in 2A.1, 2A.18, 2A.20.
- Constants name: `INTERVIEW_DEFAULT_DURATION_MINUTES` used in 2A.1, 2A.2, default `45` in 2C.13.
- `Interview.status` values `scheduled / reschedule_requested / completed / cancelled` used identically in 2B.1, 2B.5 (middleware), 2B.8 (guards), 2C.4 (badge map), 2C.12 (filter), 2D.4 (lock state).
- `RescheduleRequest.status` values `pending / approved / rejected` used in 2B.2, 2B.8, 2C.14.
- `viewerRole` values `'candidate' | 'interviewer'` consistent across 2B.5, 2B.8, 2B.16, 2D.4.
- Token field names `candidateAccessToken` / `interviewerAccessToken` consistent across 2B.1, 2B.3, 2B.5, 2C.14, 2D.1.

---

## Execution

Plan complete and saved to [`docs/superpowers/plans/2026-05-06-phase-2-interview-process.md`](2026-05-06-phase-2-interview-process.md). Two execution options:

1. **Subagent-driven (recommended)** — I dispatch a fresh subagent per phase (or sub-phase), review outputs between handoffs, fast iteration.
2. **Inline execution** — I execute tasks in this session with checkpoints between phases (matches how Phase 1 was built — same pattern, same pace).

Which approach?
