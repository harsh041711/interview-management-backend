# Phase 2 — Full Interview Process · Design Spec

**Date:** 2026-05-06
**Status:** Approved (sections §1–§4) · Pending implementation plan

---

## 1. Goal

Extend the existing Interview Management System (Phase 1: HR creates candidate → candidate takes timed test → graded → HR report) with the post-test workflow: automatic candidate notification of result, interviewer roster management, and Round 2 scheduling with a reschedule loop.

## 2. Decisions locked during brainstorming

| # | Decision |
| --- | --- |
| 1 | **Interviewers are email-only.** No login, no password, no portal. They interact via tokenized URLs in emails. |
| 2 | **Interview link is a system-generated wrapper page** that embeds the HR-provided external meeting URL (Zoom / Meet / Teams). The system owns the schedule URL; the call happens on the external platform. |
| 3 | **Single time slot picked by HR** (date + time + duration). No multi-slot proposals; no calendar availability. |
| 4 | **Reschedule = interviewer proposes → HR approves → both re-notified.** Candidates cannot initiate reschedules in Phase 2. |
| 5a | **Pass threshold is fixed at 50%** (constant in code, not per-candidate). |
| 5b | **Multiple Round 2 interviews per candidate are allowed** (e.g. technical + cultural). No DB-level uniqueness on `(candidate)`. |
| 6 | **Cheated candidates also receive an email** — a third "test invalidated, no further consideration" variant. |

## 3. Scope

### In scope

- Auto pass / fail / disqualified email after Round 1 grading.
- `Candidate.status` extended with `shortlisted`, `rejected`.
- Full CRUD for **Interviewer** entity (admin-only).
- Schedule a Round 2 **Interview** (HR-only): pick candidate (must be `shortlisted`) + interviewer + datetime + duration + meeting URL + optional notes.
- Email both parties on schedule, each with a unique tokenized URL.
- System wrapper page at `/interview/:token` displaying schedule details and a "Join meeting" button that opens the external URL.
- Interviewer-initiated reschedule request via that page.
- HR sees pending reschedule requests in admin panel and approves / rejects, triggering re-notification emails.
- HR can also directly edit a `scheduled` interview's time / duration / meeting URL — same re-notification email goes out.
- HR can mark interview `completed` or `cancelled`.

### Out of scope (deferred)

- Interviewer login / dashboard.
- Candidate-initiated reschedule.
- Post-interview structured feedback / scoring inside the app.
- Multi-slot proposals; recurring interviewer availability calendars.
- Calendar `.ics` attachments; Google Calendar / Outlook integration.
- In-app video / WebRTC.
- Email retry queue (current pattern is fire-and-forget with logged failures; same as Phase 1 HR report).

## 4. Architecture overview

Same layered backend (`controllers → services → repositories → models`), feature-based frontend (Redux Toolkit slices co-located with pages). Phase 2 adds:

**Backend modules**
- Models: `Interviewer`, `Interview`, `RescheduleRequest`
- Repositories: `interviewerRepository`, `interviewRepository`, `rescheduleRequestRepository`
- Services: `interviewerService`, `interviewService` (covers schedule + reschedule decisions + cancel + complete)
- Controllers: `interviewerController`, `interviewController`, `interviewPublicController` (token-based)
- Routes: `interviewerRoutes`, `interviewRoutes`, `interviewPublicRoutes` (mounted at `/interview` for the candidate/interviewer view, separate from admin `/interviews`)
- Validators: `interviewerValidator`, `interviewValidator`
- Middlewares: `interviewMiddleware` (token guard + role inference)
- Utils: `interviewToken` (generate / verify, mirrors `tokenGenerator.js`)
- Templates: `round1ShortlistedEmail`, `round1RejectedEmail`, `round1DisqualifiedEmail`, `interviewScheduledEmail`, `rescheduleRequestedEmail`, `rescheduleApprovedEmail`, `rescheduleRejectedEmail`

