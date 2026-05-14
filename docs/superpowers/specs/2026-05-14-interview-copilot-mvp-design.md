# Interview Co-pilot MVP — Design

**Date:** 2026-05-14
**Status:** Approved, ready for implementation plan
**Author:** Harsh Pathak (with Claude)

## Goal

Give the interviewer an AI-powered "second tab" they open alongside their Zoom/Meet call. The page auto-loads the full context (JD, candidate, prior round notes), suggests 12 questions tiered easy → hard, lets them mark questions asked + jot a per-question note + 1-5 rating, and at "End interview" auto-drafts a review the interviewer just edits and submits.

**One-line problem it solves:** Turn every interviewer into a senior interviewer regardless of their domain — so a MERN-only engineer can run a useful Python interview, and a round-2 interviewer doesn't re-cover what round 1 already asked.

## Context (today's state)

- Interviews use external video (Zoom/Meet) — `interview.meetingUrl` is opened in a new tab. The system stores only metadata + a post-interview review.
- `MyInterviewDetailPage` shows candidate name, email, scheduled time, HR notes, a "Join meeting" button, and a `ReviewForm` that opens after the call.
- A socket layer exists (`backend/src/sockets/testSocket.js`) but is scoped to candidate proctoring during the MCQ test, not interviews.
- Gemini → Groq AI fallback chain is already wired (`aiService.askWithFallback` + `aiService.extractJson`).
- `reviewHistory` is already exposed on the candidate detail response (groundwork for round-2 context).

## Approach (one paragraph)

A new page `/interviewer/interviews/:id/live` opens in the interviewer's browser. On open, the backend creates a `LiveSession` record and calls Gemini once to generate 12 interview questions from JD + candidate + prior rounds. The interviewer sees context cards on the left and the question queue on the right; per-question they mark asked, jot a note, set a 1-5 rating. Edits debounce-save to the server. On "End interview", the backend summarizes notes + ratings via Gemini into a draft review and redirects the interviewer to the existing `ReviewForm` pre-filled — the interviewer reviews/edits and submits through the existing review pipeline. No new realtime layer (single-user, debounced HTTP is enough); sockets stay scoped to candidate proctoring.

## Page layout

```
+--------------------------------------------------------------+
| ← Back     Riya Sharma · Python · 1 yr      ⏱ 23:14   [End]  |
+---------------------------+----------------------------------+
|  CONTEXT (left, ~40%)     |  QUESTIONS (right, ~60%)         |
+---------------------------+----------------------------------+
| ┌─ Job Description ─────┐ | Coverage: ██████░░░░ 6/12        |
| │ Python · Junior       │ | Topics covered:                  |
| │ MongoDB · Express     │ |   Python basics ✓ Express APIs ✓ |
| │ [Expand]              │ |                                  |
| └───────────────────────┘ | ┌─ Q3 · Easy · Python ─────────┐ |
|                           | │ Explain Python's GIL.        │ |
| ┌─ Candidate ──────────┐  | │ Note: confused MP vs threads│ |
| │ Avatar + Name        │  | │ Rating: ★★★☆☆ (3/5)         │ |
| │ Email                │  | │ [✓ Asked]                    │ |
| │ Experience: 1 yr     │  | └──────────────────────────────┘ |
| │ Tech: MERN           │  |                                  |
| │ Resume: [Download]   │  | ┌─ Q4 · Medium · Async ────────┐ |
| └──────────────────────┘  | │ How would you handle...      │ |
|                           | │ [ask]                        │ |
| ┌─ Screening (50%) ────┐  | └──────────────────────────────┘ |
| │ Greens: 6 · Reds: 5  │  |                                  |
| │ [Expand]             │  | ...                              |
| └──────────────────────┘  |                                  |
|                           |                                  |
| ┌─ Prior round (R1) ───┐  |                                  |
| │ Rating: 4/5          │  |                                  |
| │ Strengths: ...       │  |                                  |
| │ Follow up on: ...    │  |                                  |
| └──────────────────────┘  |                                  |
+---------------------------+----------------------------------+
```

