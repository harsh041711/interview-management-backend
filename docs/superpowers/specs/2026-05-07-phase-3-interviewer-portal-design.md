# Phase 3 — Interviewer Portal Design

**Date:** 2026-05-07
**Status:** Approved (brainstorming complete)
**Scope:** Sub-phases 3A (auth), 3B (dashboard + rating + edit loop), 3C (HR final decision). Sub-phase 3D (question shuffling) is specified separately in `2026-05-07-phase-3d-question-shuffling-design.md`.

---

## 1. Goal

Add a first-class interviewer portal on top of the existing system so that:

- HR creates an interviewer once → interviewer sets a password via a one-time magic link → logs in to a personal dashboard
- Interviewer sees their past + upcoming interviews on the dashboard
- After an interview is completed, the interviewer submits a structured review (3 × 5-star ratings + free-text comments)
- Reviews are immutable after submission unless HR explicitly grants edit permission via a request loop (mirrors the Phase 2 reschedule loop)
- HR sees the review on the candidate detail page and decides Select (advance to culture-fit round) or Reject (final reject); both decisions email the candidate
- Existing Phase 2 tokenized `/interview/:token` page is retired for **new** Round 2 interviews; legacy in-flight interviews scheduled before Phase 3 ships continue to work via the token URL until they complete

This phase **does not** touch the candidate Round 1 flow except for the new candidate statuses produced by HR's final decision.

---

## 2. Architecture Summary

- **Auth model:** Interviewers gain `passwordHash` and authenticate via the same `/login` form as admins. Backend tries the Admin collection first, then the Interviewer collection. JWT carries a `role` claim (`admin` | `interviewer`). Post-login redirect routes by role.
- **Account setup:** A separate one-time `setupTokenHash` field on the Interviewer model is generated when HR creates the interviewer or clicks "Send setup link." The raw token is delivered in a magic-link email. Forgot-password reuses the same mechanism with a different email subject.
- **Dashboard:** Interviewer-only routes under `/interviewer/*`, served by a new `InterviewerLayout`. All data flows through `/me/*` endpoints that enforce ownership server-side.
- **Reviews:** A new `Review` document is unique per `Interview`. Submission is one-shot. Edits require an approved `ReviewEditRequest`; the approval is consumed by the next edit (no time window).
- **HR final decision:** Two new candidate statuses (`selected_for_culture`, `final_rejected`) plus `awaiting_decision`, set automatically when the interviewer submits a review. The candidate list shows Select / Reject buttons only on `awaiting_decision`.
- **Migration:** Existing interviewers have null `passwordHash` and a "Setup pending" badge. HR triggers the setup email per interviewer (or it auto-fires on the next Round 2 schedule for that interviewer if still null). Existing candidates and questions backfill to safe defaults so legacy data still works.

---

## 3. Data Model Changes

### 3.1 Modified models

#### `Interviewer`
New fields (all optional in DB; presence drives auth state):

| Field | Type | Notes |
|---|---|---|
| `passwordHash` | `String` (nullable) | bcrypt 12 rounds. Null until first setup. |
| `passwordSetAt` | `Date` (nullable) | Set after successful first-time setup. |
| `setupTokenHash` | `String` (nullable) | SHA-256 hash of the raw token. Raw token never stored. |
| `setupTokenExpiresAt` | `Date` (nullable) | 60 minutes from issue. |
| `setupTokenPurpose` | `String` enum: `initial_setup` \| `forgot_password` (nullable) | Drives email subject + UI copy. |
| `lastLoginAt` | `Date` (nullable) | Updated on successful login. |

Existing fields (`name`, `email` unique, `expertise`, `isActive`, `notes`) unchanged.

#### `Candidate`
Add:

| Field | Type | Notes |
|---|---|---|
| `experience` | `String` enum: `entry` \| `mid` \| `senior` | Required on create going forward. Backfilled to `mid` on existing rows. |

Extend `status` enum with `awaiting_decision`, `selected_for_culture`, `final_rejected`.