**Frontend modules**
- `features/interviewers/` — slice, list page, form modal
- `features/interviews/` — slice, list page, schedule modal, detail page (with reschedule decision UI)
- `features/interviewView/` — public token slice, single-page view, reschedule request form
- Touches in existing slices/pages: `Candidate.status` filter dropdown, `Submission` detail panel, dashboard stat cards, sidebar nav

## 5. Data model

### 5.1 Interviewer

```js
{
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  expertise: { type: [String], default: [] },        // e.g. ['React', 'Node']
  isActive: { type: Boolean, default: true, index: true },
  notes: { type: String, maxlength: 500 },
  createdBy: { type: ObjectId, ref: 'Admin', required: true },
  timestamps: true,
}
```
Index: `{ email: 1 }` unique, `{ isActive: 1, createdAt: -1 }`.

### 5.2 Interview

```js
{
  candidate: { type: ObjectId, ref: 'Candidate', required: true, index: true },
  interviewer: { type: ObjectId, ref: 'Interviewer', required: true, index: true },
  scheduledAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, default: 45, min: 15, max: 240 },
  meetingUrl: { type: String, required: true },
  notes: { type: String, maxlength: 1000 },

  candidateAccessToken: { type: String, required: true, unique: true, index: true },
  interviewerAccessToken: { type: String, required: true, unique: true, index: true },

  status: {
    type: String,
    enum: ['scheduled', 'reschedule_requested', 'completed', 'cancelled'],
    default: 'scheduled',
    index: true,
  },
  scheduledBy: { type: ObjectId, ref: 'Admin', required: true },
  completedAt: { type: Date, default: null },
  completionNote: { type: String, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: null },

  timestamps: true,
}
```
Indexes: `{ candidate: 1, scheduledAt: -1 }`, `{ interviewer: 1, scheduledAt: -1 }`, `{ status: 1, scheduledAt: -1 }`.

**Tokens** are generated by `interviewToken.generate()` — UUIDv4 + HMAC-SHA256 (truncated 32 chars), constant-time verified, **no expiry** (interview access naturally locks once status is `completed` or `cancelled`).

### 5.3 RescheduleRequest

```js
{
  interview: { type: ObjectId, ref: 'Interview', required: true, index: true },
  proposedAt: { type: Date, required: true },
  proposedDurationMinutes: { type: Number, min: 15, max: 240 },
  reason: { type: String, maxlength: 500 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  decidedBy: { type: ObjectId, ref: 'Admin', default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: null },
  timestamps: true,
}
```
Service-layer invariant (no DB constraint, since partial unique indexes are awkward): **at most one `pending` request per `interview`**. Service rejects new requests if an existing pending one is found, asks the interviewer to wait for HR's decision.

### 5.4 Extensions to existing models

**`Candidate.status`** enum gains: `shortlisted`, `rejected`.
Constants in `backend/src/utils/constants.js`:
```js
const CANDIDATE_STATUS = Object.freeze({
  PENDING, PHOTO_CAPTURED, IN_PROGRESS,
  COMPLETED,            // existing — kept, but immediately replaced by SHORTLISTED / REJECTED at submission
  SHORTLISTED,          // new
  REJECTED,             // new
  EXPIRED, CHEATED,
});
```
*`COMPLETED` becomes a transient internal value: candidates effectively transition `in_progress → shortlisted | rejected | cheated` on submission.* HR's filter dropdown adds the new statuses; existing rows in DB with `completed` are still rendered correctly.

**`Submission`** gains:
```js
round1ResultEmailedAt: { type: Date, default: null },
round1ResultEmailError: { type: String, default: null },
round1Outcome: { type: String, enum: ['shortlisted', 'rejected', 'disqualified'], default: null },
```

### 5.5 State machines

**`Interview.status`**