- The left context column is a vertical stack of collapsible cards. Each card shows a brief summary when collapsed, full detail when expanded. Prior-round card only appears when `candidate.reviewHistory` has entries.
- The right column has a topic coverage bar at the top, then the question list. Each question is a card with: text, difficulty pill, topic pill, an "Asked" toggle, an inline note input (max 500 chars), and a 5-star rating.
- Top bar always visible: candidate identity, running timer (since session start), "End interview" button.

## Data model

**New collection `LiveSession`** (one per launch of the co-pilot for an interview)

```js
{
  interview:    ObjectId,        // ref Interview, unique-ish per interviewer
  interviewer:  ObjectId,        // ref User
  candidate:    ObjectId,        // ref Candidate (denormalized for speed)
  startedAt:    Date,
  endedAt:      Date | null,     // null while live
  questions: [{
    text:       String,
    difficulty: 'easy' | 'medium' | 'hard',
    topic:      String,          // drawn from JD requirements by the AI
    askedAt:    Date | null,     // null = not asked yet
    note:       String,          // <= 500 chars
    rating:     Number | null,   // 1-5 or null
  }],
  draftReview: {                  // populated by /end
    knowledge:      Number,       // 1-5
    communication:  Number,       // 1-5
    confidence:     Number,       // 1-5
    comments:       String,
    recommendation: 'hire' | 'no_hire' | 'next_round',
    generatedBy:    String,       // e.g. 'gemini:gemini-2.5-flash'
  } | null,
  createdAt: Date,
  updatedAt: Date,
}
```

**No changes** to existing `Interview` or `Review` collections. The draft review is consumed by the existing `ReviewForm`; the actual submitted review still flows through the existing review pipeline and marks the interview completed.

**Indices:**
- `{ interview: 1, endedAt: 1 }` to quickly find the active session for an interview.
- `{ interviewer: 1, endedAt: 1, createdAt: -1 }` for an interviewer to see their last live session.

**Concurrency note:** if interviewer opens the co-pilot in two tabs, the second `GET /live` returns the same active session. We do NOT create a new session unless `endedAt` is set on the previous one.

## API endpoints

All under `/api/interviewer/...`, gated by `requireAuth + requireRole('interviewer')`. Each endpoint that takes an `:id` (interview or session) verifies ownership — the authenticated interviewer must match `interview.interviewer`.

| Verb | Path | Purpose |
|---|---|---|
| `POST` | `/api/interviewer/interviews/:id/live/start` | Creates or returns the active `LiveSession`. If no active session exists, calls Gemini to generate 12 questions, persists the session, returns it. If active session exists (idempotent), returns it without a fresh AI call. |
| `GET` | `/api/interviewer/interviews/:id/live` | Returns the active `LiveSession` for this interview (404 if none active). Used on page reload to resume state. |
| `PATCH` | `/api/interviewer/live-sessions/:id` | Debounced update from the client. Body shape: `{ questionUpdates: [{ index, askedAt?, note?, rating? }] }`. Validated per field; partial OK. |
| `POST` | `/api/interviewer/live-sessions/:id/end` | Sets `endedAt = now`, calls Gemini once to generate `draftReview` from the questions+notes+ratings, persists, returns the draft. Frontend then redirects to the existing review form pre-filled with the draft. |

Rate limit `start` and `end` (the two AI-calling endpoints) at 10/min per interviewer via the existing `express-rate-limit` setup.

## AI prompts

Both prompts use the existing `aiService.askWithFallback` (Gemini → Groq) and `aiService.extractJson` for robust JSON parsing.

### A. Question generation (on `/live/start`)