#### `Question`
Add:

| Field | Type | Notes |
|---|---|---|
| `experience` | `String` enum: `entry` \| `mid` \| `senior` \| `any` | Default `any`. Filters the sampler. |
| `timesUsed` | `Number` (default 0) | Atomically incremented when sampled. Drives the least-used-first weighting. |

(Detailed sampling logic in the 3D spec.)

### 3.2 New models

#### `Review` (new collection: `reviews`)

| Field | Type | Notes |
|---|---|---|
| `interview` | ref → Interview | **Unique index.** One review per interview. |
| `interviewer` | ref → Interviewer | Denormalized for query speed; must equal `interview.interviewer`. |
| `candidate` | ref → Candidate | Denormalized; must equal `interview.candidate`. |
| `ratings.knowledge` | Number 1–5 | Required. |
| `ratings.communication` | Number 1–5 | Required. |
| `ratings.confidence` | Number 1–5 | Required. |
| `comments` | String, 10–2000 chars | Required. Min length enforced both client-side (form validation) and server-side (Joi). |
| `submittedAt` | Date | First submission timestamp. |
| `lastEditedAt` | Date (nullable) | Updated on edits. |
| `editCount` | Number (default 0) | Increments on every edit. |
| `createdBy` | ref → Interviewer | Same as `interviewer`. Audit. |

Computed virtual: `averageRating = (knowledge + communication + confidence) / 3`.

#### `ReviewEditRequest` (new collection: `review_edit_requests`)

Mirrors `RescheduleRequest` from Phase 2.

| Field | Type | Notes |
|---|---|---|
| `review` | ref → Review | Indexed. |
| `interviewer` | ref → Interviewer | Audit. |
| `reason` | String, max 1000 | Optional but encouraged. |
| `status` | enum: `pending` \| `approved` \| `rejected` | Default `pending`. |
| `consumed` | Boolean | Default false. Approved request becomes `consumed=true` after the interviewer's edit submission. Once consumed, no further edits allowed without a new request. |
| `decidedBy` | ref → Admin | Set when HR decides. |
| `decidedAt` | Date | Set when HR decides. |
| `decisionNote` | String (nullable) | HR's note. |

Constraint: at most one `pending` request per review (enforced at service layer + partial unique index `{ review: 1, status: 1 }` where status='pending').

---

## 4. Status Flows

### 4.1 Candidate

```
pending → photo_captured → in_progress → completed
  ├─ shortlisted  (Round 2 scheduled by HR)
  │     └─ (R2 completed AND interviewer review submitted) → awaiting_decision
  │            ├─ HR Select  → selected_for_culture     (terminal)
  │            └─ HR Reject  → final_rejected            (terminal)
  ├─ rejected     (Round 1 score < 50%)                  (terminal)
  └─ cheated      (anti-cheat triggered)                 (terminal)
```

**Auto-transitions:**
- `shortlisted → awaiting_decision` happens when the corresponding `Interview.status === completed` AND a `Review` exists for that interview. Implemented in `reviewService.submit`.
- HR's Select/Reject endpoints reject (409) if `candidate.status !== awaiting_decision`.

### 4.2 Review edit-request

```
(no request)
  ├─ POST /me/reviews/:id/edit-request → pending
  │     ├─ HR approve → approved (consumed=false)
  │     │     └─ interviewer PATCHes review → consumed=true (locked again)
  │     └─ HR reject  → rejected
  └─ Cannot create new pending request while one is already pending.
```

### 4.3 Interviewer auth

```
(HR creates interviewer)
  └─ passwordHash=null, setupTokenHash=null
     ├─ HR clicks "Send setup link" → generates setupTokenHash, sends magic-link email
     └─ HR schedules Round 2 with this interviewer (and passwordHash still null)
            → schedule email body includes the setup magic link inline (lazy fallback)

(magic link click)
  └─ GET /account/setup/:token → validate (timing-safe, hash compare)
     └─ POST /account/setup → set passwordHash, clear setupToken*, return JWT
            → redirect to /interviewer/dashboard

(forgot password)
  └─ POST /auth/forgot-password { email } → generate setupToken with purpose='forgot_password'
     → email "Reset your password" with same /account/setup/:token URL
     → on success, passwordHash overwritten, setupToken cleared
```