```
              HR creates                                        HR cancels
                  │                                                ▲
                  ▼                                                │
            ┌───────────┐  HR direct-edits ┌───────────┐  ────────┘
            │ scheduled │ ───────────────▶│ scheduled │
            └─────┬─────┘   (re-notify)   └───────────┘
   interviewer    │                              │
   requests       │                              ▼
   reschedule     │                       HR marks complete
                  ▼                              │
   ┌──────────────────────────┐                  ▼
   │  reschedule_requested    │           ┌───────────┐
   └──────┬───────────────┬───┘           │ completed │
   HR     │               │  HR           └───────────┘
   reject │               │  approve  (mutates scheduledAt + duration; re-notify both)
          ▼               ▼
       scheduled       scheduled
```

- HR can `cancel` from any non-terminal state.
- HR can `complete` only from `scheduled` (not while a reschedule is pending — must decide first).
- Direct edits are blocked while in `reschedule_requested`.

**`RescheduleRequest.status`** is linear: `pending → approved` or `pending → rejected`. Approved/rejected requests stay forever as audit trail.

**`Candidate.status` transitions added**
- `in_progress → shortlisted` (Round 1 graded, ≥ 50%, no cheating)
- `in_progress → rejected` (Round 1 graded, < 50%, no cheating)
- `in_progress → cheated` (existing, unchanged)
- `cheated` is terminal — no Round 2 scheduling allowed for cheated candidates (service rejects).

### 5.6 Cascade

- Deleting a `Candidate` (`candidateService.remove`) → also deletes their `Interview`s and any `RescheduleRequest`s linked to those interviews. Cloudinary photo cleanup unchanged.
- Soft-disabling an `Interviewer` (`isActive: false`) does **not** cascade. Existing interviews remain. The HR scheduling picker hides inactive interviewers.
- Hard-deleting an `Interviewer` is blocked by service if any `Interview` references them — HR must cancel those interviews first or soft-disable.

## 6. API surface

Base path `/api/v1`. Authentication column: **JWT** = admin Bearer; **Token** = `x-interview-token` header.

### 6.1 Interviewers (admin)

| Method | Path | Auth | Body / Query |
| --- | --- | --- | --- |
| POST | `/interviewers` | JWT | `{ name, email, expertise?: string[], notes? }` |
| GET | `/interviewers` | JWT | `?page&limit&search&isActive` |
| GET | `/interviewers/:id` | JWT | — |
| PUT | `/interviewers/:id` | JWT | partial of create body, plus `isActive` |
| DELETE | `/interviewers/:id` | JWT | hard delete; service-blocked if active interviews exist |

### 6.2 Interviews (admin)

| Method | Path | Auth | Body / Query |
| --- | --- | --- | --- |
| POST | `/interviews` | JWT | `{ candidateId, interviewerId, scheduledAt, durationMinutes?, meetingUrl, notes? }` |
| GET | `/interviews` | JWT | `?status&candidateId&interviewerId&from&to&page&limit` |
| GET | `/interviews/:id` | JWT | populated: candidate, interviewer, latest pending reschedule, full reschedule history |
| PUT | `/interviews/:id` | JWT | direct edit while in `scheduled`: `{ scheduledAt?, durationMinutes?, meetingUrl?, notes? }` |
| POST | `/interviews/:id/cancel` | JWT | `{ reason? }` |
| POST | `/interviews/:id/complete` | JWT | `{ note? }` |
| POST | `/interviews/:id/reschedule-decision` | JWT | `{ decision: 'approved'\|'rejected', note? }` — operates on the latest `pending` request |

### 6.3 Public interview view (token-based)

