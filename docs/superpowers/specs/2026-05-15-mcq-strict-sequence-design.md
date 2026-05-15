# Strict MCQ → Coding → Prompt Sequence — Design Spec

**Status:** Approved
**Date:** 2026-05-15
**Audience:** engineers implementing this feature

---

## Goal

Replace the current "send any test in any order" candidate flow with a strict pipeline:

1. **MCQ first.** Auto-graded; pass produces status `shortlisted`, fail produces `rejected`, cheat produces `cheated`. On pass, the candidate email no longer reads "shortlisted, we'll follow up" — it now reads **"You've cleared the MCQ. Coding test coming next."**
2. **Coding test second.** HR can only send the coding test when `candidate.status === 'shortlisted'` (or any later post-shortlist status). Backend rejects the API call with code `E_MCQ_NOT_CLEARED` otherwise. Frontend hides the button when the gate isn't open.
3. **Prompt test third (optional).** HR can only send the prompt test when `candidate.codingTest.outcome === 'shortlisted'`. Backend rejects with `E_CODING_NOT_CLEARED` otherwise. Frontend hides the button until the gate is open.

Out of scope for this spec: action-row UX redesign (separate spec); prompt-test shortlist/reject flow (separate spec); migrating legacy candidates who already have out-of-order tests.

---

## End-to-end Flow

```
1. HR creates candidate → resume_pending → resume_approved
        ↓ HR clicks "Send test"
2. Candidate takes MCQ → submits
        ↓ Auto-grade
   Pass (≥60%, no cheat)  → status = shortlisted
                            → email: "You've cleared the MCQ. Coding test coming next."
                            → HR sees "Send coding test" button
   Fail (<60%)             → status = rejected
                            → email: existing rejection template (unchanged)
                            → HR sees only "Delete"
   Cheat                   → status = cheated
                            → email: existing disqualified template (unchanged)
                            → HR sees only "Delete"
        ↓
3. HR clicks "Send coding test"
   Backend validates status === 'shortlisted' (or later) → 409 E_MCQ_NOT_CLEARED if not
        ↓
4. Candidate takes coding test → submits → HR reviews → Shortlist OR Reject
   Shortlist                → codingTest.outcome = 'shortlisted'
                            → HR sees "Send prompt test" button (optional)
                            → HR sees "Select for culture" / "Reject"
   Reject                   → codingTest.outcome = 'rejected' → candidate rejected
        ↓
5. (Optional) HR clicks "Send prompt test"
   Backend validates codingTest.outcome === 'shortlisted' → 409 E_CODING_NOT_CLEARED if not
        ↓
   Standard prompt-test flow continues
```

---

## Architecture

### Backend

| Layer | Change |
|---|---|
| `backend/src/templates/round1ShortlistedEmail.js` | Update subject + HTML body + plaintext body. New title: "You've Cleared the MCQ — Coding Test Coming Next". New copy explains the candidate cleared Round 1 (MCQ) and a coding test invite is on its way. Drops the generic "we'll follow up about Round 2" wording. **Content-only change** — function signatures + exports unchanged. |
| `backend/src/services/candidateService.js` — `sendCodingTest()` (around line 516) | At the top of the function, after loading the candidate, add: `if (!['shortlisted', 'awaiting_decision', 'selected_for_culture'].includes(candidate.status)) throw ApiError.conflict('Candidate must clear the MCQ test first', { code: 'E_MCQ_NOT_CLEARED' });` Allows shortlisted + later statuses so re-sends still work for candidates who advanced. |
| `backend/src/services/promptTestService.js` — `assign()`, `generateAndAssign()`, `saveGeneratedAndAssign()` | At the top of each, after loading the candidate (or as the first guard), add: `if (candidate.codingTest?.outcome !== 'shortlisted') throw ApiError.conflict('Candidate must clear the coding test first', { code: 'E_CODING_NOT_CLEARED' });` |
| `backend/src/services/testService.js` — `finalize()` (around lines 186-216) | **Remove the MCQ-suppression branch.** With strict ordering, the coding test cannot have been sent before MCQ is cleared, so the condition `otherTestPending` is always false at MCQ-finalize time. Simplify the post-grade block to: pass → flip to `shortlisted` + `queueReportEmail` + `queueRound1OutcomeEmail`; fail → flip to `rejected` + both emails; cheat → flip to `cheated` + both emails. Keep the existing emailing helpers — they read the new template content automatically. |

**Backend error codes (new):**

| Code | HTTP | Where thrown |
|---|---|---|
| `E_MCQ_NOT_CLEARED` | 409 | `sendCodingTest` when status is not `shortlisted` or later |
| `E_CODING_NOT_CLEARED` | 409 | `promptTestService.assign` (and friends) when `codingTest.outcome !== 'shortlisted'` |

### Frontend

