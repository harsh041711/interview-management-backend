# Phase 4 — JD-based Resume Screening (Design)

**Status:** Draft for review
**Date:** 2026-05-12

## 1. Goal

Insert a JD-driven, AI-assisted resume-screening step between candidate creation and the Round 1 test. HR maintains a JD library; on candidate creation the system scores the resume against the matching JD, surfaces structured strengths/gaps to HR, and gates the Round 1 test behind an explicit HR Approve/Decline decision with corresponding candidate emails.

## 2. End-to-end flow

```
HR authors JD (once, reusable)
         │
         ▼
HR creates candidate (stack, experience, resume.pdf)
         │
         ▼
[Backend looks up JD by (stack, experience)]
         │
         ├── JD exists ──→ Extract resume text → Gemini chain → Groq fallback
         │                                                          │
         │                                            ┌─────────────┼─────────────┐
         │                                            ▼             ▼             ▼
         │                                         scored        skipped        failed
         │                                            │             │             │
         │                                            └────────┬────┴─────────────┘
         │                                                     ▼
         ▼                                              resume_pending
   (no JD) ─────────────────────────────────────────────────┘
                                                              │
                                ┌─────────────────────────────┴─────────────────────────────┐
                                ▼                                                           ▼
                          HR Approve                                                  HR Decline
                                │                                                           │
                                ▼                                                           ▼
                       resume_approved                                              resume_declined
                       (shortlist email)                                            (rejection email)
                                │                                                   (terminal)
                                ▼
                       HR "Send test"
                                │
                                ▼
                           pending  ─── (existing Round 1 flow continues unchanged)
                                │
                                ▼
                          submitted → shortlisted / rejected / cheated → ...
```

**Soft gate, not hard gate.** The 60% threshold is advisory. Both Approve and Decline buttons are always visible. If HR overrides the AI recommendation (Approves a <60% match, or Declines a ≥60% match), a confirmation modal fires. Mirrors real hiring discretion (referrals, external context).

## 3. JD library

### 3.1 Mongoose model — `JobDescription`

```js
{
  title:             String   (required, ≤200),
  techStack:         String   (required, lowercase, indexed),
  experience:        enum ['entry', 'mid', 'senior'] (required),

  jobRole:           String   (required, ≤2000),   // intro paragraph
  responsibilities:  String   (required, ≤5000),   // bulleted text
  qualifications:    String   (required, ≤5000),   // bulleted text
  niceToHave:        String   (optional, ≤3000),   // bulleted text

  minYears:          Number   (0–50, optional),
  maxYears:          Number   (0–50, optional),
  location:          String   (≤200, optional),

  isActive:          Boolean  (default true),
  createdBy:         ObjectId (ref Admin),
  timestamps:        true,
}
```

### 3.2 Uniqueness

Partial unique compound index on `{ techStack: 1, experience: 1 }` with `partialFilterExpression: { isActive: true }`. Enforces exactly one *active* JD per `(stack, experience)` combo. Soft-deleted JDs don't block creating a fresh one for the same combo.

### 3.3 Lifecycle

- **Reusable, not consumed.** A JD stays active and applies to every future candidate matching `(stack, experience)`. It is **never auto-deactivated** — not after one candidate is scored, not after a candidate finishes the test, not after a position is "filled."
- **Manual deactivation only** — HR explicitly clicks Deactivate. Sets `isActive = false`. Soft-delete.
- Candidates already scored against a now-inactive JD keep their `jdSnapshot` intact (audit trail preserved).

### 3.4 Admin UI — `/job-descriptions`

- New sidebar entry: **Job Descriptions**.
- List view columns: `Title | Tech / Experience | Years | Location | Status | Updated | Actions`.
- Filters: search, experience dropdown, active/inactive toggle.
- Create/edit form: four labeled `<textarea>`s in this exact order — **Job Role**, **Role + Responsibilities**, **Person Specification and Qualifications**, **Plus Points (Nice-to-Have)** — plus `title`, `techStack`, `experience`, `minYears`, `maxYears`, `location`.
- Deactivate (not hard delete) on row actions.