Mounted under `/interview` (singular). All require `x-interview-token` header.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/interview/details` | Returns sanitized payload `{ id, schedule:{scheduledAt,durationMinutes}, candidate:{name}, interviewer:{name,expertise}, meetingUrl, status, viewerRole, canRequestReschedule, latestPendingReschedule }` |
| POST | `/interview/reschedule` | Allowed only when `viewerRole === 'interviewer'`, `status === 'scheduled'`, no existing pending request. Body `{ proposedAt, proposedDurationMinutes?, reason? }` |

`410 Gone` is returned if `status` is `completed` or `cancelled` — the wrapper page renders a friendly read-only message.

### 6.4 Validation rules (Joi)

- All `scheduledAt` / `proposedAt` must parse as ISO date and be **strictly greater than `now`**, plus reschedule proposals must be ≥ 15 minutes from now (cushion against accidental same-second submission).
- `meetingUrl` must be `http://` or `https://` URL (Joi `string().uri({ scheme: ['http','https'] })`).
- `durationMinutes` integer in [15, 240].
- `reason` / `notes` / `note` / `cancelReason` strings ≤ 500–1000 chars per field (per model).

### 6.5 Service-layer guards (beyond Joi)

- **`interviewService.schedule`** — rejects if candidate is not `shortlisted` (`E_NOT_SHORTLISTED`), if interviewer is not `isActive` (`E_INTERVIEWER_INACTIVE`), or if interviewer has an overlapping interview within the chosen `[scheduledAt, scheduledAt + durationMinutes]` window (`E_INTERVIEWER_BUSY`). Overlap check uses `status: { $in: ['scheduled', 'reschedule_requested'] }`.
- **`interviewService.update`** (direct edit) — only allowed when `status === 'scheduled'`. Rejects if a pending reschedule request exists (HR must decide that first).
- **`interviewService.requestReschedule`** — rejects if interview status is not `scheduled` (`E_NOT_RESCHEDULABLE`); rejects if a pending request already exists (`E_RESCHEDULE_PENDING`).
- **`interviewService.decideReschedule`** — rejects if no pending request found (`E_NO_PENDING_RESCHEDULE`); on `approved`, the decision call also runs the same overlap check on the new time.
- **`interviewService.complete`** — rejects unless status is `scheduled`.
- **`interviewService.cancel`** — allowed from any non-terminal state.
- **`candidateService.remove`** — also deletes interviews + reschedule requests inside one repository helper to keep the controller thin.

## 7. Email flows

Six new templates plus the existing HR report. All sent fire-and-forget via `setImmediate`; failures logged via `winston`. SMTP and email infrastructure unchanged from Phase 1.

| # | Trigger (concrete code path) | To | Template |
| --- | --- | --- | --- |
| 1 | `testService.finalize` after grading: `submission.percentage >= 50` and `cheatDetected === false` → `submission.round1Outcome = 'shortlisted'`, `candidate.status = 'shortlisted'` | Candidate | `round1ShortlistedEmail` |
| 2 | `testService.finalize`: `submission.percentage < 50` and `cheatDetected === false` → `'rejected'`, `candidate.status = 'rejected'` | Candidate | `round1RejectedEmail` |
| 3 | `testService.finalize`: `cheatDetected === true` → `submission.round1Outcome = 'disqualified'`, `candidate.status = 'cheated'` (unchanged) | Candidate | `round1DisqualifiedEmail` |
| 4 | `interviewService.schedule` post-persist; also `interviewService.update` when `scheduledAt` / `durationMinutes` / `meetingUrl` changes | Candidate **and** Interviewer (one email each, different access URL) | `interviewScheduledEmail` |
| 5 | `interviewService.requestReschedule` post-persist | Admin (uses `Admin.hrNotificationEmail`, falls back to `SMTP_USER`) | `rescheduleRequestedEmail` |
| 6a | `interviewService.decideReschedule` with `decision: 'approved'` post-persist | Candidate **and** Interviewer | `rescheduleApprovedEmail` |
| 6b | `interviewService.decideReschedule` with `decision: 'rejected'` post-persist | Interviewer only | `rescheduleRejectedEmail` |