| Layer | Change |
|---|---|
| `frontend/src/features/candidates/CandidateDetailPage.jsx` — action row (around line 191) | Tighten visibility conditions. **Send coding test** button: show only when `c.status === 'shortlisted'` or in `['awaiting_decision', 'selected_for_culture']` (post-shortlist re-send allowed). **Re-assign / Assign prompt test** button: show only when `c.codingTest?.outcome === 'shortlisted'`. Other buttons (Resend invite, Regenerate token, Copy test link, Select for culture, Reject, Delete) keep their existing conditions. |
| Error toast wiring (existing `extractError` + `useToast`) | No code change; the new error codes propagate as `err.response.data.message`. The toast text from the backend is already a clean human-readable string ("Candidate must clear the MCQ test first" / "Candidate must clear the coding test first"). |

---

## Behavior Details

- **Re-sending coding test** to a candidate who is already `awaiting_decision` (because they completed everything previously) stays allowed — the gate is `shortlisted` / `awaiting_decision` / `selected_for_culture`, not "exactly shortlisted". `final_rejected` is excluded — once finally rejected, the pipeline is closed.
- **Re-assigning prompt test** has the same allowance — the gate is `codingTest.outcome === 'shortlisted'`, which remains true even after later status transitions.
- **Failed MCQ candidates** see only "Delete" in the action row — no coding/prompt buttons.
- **Cheated MCQ candidates** behave identically to failed candidates from a button visibility standpoint.
- **The email content change** is purely a string edit. The send mechanism (Nodemailer + the existing emailService) is untouched.

---

## What's NOT Changing

- **Failed MCQ email** — `round1RejectedEmail.js` content stays exactly as it is.
- **Cheated MCQ email** — `round1DisqualifiedEmail.js` content stays exactly as it is.
- **HR score report email** — `reportEmail.js` still fires on every MCQ submission (pass, fail, cheat), unchanged.
- **Coding test invite email** — unchanged. Fires when HR clicks "Send coding test" (which now happens after MCQ pass, not before).
- **Prompt test invite email** — unchanged.
- **Coding test shortlist/reject flow** — unchanged. HR still uses the existing `CodingTestPanel` buttons.

---

## Tests

### Backend — Jest

**`candidateService.sendCodingTest` (new tests in `candidateService.test.js`):**

- Throws `E_MCQ_NOT_CLEARED` (409) when status is `resume_approved`, `pending`, `in_progress`, `completed`, `rejected`, `cheated`, or `resume_declined`.
- Succeeds when status is `shortlisted`.
- Succeeds when status is `awaiting_decision` (re-send case).
- Succeeds when status is `selected_for_culture` (later re-send case).

**`promptTestService.assign` (new tests in `promptTestService.test.js`):**

- Throws `E_CODING_NOT_CLEARED` (409) when `codingTest.outcome` is `null`, `undefined`, `'pending_review'`, or `'rejected'`.
- Succeeds when `codingTest.outcome === 'shortlisted'`.

**`testService.finalize` (existing test file):**

- **Update** existing tests that referenced the MCQ-suppression branch — they should now expect the standard pass/fail behavior even when a coding/prompt test is hypothetically pending (in practice this can't happen anymore, but the test names should be cleaned up or deleted).
- Happy path pass → `shortlisted` status flip + both emails queued; spy on `queueRound1OutcomeEmail` to verify it's called with the shortlisted template path.
- Failed path → `rejected` + both emails.
- Cheated path → `cheated` + both emails.

### Frontend — Manual

1. Open a candidate at status `resume_approved` → action row shows only **Send test** + **Delete**. No coding/prompt buttons visible.
2. Candidate takes MCQ and passes → refresh candidate detail → status badge reads **Shortlisted**; action row now shows **Send coding test** (no prompt button yet).
3. Click **Send coding test** → success, invite email fired.
4. Try (via API client / DevTools) to call `POST /candidates/:id/prompt-test/assign` now → response is 409 with message "Candidate must clear the coding test first".
5. Candidate completes coding test; HR reviews and clicks **Shortlist** on the coding test review page → `codingTest.outcome = 'shortlisted'` → refresh candidate detail → action row now shows **Send prompt test**.
6. Send prompt test → success.
7. Test the failing path: a candidate who fails MCQ (score <60%) → status = `rejected` after submit; action row shows only **Delete**. The new pass-email is NOT sent (the existing rejection email fires instead).
8. Test the cheat path: candidate tab-switches past threshold → status = `cheated`; existing disqualified email fires; action row shows only **Delete**.

---

## Out of Scope

- **Action-row UX redesign** (dropdown grouping for Resend invite / Regenerate token / Copy test link / Delete). Tracked as a separate spec.
- **Prompt-test shortlist/reject flow** (the original gap raised by the user). Tracked as a separate spec.
- **Legacy data migration** — candidates who already have prompt tests sent before coding tests (or coding before MCQ pass via the old suppression branch) keep their data; the new gates apply only to new sends.
- **MCQ pass threshold change** — stays at 60%.
- **Round 1 outcomes constant** (`ROUND1_OUTCOMES`) — no new values added.

---

## Future Enhancements (not in this plan)

- A bulk "advance N candidates" action for HR when batches of candidates clear MCQ.
- An email-content editor in admin settings so HR can tweak the new pass copy without a code change.
- Optional config flag to disable the strict gate (for orgs that want the old free-order flow).