```
You are designing an interview for a {candidate.experience}-yr {candidate.techStack} candidate.

Job Description:
{jd.text}

Candidate snapshot:
- Name: {candidate.name}
- Experience: {candidate.experience} years
- Stack: {candidate.techStack}
- Resume excerpt: {first 1500 chars of resume text}
- Screening summary: {screening.summary}
- Screening green flags: {screening.greenFlags}
- Screening red flags: {screening.redFlags}

Prior round feedback (if any):
{reviewHistory entries — rating, comments, mark each as "asked" topic}

Generate 12 interview questions for a {interview.durationMinutes}-minute live interview.
Distribute: 4 easy, 5 medium, 3 hard.
- Easy = warm-up, concept recall
- Medium = applied / scenario
- Hard = system design or deep tradeoffs

For each question, return:
- text: the question itself, 1-3 sentences
- difficulty: easy | medium | hard
- topic: a short tag drawn from the JD requirements (e.g. "Express APIs")

If prior rounds exist, AVOID repeating their topics; focus on weak areas they flagged.

Return ONLY a JSON array. No prose.
```

### B. Draft review (on `/live/end`)

```
You're an interview reviewer. Below are the questions asked, the candidate's notes the interviewer captured, and the per-question ratings.

{questions filtered to askedAt != null, each with note + rating}

Produce a balanced, concise review:
- knowledge: 1-5 (average of asked-question ratings, weighted by difficulty: hard 1.5x)
- communication: 1-5 (inferred from how notes describe the candidate's expression of ideas)
- confidence: 1-5 (inferred from notes — hesitation, certainty, follow-ups)
- comments: 2-4 sentences. Lead with one sentence on strengths, one on weaknesses, one with the hiring recommendation rationale.
- recommendation: one of `hire`, `no_hire`, `next_round`

Return ONLY a JSON object with those 5 fields.
```

## Trigger logic (where the user opens it)

On `MyInterviewDetailPage`:

- Add an **"Open co-pilot"** button next to the existing **"Join meeting"** button.
- Button is **enabled** when: `interview.status === 'scheduled' && now is within 15 min before scheduledAt OR scheduledAt has passed and no review has been submitted yet`.
- Button is **disabled** otherwise with tooltip "Available 15 min before interview start".
- Clicking it navigates to `/interviewer/interviews/:id/live`.

We do NOT add a new `in_progress` status to the Interview model — `LiveSession.endedAt == null` is the live signal. The Interview transitions to `completed` only when the review is submitted, exactly as today.

## End-of-interview flow

1. Interviewer clicks **End interview** in the co-pilot.
2. Frontend disables further edits, shows a "Generating review…" overlay.
3. `POST /live-sessions/:id/end` returns the `draftReview` (or, on AI failure, an empty stub + the raw notes concatenated).
4. Frontend navigates to `/interviewer/interviews/:id` and opens the `ReviewForm` with `initial` populated from `draftReview`.
5. Interviewer edits and clicks **Submit review & mark complete** — flows through the existing `submitMyReview` endpoint untouched.

The existing ReviewForm already supports an `initial` prop (used today for edit mode) — we reuse it. Minor change: the existing form's submit button text stays "Submit review & mark complete"; the draft just pre-fills fields.

## Error handling

| Failure | Behavior |
|---|---|
| AI question generation fails (both Gemini and Groq down) | LiveSession still created with `questions: []`. Page shows "Couldn't generate questions — retry" button that re-calls `/start`. Interviewer can still proceed manually (notes attached to a free-form question list — but for MVP, just retry). |
| AI draft review fails on End | Endpoint persists `endedAt` but sets `draftReview = { knowledge: null, communication: null, confidence: null, comments: "[Notes:]\n" + concatenated notes, recommendation: null }`. Frontend shows the form with the notes concatenated in `comments` — interviewer writes the rest manually. |
| Interviewer closes browser mid-interview | Debounced saves mean state is persisted up to ~2 sec ago. Re-opening the page reads back via `GET /live` and resumes. |
| Interviewer opens co-pilot in two tabs | Both tabs share the same session via `GET /live`. Last write wins per question (no merge logic — acceptable for single-user behavior). |
| Interviewer hits End twice | Second call returns the existing `draftReview` (idempotent on already-ended session). |
| Interview is cancelled mid-session | `LiveSession` is orphaned but harmless — it persists, no review is submitted, interview status reflects cancellation. |

## Testing