### 3.5 API surface (admin-only, `requireRole('admin')`)

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/api/v1/job-descriptions`              | Paginated list with filters |
| `POST`   | `/api/v1/job-descriptions`              | Create (409 if active JD exists for combo) |
| `GET`    | `/api/v1/job-descriptions/:id`          | Detail |
| `PATCH`  | `/api/v1/job-descriptions/:id`          | Update |
| `DELETE` | `/api/v1/job-descriptions/:id`          | Soft-delete (sets `isActive = false`) |
| `GET`    | `/api/v1/job-descriptions/lookup`       | Internal: find matching active JD via `?techStack=...&experience=...` |

## 4. Resume screening service

### 4.1 Trigger points (both synchronous)

1. **Candidate create** — if an active JD exists for the candidate's `(techStack, experience)`, the screening runs before the API response returns. Frontend shows a "screening resume…" loading state (3–8s typical).
2. **Re-screen against current JD** button on the candidate detail page — manual re-run. Used after resume re-upload or JD edits.

### 4.2 Text extraction

- Resume already uploaded to Cloudinary as raw upload (PDF/DOCX, existing flow). Extraction runs server-side after Cloudinary upload completes.
- `pdf-parse` for PDFs, `mammoth` for DOCX.
- Strip excess whitespace; cap at ~20000 chars for the prompt.
- Empty/unparseable text → skip AI call, `screening.status = 'failed'`.

### 4.3 AI fallback chain

Mirrors existing `evaluationService` chain exactly:

`Gemini 2.5-flash → 2.5-flash-lite → 2.0-flash → 2.0-flash-lite → Groq llama-3.3-70b-versatile → llama-3.1-8b-instant`

Each provider's failure (network error, malformed JSON, schema validation fail) falls through to the next. All 6 fail → `screening.status = 'failed'`.

### 4.4 Prompt (JSON-forced output)

```
You are a senior technical recruiter. Score how well the candidate's resume
matches the job description. Be strict but fair.

JOB DESCRIPTION:
Title: {title} · {techStack} · {experience} · {minYears}-{maxYears} years

Job Role:
{jobRole}

Role + Responsibilities:
{responsibilities}

Person Specification and Qualifications:
{qualifications}

Plus Points (Nice-to-Have):
{niceToHave}

CANDIDATE RESUME:
{resumeText}