---

## 5. API Surface

All routes prefixed with `/api/v1` per existing convention. JSON requests/responses unless noted.

### 5.1 Auth (modified + new)

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `POST` | `/auth/login` | public | **Modified.** `{ email, password }`. Tries Admin first, then Interviewer. Returns `{ token, user: { id, name, email, role } }`. Locked out if interviewer `isActive=false`. |
| `POST` | `/auth/forgot-password` | public | `{ email }`. Always returns 200 (do not leak existence). Issues setup token with `purpose=forgot_password`. |
| `GET` | `/account/setup/:token` | public | Validates token (timing-safe). Returns `{ email, name, purpose }` for the form, or 410 if expired/used. |
| `POST` | `/account/setup` | public | `{ token, password }`. password >= 8 chars. Sets passwordHash, clears setup token, returns JWT. |

### 5.2 Interviewer (admin)

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `POST` | `/interviewers` | admin | **Modified.** Optional `?sendSetup=true` query param triggers setup email immediately. Default behavior: no email sent on creation. |
| `POST` | `/interviewers/:id/send-setup-link` | admin | New. Generates fresh setup token (invalidates any prior), sends magic-link email. Idempotent. |

### 5.3 Interviewer self-service (`/me/*`)

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `GET` | `/me/interviews` | role=interviewer | Returns `{ upcoming: [], past: [] }`. `past` includes review summary inline (`reviewSubmitted: bool`, `editRequestStatus: …`). |
| `GET` | `/me/interviews/:id` | role=interviewer + ownership | Detail incl. candidate name/email/resumeUrl, scheduled time, meeting URL, current review (if any), pending edit-request (if any). |
| `POST` | `/me/interviews/:id/review` | role=interviewer + ownership | `{ ratings: { knowledge, communication, confidence }, comments }`. Guards: `interview.status === completed` AND no existing review. Creates `Review`, transitions candidate to `awaiting_decision`, fires HR notification email. |
| `PATCH` | `/me/reviews/:id` | role=interviewer + ownership | Same body as POST. Guard: latest edit-request must be `approved` AND `consumed=false`. Updates review, sets `consumed=true` on the request, fires HR "Review updated" email. |
| `POST` | `/me/reviews/:id/edit-request` | role=interviewer + ownership | `{ reason }`. Guard: no existing `pending` request for this review. Creates request, fires HR email. |

### 5.4 Review-edit decisions (admin)

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `GET` | `/review-edit-requests?status=pending` | admin | Paginated list. |
| `POST` | `/review-edit-requests/:id/decide` | admin | `{ decision: 'approved' \| 'rejected', note? }`. Updates request, fires interviewer email. |

### 5.5 Reviews (admin read)

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `GET` | `/reviews?candidate=<id>` | admin | Returns review for a candidate (or null). Used by candidate detail page. |
| `GET` | `/reviews/:id` | admin | Single review with edit-request history. |

### 5.6 HR final decision

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `POST` | `/candidates/:id/select` | admin | No body. Guard: `candidate.status === awaiting_decision`. Sets `selected_for_culture`, fires candidate "advanced to culture-fit round" email. |
| `POST` | `/candidates/:id/reject` | admin | `{ note? }`. Same guard. Sets `final_rejected`, fires candidate polite-rejection email. |

### 5.7 Permission middleware

- `requireAuth` extended to set `req.user = { id, role, ... }` from JWT.
- `requireRole('admin')` and `requireRole('interviewer')` — composable wrappers.
- For `/me/interviews/:id` and `/me/reviews/:id`: a `requireOwnership` middleware fetches the resource and verifies `resource.interviewer === req.user.id`. 403 otherwise.