**Backend unit tests** (Jest, alongside existing 146):
- `liveSessionService.start`: creates session, calls AI, persists questions, idempotent on second call
- `liveSessionService.start`: AI failure path returns session with empty questions
- `liveSessionService.update`: applies partial question updates, validates ranges
- `liveSessionService.end`: sets endedAt, calls AI, persists draft
- `liveSessionService.end`: AI failure path returns notes-concatenated stub
- Ownership guard: a different interviewer's request 403s
- Rate limits trip after configured threshold

**Backend route tests** (supertest):
- Happy path: start → patch → end → state matches
- Auth: missing/invalid token, wrong role, wrong interviewer all rejected

**Frontend smoke** (manual):
- Open co-pilot → see context + 12 questions
- Mark one asked → see coverage bar update
- Type a note, set rating → close + reopen page, values persist
- End interview → ReviewForm opens pre-filled → submit → marked completed

## Out of scope (explicit YAGNI)

Items deferred to later slices, with the reasoning:

- **Realtime HR observation via sockets** — single-user MVP; deferred. Adding it later is additive (new socket room) and doesn't break this design.
- **Auto topic-coverage detection from transcription** — requires live transcription infra; defer. Coverage today comes from the AI-attached topic tag on each question.
- **AI suggesting follow-up questions** — adaptive question generation is its own slice; this MVP is one-shot generation.
- **Live transcription** — separate slice; significant infra (Whisper, audio capture, browser permissions).
- **WebRTC / in-app video** — Zoom/Meet stays external. Never building this.
- **Cheat detection inside co-pilot** — that's a candidate-side concern, separate slice (slice #3 of the original three).
- **Multi-interviewer panel sessions** — only one interviewer per interview in this MVP. Panel rounds defer.
- **Question quality scoring across interviews** — long-term analytics; not MVP.
- **Junior-interviewer training / shadow mode** — long-term; not MVP.
- **HR pre-approval of AI questions** — not MVP. Questions are interviewer-only.

## Open questions for after MVP

These don't block this design but should be revisited once shipped:

1. **Cost** — each interview = 2 Gemini calls (start + end). At 100 interviews/day that's 6,000/month — well within Gemini free tier today but worth tracking.
2. **Audit trail** — should `LiveSession` be visible to admin for QA / dispute resolution? Probably yes, but admin UI is post-MVP.
3. **Re-open after end** — if interviewer ended early by mistake, can they reopen the same session? Current design says no (endedAt is set, a new start creates a new session). Re-open is a fast-follow if requested.

## File structure for implementation

Approximate touch list — informs the plan that comes next:

**Backend (new)**
- `backend/src/models/LiveSession.js` — Mongoose model
- `backend/src/repositories/liveSessionRepository.js`
- `backend/src/services/liveSessionService.js`
- `backend/src/services/liveSessionAiService.js` — question + draft prompts
- `backend/src/controllers/liveSessionController.js`
- `backend/src/routes/liveSessionRoutes.js`
- `backend/src/validators/liveSessionValidator.js`
- `backend/tests/unit/liveSessionService.test.js`

**Backend (modify)**
- `backend/src/routes/index.js` — mount the new router

**Frontend (new)**
- `frontend/src/features/liveInterview/LiveInterviewPage.jsx`
- `frontend/src/features/liveInterview/LiveInterviewPage.scss`
- `frontend/src/features/liveInterview/ContextPanel.jsx`
- `frontend/src/features/liveInterview/QuestionCard.jsx`
- `frontend/src/features/liveInterview/CoverageBar.jsx`
- `frontend/src/features/liveInterview/liveInterviewSlice.js`
- `frontend/src/api/liveInterviewApi.js`

**Frontend (modify)**
- `frontend/src/routes/AppRoutes.jsx` — add `/interviewer/interviews/:id/live`
- `frontend/src/features/myInterviews/MyInterviewDetailPage.jsx` — add "Open co-pilot" button
- `frontend/src/store/index.js` — add the new slice reducer

Estimated effort: 1 focused week (~8 small tasks) using subagent-driven-development.