Respond with ONLY valid JSON in this exact shape:
{
  "matchPercent": <0-100 integer>,
  "greenFlags":  [<at most 6 short phrases>],
  "redFlags":    [<at most 6 short phrases>],
  "summary":     "<1-2 sentence overall assessment>"
}
```

### 4.5 Storage — `Candidate.screening` sub-document

```js
screening: {
  status:        enum ['scored', 'skipped', 'failed'] (required),
  matchPercent:  Number   (0–100, present when scored),
  greenFlags:    [String] (≤6 entries when scored),
  redFlags:      [String] (≤6 entries when scored),
  summary:       String   (≤500 chars when scored),
  jdId:          ObjectId (ref JobDescription, soft-link),
  jdSnapshot: {
    title, jobRole, responsibilities, qualifications,
    niceToHave, minYears, maxYears,
  },
  resumeText:    String   (≤20000, useful for re-screen and debug),
  scoredAt:      Date,
  scoredBy:      String,  // e.g. 'gemini-2.5-flash', 'groq-llama-3.3-70b-versatile'
}
```

`jdSnapshot` freezes the JD content at scoring time so the displayed score stays interpretable even if HR later edits the JD. Re-screen overwrites the snapshot with the current JD.

## 5. Candidate page changes (HR UI)

### 5.1 Candidate list page (`/candidates`)

- New filter dropdown adding: **Resume pending**, **Approved**, **Declined**, **Screening skipped**, **Screening failed**.
- New column **Match %** showing the score or `—`.
- Quick-actions stay on the detail page only (keeps list focused).

### 5.2 Candidate detail page (`/candidates/:id`)

New **Screening** panel at the top, rendered when `candidate.screening` exists.

**When `screening.status === 'scored'`:**

```
┌─ Screening ─────────────────────────────────────┐
│ JD: DevOps Consultant · devops / mid            │
│ Match: 78%   AI recommends: Approve             │
│                                                  │
│ ✓ Green flags                                   │
│   • 3 years AWS aligns with required experience │
│   • Strong Terraform IaC background             │
│   • Familiar with GitLab CI/CD                  │
│                                                  │
│ ✗ Red flags                                     │
│   • No mention of Kubernetes (nice-to-have)     │
│   • Missing security certifications             │
│                                                  │
│ Summary: Strong DevOps fundamentals; light on   │
│ container orchestration and certs.              │
│                                                  │
│ Scored by gemini-2.5-flash · 2 min ago          │
│ [ Re-screen against current JD ]                │
└──────────────────────────────────────────────────┘
```

**When `screening.status === 'skipped'`:**
"⚠ No JD configured for `{techStack} / {experience}`. Create one in Job Descriptions, then re-screen." + `[ Re-screen ]` button.

**When `screening.status === 'failed'`:**
"⚠ AI screening unavailable — review manually." + `[ Re-screen ]` button.

### 5.3 Action bar

Visible when `candidate.status ∈ {resume_pending}`:

```
[ Approve ]  [ Decline ]
```

**Confirmation modal fires only when HR overrides the AI recommendation:**

- Clicked Approve, `screening.status === 'scored'` and `matchPercent < 60`: modal "AI recommends declining this candidate ({matchPercent}%). Approve anyway?"
- Clicked Decline, `screening.status === 'scored'` and `matchPercent >= 60`: modal "AI recommends approving this candidate ({matchPercent}%). Decline anyway?"
- `screening.status` is `'skipped'` or `'failed'`: no modal (no AI recommendation to override).

**After Approve** → status `resume_approved`. Panel shows "Approved by HR · 2 min ago" plus a new `[ Send test ]` button.

**After Decline** → status `resume_declined` (terminal). Panel shows "Declined by HR · 2 min ago". No further actions.

### 5.4 Send test button

- Visible only on `candidate.status === 'resume_approved'`.
- Click → fires existing Round 1 test-link email (unchanged template), transitions status to `pending`.
- Backend guards: reject with `E_NOT_APPROVED` if status isn't `resume_approved`.

### 5.5 Re-screen button

- Visible while `candidate.status ∈ {resume_pending, resume_approved}`.
- Hidden once `resume_declined` (terminal) or test flow has started (`pending` and beyond).
- Click → backend re-extracts resume, re-looks-up active JD for current `(stack, experience)`, re-runs AI, overwrites the `screening` sub-doc. Candidate status doesn't change.

### 5.6 Resume re-upload behavior

- Existing edit flow continues to allow resume change while status ∈ `{resume_pending, resume_approved}`.
- Re-upload does **not** auto re-screen. Toast: "Resume updated. Click Re-screen to score against current JD."
- Resume editing blocked once status has progressed to `pending` or beyond.

## 6. Status model & emails

### 6.1 New `candidate.status` values

```
resume_pending     ← default after creation (regardless of screening outcome)
resume_approved    ← HR approved, awaiting Send test
resume_declined    ← HR declined (terminal)
```

The existing enum is preserved as-is from `pending` onward. `pending` continues to mean "test link sent, awaiting submission."

`screening.status` (`'scored' | 'skipped' | 'failed'`) is **independent** of the lifecycle status — it tracks AI outcome only. A candidate may be `resume_pending` with `screening.status: 'failed'`. This avoids status-enum explosion.

### 6.2 Status flow

```
Created             → resume_pending
resume_pending     ─ Approve → resume_approved ─ Send test → pending → (existing flow)
                    \ Decline → resume_declined (terminal)