---

## 6. Email Catalog

All sent fire-and-forget via `setImmediate` per existing pattern. New templates live under `backend/src/templates/`.

| Trigger | To | Template | Subject |
|---|---|---|---|
| HR sends setup link (initial or re-send) | Interviewer | `accountSetupEmail` | "Set up your interviewer account" |
| Forgot password | Interviewer | `accountSetupEmail` (with `purpose=forgot_password`) | "Reset your interviewer password" |
| Round 2 scheduled (interviewer side) | Interviewer | `interviewScheduledEmail` *(modified)* | unchanged subject; body includes setup link inline if `passwordHash=null` |
| Review submitted | HR | `reviewSubmittedEmail` | "Review submitted — {candidate} ({avg}/5)" |
| Review edited | HR | `reviewEditedEmail` | "Review updated — {candidate}" |
| Edit-request submitted | HR | `editRequestSubmittedEmail` | "Edit request — {interviewer} for {candidate}" |
| Edit-request approved | Interviewer | `editRequestApprovedEmail` | "Edit permission granted" |
| Edit-request rejected | Interviewer | `editRequestRejectedEmail` | "Edit request not approved" |
| HR Select | Candidate | `cultureFitInviteEmail` | "You've advanced to the final culture-fit round" |
| HR Reject | Candidate | `finalRejectionEmail` | "Update on your application" |

The candidate-side resume attachment behavior (added in Phase 2 follow-up) is **unchanged**: the resume continues to attach to interviewer-bound emails (`interviewScheduledEmail`, `rescheduleApprovedEmail`).

---

## 7. Frontend Surface

### 7.1 New routes

| Route | Layout | Auth | Notes |
|---|---|---|---|
| `/account/setup/:token` | `PublicLayout` (minimal) | public | Set-password form. Reused for forgot-password — copy adapts based on `purpose` returned by backend. |
| `/forgot-password` | `PublicLayout` | public | Email-entry form; calls `/auth/forgot-password`; shows generic confirmation. |
| `/interviewer/dashboard` | `InterviewerLayout` (new) | role=interviewer | Two sections: "Upcoming" and "Past." Each past row shows review state + CTA. |
| `/interviewer/interviews/:id` | `InterviewerLayout` | role=interviewer + ownership | Interview detail; embeds review form (submit or edit, locked appropriately) + meeting Join button. |
| `/admin/review-edit-requests` | `AdminLayout` | role=admin | Pending list with inline approve/reject. |

### 7.2 Modified pages

- **`/login`** — UI unchanged; on success redirect by `user.role` (admin → `/dashboard`, interviewer → `/interviewer/dashboard`). Add a "Forgot password?" link.
- **Candidate list** — new `Experience` column + filter; status badges include the 3 new statuses; row actions show **Select** + **Reject** buttons when `status=awaiting_decision`.
- **Candidate detail** — Review panel (3-star breakdown, average, comments, submitted/edited timestamps, edit-request history). Select/Reject buttons here too for parity.
- **Candidate create modal** — add `experience` radio (entry/mid/senior).
- **Interviewer list (HR)** — "Send setup link" button per row; status badge "Account active" / "Setup pending."
- **Question form** — add `experience` selector; show `timesUsed` as read-only stat.
- **Interview list (HR)** — review-state badge column ("Reviewed" / "Pending review" / "Edit requested").

### 7.3 Layouts and routing

- New `InterviewerLayout` mirrors `AdminLayout` shape: top header with name/logout, side nav with two items (Dashboard, My interviews — could be the same page initially).
- `<ProtectedRoute role="admin">` and `<ProtectedRoute role="interviewer">` derived from existing `ProtectedRoute`. Unauthenticated → `/login`. Authenticated but wrong role → `/login` with toast "Access denied."

### 7.4 State management

