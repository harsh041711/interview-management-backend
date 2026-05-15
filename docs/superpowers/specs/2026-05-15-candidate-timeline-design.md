# Candidate Timeline + Schedule Next Round — Design Spec

**Status:** Approved
**Date:** 2026-05-15
**Audience:** engineers implementing this feature

---

## Goal

Replace the conditional single-review `ReviewPanel` block on `CandidateDetailPage` with a **horizontal multi-round timeline** that shows every interview round's status, date, and interviewer for a candidate, and offers a click-to-schedule "next round" affordance once the prior round is completed.

Two coupled features:

1. **Timeline component** — horizontal stepper on `CandidateDetailPage`, one node per scheduled/completed/cancelled interview round. Click a node to expand the round's review inline.
2. **Schedule-next CTA** — when the most-recent round is `completed` and `round < 3`, render a trailing `+ Schedule next round` node that opens the existing `ScheduleInterviewModal`, pre-filled with this candidate and the next round type.

---

## End-to-end Flow

```
1. HR opens CandidateDetailPage for a candidate
        ↓
   GET /candidates/:id  → response now includes:
     { candidate, submission, interviews[], reviews[] }
        ↓
2. Page renders:
     [Header · Chips · Actions · Screening · Coding/Prompt summaries]
     [NEW: <CandidateTimeline> replacing the old <ReviewPanel>]
        ↓
3. Timeline shows one node per interview (sorted by round asc), plus a
   trailing "+ Schedule next round" node if eligible
        ↓
4. HR clicks a completed node → row expands below the stepper with
   ratings/comments + "View co-pilot notes" link
        ↓
5. HR clicks "+ Schedule next round" → ScheduleInterviewModal opens with
   candidate + next roundType pre-filled
        ↓
6. After scheduling, candidate detail refetches → timeline shows new node
```

---

## Architecture

### Backend (extend the detail endpoint — no new routes)

| Layer | Change |
|---|---|
| `backend/src/services/candidateService.js` | Extend `detail(id)` to also fetch `interviews[]` (via `interviewRepository.list({ candidateId, limit: 100 })`) and `reviews[]` (via `reviewRepository.findAllByCandidate(candidateId)`), plus the latest `LiveSession.questions[]` per interview (via `liveSessionRepository.findLatestByInterview`). Sort `interviews` by `round` ascending (stable). Each interview gets a `copilotQuestions: [...]` field (empty array if no session). |
| `backend/src/presenters/candidatePresenter.js` (or new `interviewPresenter` slice) | Add a small `presentInterviewLite` helper that strips heavy fields (`candidate` populated object, internal flags) and exposes only: `{ _id, round, roundType, status, scheduledAt, completedAt, durationMinutes, interviewer: { _id, name }, notes }`. |
| Reviews | Pass `reviews` through as-is — `findAllByCandidate` already returns lean docs. Each review carries its `interview` ObjectId, so the frontend can join. |

**Response shape after the change:**

```json
{
  "candidate": { ... existing ... },
  "submission": { ... existing or null ... },
  "interviews": [
    { "_id": "...", "round": 1, "roundType": "technical", "status": "completed",
      "scheduledAt": "2026-05-12T10:00:00Z", "completedAt": "2026-05-12T10:45:00Z",
      "durationMinutes": 45, "interviewer": { "_id": "...", "name": "John D." }, "notes": "..." },
    { "_id": "...", "round": 2, "roundType": "practical", "status": "scheduled",
      "scheduledAt": "2026-05-16T10:00:00Z", "completedAt": null,
      "durationMinutes": 45, "interviewer": { "_id": "...", "name": "Sarah L." }, "notes": null }
  ],
  "reviews": [
    { "_id": "...", "interview": "...", "ratings": { "knowledge": 4, "communication": 5, "confidence": 4 },
      "comments": "Solid React fundamentals...", "submittedAt": "2026-05-12T10:50:00Z" }
  ]
}
```