```

### 6.3 Two new email templates

Both fire-and-forget via `setImmediate` (matches existing `reviewService` pattern).

**`sendResumeShortlisted`** — fires on Approve.
> Subject: Your application has been shortlisted
> Hi {name}, your resume has been reviewed and shortlisted for the {techStack} {experience} role. Your test link is on the way — please watch your inbox over the next 24 hours. Best, {company}.

**`sendResumeDeclined`** — fires on Decline.
> Subject: Update on your application
> Hi {name}, thank you for your interest in the {techStack} {experience} role. After reviewing your resume, we've decided not to move forward at this time. We appreciate the time you took to apply and wish you the best.

The existing Round 1 test-link email template is **unchanged**.

## 7. API surface — candidate actions

| Method | Path | Action |
|---|---|---|
| `POST` | `/api/v1/candidates/:id/resume/approve` | Flip status `resume_pending → resume_approved`; fire shortlist email. Guards: `E_ALREADY_DECIDED` if not `resume_pending`. |
| `POST` | `/api/v1/candidates/:id/resume/decline` | Flip status `resume_pending → resume_declined`; fire rejection email. Same guards. |
| `POST` | `/api/v1/candidates/:id/resume/rescreen` | Re-run screening, overwrite `screening` sub-doc. Guards: `E_NOT_RESCREENABLE` if status past `resume_approved`. |
| `POST` | `/api/v1/candidates/:id/send-test` | Existing internal logic, now exposed as explicit endpoint. Flip `resume_approved → pending`; fire test-link email. Guards: `E_NOT_APPROVED` if not `resume_approved`. |

Existing candidate-create endpoint (`POST /api/v1/candidates`) is extended to run JD lookup + screening inline before responding.

## 8. Edge cases

| Case | Handling |
|---|---|
| Resume parsing fails (corrupt PDF, image-only scan, no text) | Skip AI call; `screening.status: 'failed'`. Manual review UX. |
| JD deactivated after a candidate was scored | Candidate keeps `jdSnapshot`; Screening panel renders normally. Re-screen with no active JD → `screening.status: 'skipped'`. |
| HR edits candidate's `techStack` or `experience` after scoring | Old `jdSnapshot` remains. Re-screen re-looks-up the JD using current values. No automatic warning. |
| Two HR users click Approve/Decline simultaneously | Service guards reject second request with `E_ALREADY_DECIDED` if status no longer `resume_pending` (mirrors existing review-edit-request guard). |
| HR clicks Send test on a `resume_pending` candidate | Block with `E_NOT_APPROVED`. |
| HR tries to re-upload resume on `pending`/`submitted` candidate | Block resume edit; field is locked past `resume_approved` (matches existing field-locking pattern). |
| JD body+responsibilities+qualifications exceeds AI context | Joi `max` caps keep the prompt well within model limits. |
| Race: candidate created while a JD for the same combo is being created | Candidate gets `screening.status: 'skipped'`. HR clicks Re-screen after JD save — picks up correctly. |
| AI returns invalid JSON | Strict schema validation; provider counts as failed and chain falls through. All 6 fail → `screening.status: 'failed'`. |
| Candidate has no resume uploaded | Today's candidate-create requires a resume; this stays. If somehow absent, `screening.status: 'skipped'`. |

## 9. Rollout & migration

- **Purely additive** — no data backfill needed.
- Existing candidates have no `screening` sub-doc → Screening panel just doesn't render for them.
- Existing flows (`pending` → `submitted` → ...) untouched.
- New JDs page appears in admin sidebar.
- Candidate-create API extended in place — still a single HTTP call from the frontend, with longer response time (~3–8s) when a JD is matched.
- No environment variables added (reuses existing `GEMINI_API_KEY`, `GROQ_API_KEY`).

## 10. Testing

Mirrors existing patterns in `backend/tests/unit/`.

- **`resumeScreeningService.test.js`** — prompt construction, provider chain fallback, JSON validation, score storage, JD snapshot freezing. Mock AI clients.
- **`jobDescriptionService.test.js`** — CRUD happy paths, unique-active constraint (409 on duplicate combo while one is active), soft-delete behavior, lookup endpoint.
- **`candidateService.test.js`** (extended) — `approveResume` / `declineResume` / `rescreen` / `sendTest`: status guards, email fire, "already decided" rejection.
- E2E manual via the UI for: JD CRUD, candidate create with/without matching JD, Approve happy path, Decline happy path, override modals (both directions), Re-screen, Send test.

## 11. Out of scope (deferred)

- Bulk Approve/Decline from list page (one-at-a-time on detail page for now).
- "Matched 4/6 required skills" UI — would need the dropped `requiredSkills` tag array; revisit if needed.
- Automatic JD-version diff display when re-screening reveals changes.
- Resume parsing for image-only scanned PDFs (would need OCR; treat as `failed` for now).
- JD versioning / history — current model only keeps the latest version; the `jdSnapshot` on candidates is the only historical record.