- New slices: `interviewerAuthSlice` (handles setup-token resolve + post-setup login), `myInterviewsSlice` (own interviews + reviews), `reviewEditRequestsSlice` (HR-side pending list).
- Existing `authSlice` extended to store `user.role` and post-login redirect.

### 7.5 Form validation

- Set-password: min 8 chars, must contain at least one letter and one digit, confirm-password match.
- Review submit: all three star ratings required (1–5); comments required, 10–2000 chars.
- Edit-request: reason optional but max 1000 chars.

---

## 8. Edge Cases and Guards

| Case | Behavior |
|---|---|
| Setup token expired or already used | 410 Gone. Frontend renders friendly card with "Request a new link" button (calls `/auth/forgot-password`). |
| Setup link clicked after password already set | Frontend detects `purpose=initial_setup` + `passwordHash` already set on the validate call → redirect `/login` with toast "Account already set up — please log in." |
| Inactive interviewer login attempt | 403 with code `E_ACCOUNT_INACTIVE`. UI message "Account inactive — contact HR." |
| Interviewer requests edit while pending exists | 409 `E_EDIT_REQUEST_PENDING`. UI surfaces "A request is already pending HR review." |
| Interviewer attempts edit without approved request | 403 `E_EDIT_NOT_APPROVED`. |
| Interviewer attempts review on non-completed interview | 409 `E_INTERVIEW_NOT_COMPLETED`. UI: review form disabled with hint "Available after the interview is marked completed." |
| HR Select/Reject on candidate without a review | Buttons disabled in UI; backend 409 `E_NO_REVIEW`. |
| HR Select/Reject on candidate not in `awaiting_decision` | Backend 409 `E_BAD_STATUS`. |
| Sampler when candidate `experience` is null (legacy) | Falls back to `experience='mid'` for sampling. (Migration script also backfills.) |
| Setup-link arrives but interviewer was deactivated meanwhile | 410 with "Account inactive" message. |

---

## 9. Migration

### 9.1 One-shot data backfill (run once at deploy)

A `npm run migrate:phase3` script:

1. **Candidates:** `db.candidates.updateMany({ experience: null }, { $set: { experience: 'mid' } })`
2. **Questions:** `db.questions.updateMany({ experience: null }, { $set: { experience: 'any', timesUsed: 0 } })`
3. **Interviewers:** no data change. They remain with `passwordHash=null` until HR triggers setup.

### 9.2 In-flight Phase 2 interviews

Interviews scheduled before Phase 3 deploy that are still in `scheduled` or `reschedule_requested` status keep using `/interview/:token`. The token middleware and route are kept intact. After they transition to `completed` or `cancelled`, the token URL no longer matters.

A small `legacyTokenView` flag on `Interview` is **not** introduced — the existing `interviewerAccessToken` field is sufficient as a presence check, and the existing token middleware already validates lifecycle.

### 9.3 Rollout

- Deploy backend first (additive — new fields are nullable, new routes are additive). Existing endpoints behave identically.
- Run migration script.
- Deploy frontend.
- HR is informed (via release note) that they should click "Send setup link" for their existing interviewer roster as a one-time action. Lazy fallback (option C) ensures they cannot accidentally schedule with an interviewer who never received the link.

---

## 10. Out of Scope (explicit non-goals)

- **Bulk-send setup links button.** HR sends per interviewer for now. Could be added later if their roster grows.
- **Time-bound edit windows.** Approved edit requests stay open until consumed by an edit (no expiry). Revisit if abuse becomes an issue.
- **Multiple reviews per interview.** Strictly one. If a panel of interviewers is later needed, would require a separate redesign.
- **Auto-Google-Meet link generation.** Tracked separately; user explicitly deferred.
- **Question shuffling.** Specified in the 3D companion document.
- **HR overriding a review.** HR cannot edit the review content, only approve edits. If we need HR-side editing, that's a separate decision.
- **Candidate-side dashboard / login.** Candidates remain magic-link only end-to-end.

---

## 11. Open Items (intentionally deferred)

None. All clarifying questions resolved during brainstorming.