**Wrapper-page URLs in emails:**
- Candidate URL: `${FRONTEND_URL}/interview/${candidateAccessToken}`
- Interviewer URL: `${FRONTEND_URL}/interview/${interviewerAccessToken}`

Sender + threading rules (same as Phase 1):
- `from: env.smtp.from`
- For invitation, scheduled, reschedule emails — `subject` includes the interview's local date so multi-round threads stay distinct.

## 8. Constants & config

In `backend/src/utils/constants.js`:
```js
const PASS_THRESHOLD_PERCENT = 50;
const INTERVIEW_DEFAULT_DURATION_MINUTES = 45;
const ROUND1_OUTCOMES = Object.freeze({
  SHORTLISTED: 'shortlisted',
  REJECTED: 'rejected',
  DISQUALIFIED: 'disqualified',
});
const INTERVIEW_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  RESCHEDULE_REQUESTED: 'reschedule_requested',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});
const RESCHEDULE_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});
```

In `backend/.env.example`:
```
INTERVIEW_DEFAULT_DURATION_MINUTES=45
```
Optional. Falls back to constant default if unset.

No new third-party packages required. All emails reuse Nodemailer; tokens reuse `crypto.randomUUID()` + HMAC; URL building reuses the same `FRONTEND_URL` env var.

## 9. Frontend

### 9.1 Sidebar / nav

`AdminLayout.jsx` `NAV` array becomes:
```js
[
  { to: '/dashboard', label: 'Dashboard', icon: '◎' },
  { to: '/candidates', label: 'Candidates', icon: '◉' },
  { to: '/questions', label: 'Questions', icon: '◆' },
  { to: '/submissions', label: 'Submissions', icon: '☰' },
  { to: '/interviewers', label: 'Interviewers', icon: '◈' },
  { to: '/interviews', label: 'Interviews', icon: '⌖' },
]
```

### 9.2 Routes (`AppRoutes.jsx` additions)

```
Protected (AdminLayout):
  /interviewers              → InterviewerListPage
  /interviews                → InterviewListPage
  /interviews/:id            → InterviewDetailPage

Public (PublicLayout):
  /interview/:token          → InterviewViewPage
```

### 9.3 New features

- **`features/interviewers/`** — `interviewerSlice.js`, `InterviewerListPage.jsx`, `InterviewerFormModal.jsx`.
- **`features/interviews/`** — `interviewSlice.js`, `InterviewListPage.jsx`, `ScheduleInterviewModal.jsx`, `InterviewDetailPage.jsx`.
- **`features/interviewView/`** — `interviewViewSlice.js`, `InterviewViewPage.jsx`, `RescheduleRequestForm.jsx`.

### 9.4 Touches to existing pages

- **`StatusBadge.jsx`** — extend variant map: `shortlisted → success`, `rejected → danger-soft`, `scheduled → info`, `reschedule_requested → warn`, `completed → success`, `cancelled → muted`.
- **`CandidateListPage`** — status filter dropdown adds `shortlisted`, `rejected`. Existing `STATUSES` array extended.
- **`SubmissionDetailPage`** — add small panel showing Round 1 outcome (`shortlisted` / `rejected` / `disqualified`) and email status (`emailedAt` or `emailError`), pulled from new `Submission` fields.
- **`DashboardPage`** — three new stat cards: `Shortlisted`, `Rejected`, `Interviews this week`. Uses existing `stat-card` component.

### 9.5 Reusable additions

- **`<DateTimeInput>`** — `datetime-local` wrapper with min validation + local timezone label. Used in schedule modal, direct-edit, and reschedule form.
- **`<CopyButton>`** — small button + toast feedback. Reuses existing `copyToClipboard` util.

### 9.6 API client additions

- `interviewerApi.js`, `interviewApi.js` — admin (uses existing `apiClient`).
- `interviewViewApi.js` — exposes `buildInterviewClient(token)` mirroring the Phase 1 `buildTestClient` pattern.

### 9.7 Out of scope for Phase 2 frontend