No new endpoint. No schema changes. The existing detail controller already wraps the service response with `ok(res, {...}, 'OK')`.

### Frontend

| Layer | New / Modified |
|---|---|
| `frontend/src/features/candidates/candidateSlice.js` | The thunk already dispatches whatever the API returns; no change needed beyond accepting `interviews`/`reviews` in the detail state. |
| `frontend/src/features/candidates/CandidateTimeline.jsx` | **NEW** — the stepper component. Renders nodes + the inline expand row. Props: `{ candidate, interviews, reviews, onScheduleNext }`. |
| `frontend/src/features/candidates/CandidateTimeline.scss` | **NEW** — stepper styling (nodes, connectors, expand row, threshold colors). |
| `frontend/src/features/candidates/CandidateDetailPage.jsx` | Replace the existing `<ReviewPanel>` render block with `<CandidateTimeline interviews={detail.interviews} reviews={detail.reviews} candidate={detail.candidate} onScheduleNext={openScheduleModal} />`. Wire `openScheduleModal({ round, roundType })` to set the existing modal state with a new pre-fill payload. |
| `frontend/src/features/interviews/ScheduleInterviewModal.jsx` | Extend the existing `initial` prop to also accept `{ candidate, round, roundType }` (without an `_id`, so the modal knows it's a CREATE not an EDIT). Pre-fill the candidate dropdown disabled and the round-type select to the passed value. The user can still change roundType. |
| `frontend/src/features/myInterviews/CopilotNotesModal.jsx` | Reused as-is — the timeline's expand row has a "View co-pilot notes" link that opens this modal for a specific interview ID. |

---

## UI Behavior

### Stepper node states

| Status | Visual | Caption |
|---|---|---|
| `completed` with review submitted | Filled circle, **green** (#16a34a) | `R1 · Technical · ✓ Completed · May 12 · John D.` |
| `completed` without review (edge case) | Filled circle, gray | `R1 · Technical · ✓ Completed · May 12 · (no review yet)` |
| `scheduled` | Filled circle, **blue** (#2563eb) | `R2 · Practical · 📅 Scheduled · May 16 10am · Sarah L.` |
| `reschedule_requested` | Filled circle, **amber** (#d97706) | `R2 · Practical · ↻ Reschedule pending · Sarah L.` |
| `cancelled` | Hollow circle, gray | `R2 · Practical · ✕ Cancelled` |
| **Schedule-next node** (synthetic) | Dashed-border circle with `+` | `+ Schedule next round` (rendered only when eligible — see below) |

Connector lines between nodes inherit the color of the **left** node.

### Schedule-next eligibility

The trailing `+ Schedule next round` node renders **only** when ALL of these are true:

1. There is at least one interview.
2. The most-recent interview's `status === 'completed'`.
3. A `Review` exists for that completed interview (matched via `review.interview === interview._id`).
4. `mostRecent.round < 3`.
5. The candidate's overall status is one of: `awaiting_decision`, `selected_for_culture`, `shortlisted`. (Don't show on `final_rejected` / `hired` / `cheated`.)

If conditions 1–4 are met but the review is missing, render a disabled-looking node with tooltip `Submit the previous round's review before scheduling the next.` rather than hiding it — gives HR a clear next action.

### Pre-fill rules for "Schedule next round"

- **Candidate**: pre-selected, dropdown disabled (the modal already has a candidate dropdown; we'll pass `disabledCandidate: true` flag).
- **Round number**: `mostRecent.round + 1` — set automatically by the backend's existing multi-round logic; the modal doesn't need to send it.
- **Round type**: default to next-in-sequence based on what's already been done:
  - If only Round 1 (Technical) exists → default to `practical`.
  - If Rounds 1–2 exist → default to `hr_culture`.
  - User can override via the existing roundType dropdown.

### Inline expand behavior

- Click any node (other than the schedule-next node) → toggle its row's expand state.
- **At most one** node expanded at a time. Clicking a second node collapses the first.
- Expand row contains:
  - Round header line: `R{n} · {roundType} · {interviewer.name} · {formatted date}`
  - If a review exists:
    - Three per-axis star groups (Knowledge / Communication / Confidence)
    - Average rating chip
    - Comments verbatim (preserve newlines)
    - `View co-pilot notes →` link (only if there's a `LiveSession` for that interview — see below)
  - If no review yet:
    - `(No review yet — the interviewer hasn't submitted.)`
  - If cancelled:
    - `Cancelled — {completionNote or 'no reason provided'}`

### "View co-pilot notes" link

- Opens the existing `CopilotNotesModal` with a synthesized `session` prop: `{ questions: interview.copilotQuestions }`. The modal renders its own empty state if `questions` is empty (older interviews pre-co-pilot).
- Show the link only when `interview.status === 'completed' && (interview.copilotQuestions?.length > 0)`.
- No new backend route needed — the data rides on the candidate-detail response.

### Empty state

If `interviews.length === 0`:

```
┌──────────────────────────────────────────────────────────────────┐
│ Interview history                                                │
│                                                                  │
│ No interviews scheduled yet.                                     │
│ [+ Schedule interview]   ← visible only when candidate is        │
│                            shortlisted/awaiting_decision/        │
│                            selected_for_culture                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Removed
- The `<ReviewPanel>` block on `CandidateDetailPage` is removed. `ReviewPanel` itself stays in the codebase — it's still rendered on `InterviewDetailPage` (no change there).

---

## Tests

### Backend — Jest

Extend `backend/tests/unit/candidateService.test.js`:

- **Happy path:** call `detail(id)` for a candidate with 2 interviews + 1 review → response contains `interviews` array of length 2 sorted by `round` asc, and `reviews` array of length 1.
- **No interviews:** call `detail(id)` for a candidate with no interviews → `interviews: []` and `reviews: []`.
- **Backwards-compat:** existing `candidate` and `submission` fields still present and unchanged.

No new validator/route tests needed.

### Frontend — Manual

1. Open candidate with 0 interviews → empty-state card visible; `+ Schedule interview` button if candidate is shortlisted.
2. Schedule Round 1 (Technical) via the existing modal → after schedule, timeline shows one **blue** scheduled node. No schedule-next node yet (R1 not completed).
3. Mark R1 complete + submit a review → R1 turns **green**. A `+ Schedule next round` dashed node appears.
4. Click the green R1 node → row expands with ratings + comments + "View co-pilot notes" link.
5. Click "View co-pilot notes" → existing `CopilotNotesModal` opens for that interview.
6. Click `+ Schedule next round` → modal opens with candidate disabled-pre-selected and roundType defaulted to **Practical**. Schedule it.
7. Refresh → timeline now has R1 (green) → R2 (blue scheduled), schedule-next node hidden until R2 completes.
8. Complete R2 + review → schedule-next reappears, this time defaulting to **HR-Culture**.
9. Complete R3 → schedule-next disappears entirely (capped at 3).
10. On a candidate with a `cancelled` interview → that node renders as hollow gray; schedule-next is hidden (because the most-recent isn't `completed`).

---

## Out of Scope (YAGNI)

- Surfacing prior-rounds context inside the **live co-pilot session** (that's Phase 2 #1 — round-context handoff, separate spec).
- Drag-to-reorder rounds.
- Timeline filters (date range, status).
- Animated transitions between expanded states.
- Round 4+ — backend enum and UI cap at 3.
- Editing a scheduled round via the timeline (use the existing interview detail page).
- Inline ratings editor — read-only display only.

---

## Future Enhancements (not in this plan)

- Surface coding-test / prompt-test outcomes as additional "Round 0" pre-nodes (today they're separate cards on the page).
- Display average rating across rounds as a candidate-level summary metric.
- Quick "Send reminder email" action on a scheduled node.
- Calendar-style preview tooltip on hover over a scheduled node.