- Sortable / column-resizable tables (existing tables stay simple).
- Inline date pickers beyond `datetime-local`.
- Internationalization / multi-language emails.

## 10. Security & abuse considerations

- **Token strength** — Same as Phase 1: 32-char UUID + 32-char HMAC suffix, constant-time compare via `crypto.timingSafeEqual`. Per-interview tokens are unguessable; even if one is leaked, it grants only that interview's view + (for interviewer side) reschedule request.
- **Token scope** — A token never reveals the meeting URL on the frontend until validated by the backend. The frontend never echoes the token in any URL except its own (no third-party redirects).
- **Rate limiting** — `POST /interview/reschedule` capped at 3 / 60s per IP (new `rescheduleLimiter`). `POST /interviews` (HR) and the rest of admin endpoints continue under the global admin limiter.
- **Authorization** — Every admin endpoint goes through `requireAuth` + `requireRole('admin')`. Interviewer is a data entity, not an authenticated principal; nothing escalates from the public token to admin power.
- **Email recipient validation** — Interviewer email is unique-validated at create time; candidate email is already trusted from Phase 1. Outbound `from` is the configured SMTP user (Gmail enforces this).
- **Audit** — `Interview.scheduledBy`, `RescheduleRequest.decidedBy`, plus immutable timestamps and the full reschedule history kept on the interview detail page.

## 11. Testing

Unit (Jest, runs in CI):
- `interviewToken` — generation uniqueness, signature verification, tampered-token rejection.
- `interviewService.schedule` — rejects non-shortlisted candidate; rejects inactive interviewer; rejects overlap.
- `interviewService.requestReschedule` — rejects non-`scheduled` status; rejects when pending exists; sets status to `reschedule_requested`.
- `interviewService.decideReschedule` — `approved` mutates `scheduledAt` + `durationMinutes` and flips status back to `scheduled`; `rejected` keeps original time; both stamp `decidedBy/decidedAt`.

Integration:
- End-to-end pass path: complete a Round 1 submission ≥ 50% → assert `round1Outcome = 'shortlisted'`, `Candidate.status = 'shortlisted'`, mocked email transport called once with `round1ShortlistedEmail`.
- End-to-end interview lifecycle: schedule → interviewer requests reschedule → HR approves → emails fire on each transition.

Mocks: AI service mocked (already in Phase 1 tests). Email transport mocked via Nodemailer's stub transport so we can assert calls without sending.

## 12. Migration / backfill

No destructive migrations. Existing `candidate.status === 'completed'` rows remain valid; the UI supports them, and new submissions will use the new outcomes. A small one-shot helper script `backend/scripts/backfill-round1-outcomes.js` is included for convenience: it walks existing `Submission` documents, computes the outcome from `cheatDetected` and `percentage`, and back-populates `round1Outcome`. Idempotent. Optional to run.

## 13. Open / deferred questions (acknowledged, not blocking)

- Whether to track post-interview rating / hire-decision in app — defer to a Phase 3 spec.
- Calendar integration — defer.
- Interviewer dashboard with login — defer.
- Localization of email templates — defer.

---

## Self-review notes (for the author of this spec)

- **Placeholder scan:** No `TBD` / `TODO` / "fill in later" markers.
- **Internal consistency:** Statuses (`Interview.status`, `RescheduleRequest.status`, new `Candidate.status` values) referenced identically in §5 (data model), §6 (validation), §7 (email triggers), §9 (UI), and §11 (tests). The pass threshold (50%) appears in §2, §5.4, §7, §8.
- **Scope:** Single feature shippable as one phase. All four sub-capabilities (auto-result email, interviewer CRUD, schedule, reschedule) are tightly coupled by shared models and email infrastructure — splitting them would yield half-features.
- **Ambiguity:** `Candidate.status === 'completed'` is now described as transient (§5.4); the UI explicitly tolerates legacy rows; outbound code never produces it.
