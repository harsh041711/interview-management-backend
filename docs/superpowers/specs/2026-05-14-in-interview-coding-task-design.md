# In-Interview Coding Task — Design Spec

**Status:** Approved
**Date:** 2026-05-14
**Audience:** engineers implementing this feature

---

## Goal

During a live interview, let the interviewer click one button on the co-pilot page to:

1. AI-generate a fresh coding problem (problem statement + starter code + test cases) tailored to the candidate's JD.
2. Get a public link they can paste into the Zoom/Meet chat.
3. Watch task status update on the co-pilot page (pending → opened → submitted).
4. Review the candidate's final code + per-test-case pass/fail without leaving the call.

---

## Architecture

One new MongoDB collection (`LiveCodingTask`) holds the AI-generated problem and the candidate's submission. The interviewer's request flows through the existing `myInterviewRoutes` (auth + ownership-guarded). The candidate accesses a new token-gated public route. AI generation reuses `codingProblemAiService.generateFullProblem`. Code execution reuses `codingExecutionService` (Piston).

```
Interviewer (co-pilot page)            Backend                          Candidate (public page)
─────────────────────────────          ─────────────────                ────────────────────────
Click "Send coding task"
  ↓ open modal
Pick difficulty + language
  ↓ POST /me/interviews/:id/coding-tasks
                                       generateFullProblem(JD context)
                                       create LiveCodingTask + token
                                       ← return task + publicUrl
Show preview + "Copy link"
  ↓ paste into Zoom chat
                                                                        Open /coding-task/:token
                                                                          ↓ GET /coding-tasks/public/:token
                                                                        Render runner page
                                                                        Type code, click Run
                                                                          ↓ POST /coding-tasks/public/:token/run
                                       run via codingExecutionService
                                                                          ← stdout/stderr/results
                                                                        Click Submit
                                                                          ↓ POST /coding-tasks/public/:token/submit
                                       run + save submission + flip
                                       status to 'submitted'
                                                                          ← success
Poll every 5s:
GET /me/interviews/:id/coding-tasks
  ← list with status + submission
Show submitted code + pass/fail
```

---

## Data Model

### `LiveCodingTask` (new collection)

```js
{
  _id,
  interview:    ObjectId  (ref Interview, required, indexed)
  candidate:    ObjectId  (ref Candidate, required)
  interviewer:  ObjectId  (ref User, required)
  liveSession:  ObjectId  (ref LiveSession, optional — set if a co-pilot session is active)

  token:        String    (unique, indexed, generated via crypto.randomBytes(24).toString('hex'))

  problem: {
    title:              String  (≤200)
    description:        String  (≤10000)
    difficulty:         enum    ('easy' | 'medium' | 'hard')
    language:           enum    ('js' | 'python' | 'php')
    starterCode:        String  (the starter for the chosen language only)
    testCases: [{
      stdin:            String
      expectedStdout:   String
      isHidden:         Boolean (first one forced visible — sample case)
    }]
  }

  submission: {
    code:               String
    submittedAt:        Date
    results: [{
      stdin:            String
      expectedStdout:   String
      actualStdout:     String
      stderr:           String
      passed:           Boolean
      runtimeMs:        Number
    }]
    summary: {
      passed:           Number
      total:            Number
    }
  } | null

  status:       enum     ('pending' | 'opened' | 'submitted' | 'cancelled')
  openedAt:     Date     (set first time public GET hits this token)
  submittedAt:  Date
  createdAt, updatedAt   (mongoose timestamps)
}
```

**Indexes:** `{ interview: 1, createdAt: -1 }`, unique on `token`.

**Why a new model (not `TestSession`):** `TestSession` is `unique: true` on `candidate` — one HR-sent pre-screen test per candidate, forever. We need multiple per candidate (across rounds, even within one interview).

---

## Backend — Files & Responsibilities

### Created

| File | Responsibility |
|---|---|
| `backend/src/models/LiveCodingTask.js` | Mongoose schema above + `toJSON` strips `__v` and `token` (token is sensitive). |
| `backend/src/repositories/liveCodingTaskRepository.js` | `create`, `findByToken`, `findById`, `listByInterview`, `updateById`, `updateByToken`. Pattern: match existing repos in this folder. |
| `backend/src/services/liveCodingTaskService.js` | Business logic — `create({ interviewId, interviewerId, difficulty, language })`, `getPublic({ token })`, `runPublic({ token, code })`, `submitPublic({ token, code })`, `listForInterview({ interviewId, interviewerId })`, `cancel({ id, interviewerId })`. |
| `backend/src/controllers/liveCodingTaskController.js` | HTTP layer — thin wrappers calling the service. |
| `backend/src/routes/liveCodingTaskPublicRoutes.js` | `GET /:token`, `POST /:token/run`, `POST /:token/submit` — mounted at `/api/coding-tasks/public`. No auth, token-gated. Re-use `codingRunLimiter` from existing public coding-test routes for `POST /:token/run`. |
| `backend/src/validators/liveCodingTaskValidator.js` | Joi schemas — `createSchema` (difficulty enum, language enum), `tokenParamSchema`, `runSchema` (code: string, required), `submitSchema` (same). |

### Modified

| File | Change |
|---|---|
| `backend/src/routes/myInterviewRoutes.js` | Add `POST /:id/coding-tasks` (create), `GET /:id/coding-tasks` (list), `POST /:id/coding-tasks/:taskId/cancel`. All gated by `requireAuth + requireMyInterview` (existing middleware). |
| `backend/src/routes/index.js` | Mount the new public router. |
| `backend/src/utils/constants.js` | Add `LIVE_CODING_TASK_STATUS` enum (`pending`, `opened`, `submitted`, `cancelled`) + `LIVE_CODING_TASK_STATUS_LIST`. |

### Service Logic Details

**`liveCodingTaskService.create`:**
1. Load interview; reject if status is anything other than `scheduled` (the co-pilot page is the only entry point and it's only reachable for scheduled interviews within the start window).
2. Build topic hint from `candidate.screening.jdSnapshot.jobRole || jdSnapshot.title || interview.role || 'general programming'`.
3. Call `codingProblemAiService.generateFullProblem({ topic, difficulty, languages: [language] })`. If it returns `null`, throw `ApiError.badGateway('AI could not generate a problem — try again')`.
4. Build `LiveCodingTask` document, generate token, pick `starterCode[language]` from AI output.
5. If there's an active `LiveSession` for this interview, set `liveSession`. Don't fail if there isn't one.
6. Save and return the task. Public URL is built on the frontend.

**`liveCodingTaskService.getPublic`:**
- Find by token; if not found → `ApiError.notFound`.
- If `status === 'pending'`, flip to `'opened'` and set `openedAt = now`.
- Strip `token`, `interviewer`, `liveSession` from the response.
- Strip `expectedStdout` from hidden test cases (candidate must not see expected output for hidden tests; visible ones can stay).

**`liveCodingTaskService.runPublic`:**
- Find by token. Reject if `status === 'submitted'` or `'cancelled'` (`ApiError.conflict`).
- Run candidate code against **visible test cases only** via `codingExecutionService.runAgainstTestCases({ language, code, testCases: visibleCases })`. Visible = `!isHidden`.
- Do **not** persist anything (run is ephemeral, matching existing pattern).
- Return per-case results to candidate.

**`liveCodingTaskService.submitPublic`:**
- Reject if already submitted/cancelled.
- Run against **all test cases** (hidden + visible).
- Build `submission` object with results array and `summary { passed, total }`.
- Update task: set `submission`, `status = 'submitted'`, `submittedAt = now`.
- Return: success indicator + summary (not full code back — candidate already has it).

**`liveCodingTaskService.listForInterview`:**
- Verify interviewer owns the interview (middleware does this — service receives `interviewerId` for an extra check).
- Return all tasks for this interview, newest first. **Keep `token`** in the response so the interviewer can re-copy the link if they didn't catch it the first time. Token is only sensitive from the candidate's side — the interviewer owns it.

**`liveCodingTaskService.cancel`:**
- Only allowed if `status === 'pending' || 'opened'`.
- Sets `status = 'cancelled'`. Future GET-by-token returns 410 Gone.

---

## Frontend — Files & Responsibilities

### Created

| File | Responsibility |
|---|---|
| `frontend/src/features/liveInterview/SendCodingTaskModal.jsx` | Two-step modal. Step 1: difficulty + language dropdowns + Generate button (loading state during AI call). Step 2: problem preview (title, description, difficulty pill, language pill, sample test case) + copy-link button (with "Copied!" feedback) + "Send another" / "Done" buttons. |
| `frontend/src/features/liveInterview/SendCodingTaskModal.scss` | Local styles. Two-column preview layout, code-block style for sample test case. |
| `frontend/src/features/liveInterview/CodingTasksPanel.jsx` | List of all tasks for this interview, polled every 5s while page is mounted. Each item: title, status badge (pending/opened/submitted/cancelled), submitted timestamp, a "Copy link" button (re-copy the public link), and — for `pending`/`opened` tasks only — a "Cancel" button. Submitted tasks expand to show candidate's code in a read-only editor + per-test-case pass/fail. |
| `frontend/src/features/liveInterview/CodingTasksPanel.scss` | Local styles. |
| `frontend/src/features/liveInterview/codingTasksSlice.js` | Redux slice — state: `{ list, status, busy }`. Thunks: `fetchTasks(interviewId)`, `createTask({ interviewId, difficulty, language })`, `cancelTask(taskId)`. |
| `frontend/src/features/codingTask/CodingTaskPage.jsx` | The **public candidate-facing** runner page. Loads task by token from URL, renders read-only problem statement + Monaco editor pre-filled with starter code + Run / Submit buttons. After submit, shows summary screen ("X of Y tests passed — your interviewer has been notified"). |
| `frontend/src/features/codingTask/CodingTaskPage.scss` | Styles — three-pane layout matching existing coding-test page where reasonable. |
| `frontend/src/api/liveCodingTaskApi.js` | Two API clients combined: interviewer-side (`/me/interviews/:id/coding-tasks` create/list, `/me/interviews/:id/coding-tasks/:taskId/cancel`) and public-side (`/coding-tasks/public/:token` load/run/submit). |

### Modified

| File | Change |
|---|---|
| `frontend/src/features/liveInterview/LiveInterviewPage.jsx` | Add "Send coding task" button to the topbar (next to "End interview"). Render `<CodingTasksPanel interviewId={id} />` in the queue column below the question cards (or in `ContextPanel`'s sidebar — see "UI placement" below). State for modal open/close. |
| `frontend/src/features/liveInterview/LiveInterviewPage.scss` | Minor: button styling, panel spacing. |
| `frontend/src/store/index.js` (or wherever the store is composed) | Register `codingTasksSlice` reducer under `codingTasks`. |
| `frontend/src/router.jsx` (or wherever routes live) | Add public route `/coding-task/:token` → `CodingTaskPage`. No auth wrapper. |

### Reuse — do not rebuild

- Monaco editor wrapper component used by existing `/coding-test/:token` runner page.
- Existing run-output styling for stdout/stderr/per-case results.
- Existing `Modal`, `Button`, `Loader`, `EmptyState`, `Toast` common components.

### UI Placement on Co-pilot Page

**Topbar:** Add a "Send coding task" button to the right of the timer, before "End interview".

**Body — new "Coding tasks" panel:** Render below the question cards in the `live__queue` column. Empty state when no tasks. As tasks are created, list appears with most recent first. While task is `pending` or `opened`, show status; when `submitted`, the row becomes expandable to view code + results.

**Copy link UX:** On step 2 of the modal, the link is shown in a read-only input + "Copy" button. After click, button briefly shows "Copied ✓".

### Public Candidate Page (`/coding-task/:token`)

Bare-bones, no header chrome (candidate is mid-interview, no nav needed):

```
┌─────────────────────────────────────────────────────────────┐
│  [Problem title]                          [Easy/Med/Hard]   │
│  Difficulty pill · Language pill                            │
├──────────────────────────┬──────────────────────────────────┤
│ Problem description      │  [Monaco editor]                 │
│ (markdown rendered)      │  ↑ pre-filled with starter code  │
│                          │                                  │
│ Sample case:             │  [Run]  [Submit]                 │
│  stdin:  ...             │                                  │
│  output: ...             │  ┌── Output ────────────────┐    │
│                          │  │ Per-case pass/fail        │    │
│                          │  │ stdout/stderr             │    │
│                          │  └───────────────────────────┘    │
└──────────────────────────┴──────────────────────────────────┘
```

After Submit → simple "Submitted!" screen with summary ("4 of 5 hidden tests passed") and a one-liner: "Your interviewer has been notified. You can close this tab."

---

## Polling

Co-pilot's `CodingTasksPanel` polls `GET /me/interviews/:id/coding-tasks` every **5 seconds** while mounted. Stop polling on unmount. Do **not** poll the public-side — the candidate just types and clicks Submit.

Trade-off: 5s polling is wasteful but trivial to implement and good enough for MVP. WebSockets / SSE is an optional future upgrade.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| AI returns null (rate-limited, both providers down) | Service throws `ApiError.badGateway('AI could not generate a problem — try again')`. Modal shows error, keeps inputs filled so user can retry. |
| Interviewer is not the assigned interviewer | `requireMyInterview` middleware → 403 (existing behavior). |
| Interview status is `cancelled` or `reschedule_requested` | Service rejects with `ApiError.conflict('Cannot send a coding task while the interview is X')`. |
| Candidate opens an invalid token | 404 — show "This link has expired or doesn't exist." |
| Candidate opens a cancelled task | 410 Gone — show "Your interviewer cancelled this task. Please wait." |
| Candidate hits Run with empty code | Service runs as normal (Piston returns stderr) — no special-case. |
| Piston is down | `codingExecutionService` already handles this — returns per-case `error` field; frontend renders it. |
| Network error during Submit | Frontend shows toast "Submit failed — retry" with retry button. Submission is idempotent server-side (status check prevents double-submit). |

---

## Testing

### Backend — Jest

**`liveCodingTaskService.test.js`:**
- `create` calls AI service, persists task with token, returns task with public URL.
- `create` throws `badGateway` if AI returns null.
- `create` rejects if interview status is cancelled.
- `getPublic` flips `pending` → `opened` and sets `openedAt`.
- `getPublic` strips `expectedStdout` from hidden test cases.
- `getPublic` returns 404 for unknown token.
- `getPublic` returns 410 for cancelled task.
- `runPublic` only runs against visible cases, doesn't persist.
- `submitPublic` runs all cases, saves `submission`, flips status to `submitted`.
- `submitPublic` rejects if already submitted.
- `listForInterview` returns tasks newest-first, strips `token`.
- `cancel` only allowed for pending/opened.

**Route-level tests (`tests/routes/liveCodingTask.test.js`):**
- Smoke test happy path: create → public load → run → submit → list.
- Auth: anon `POST /me/interviews/:id/coding-tasks` → 401.
- Auth: wrong interviewer → 403.
- Validation: invalid difficulty/language → 422.

Mock `codingProblemAiService.generateFullProblem` and `codingExecutionService.runAgainstTestCases` for deterministic tests.

### Frontend — Manual

Verify end-to-end during a real co-pilot session:
1. Click "Send coding task" → modal opens.
2. Pick Easy + JavaScript → Generate → preview renders within ~5s.
3. Copy link → paste in incognito window → runner page loads.
4. Type code → Run → output renders.
5. Submit → "Submitted!" screen on candidate side.
6. On co-pilot, the task row flips to `submitted` within ~5s (polling).
7. Expand the row → see code + per-test-case pass/fail.

---

## Out of Scope (YAGNI)

- Live code mirroring (interviewer sees candidate's keystrokes).
- Email delivery of the link.
- Cheat-event tracking (tab switches, paste).
- Enforced per-task timer.
- Editing or regenerating the problem after generation (just create a new task).
- Java / C++ language support (existing AI service and Piston wrapper only support JS, Python, PHP — extending is a separate task).
- "Hint" button or AI-assisted help to the candidate.
- Multi-language starter (candidate picks language) — language is locked at task creation by the interviewer.

---

## Future Enhancements (not in this plan)

- **WebSocket/SSE push** instead of 5s polling.
- **Live code preview** for the interviewer (autosave candidate code every N seconds, show in read-only editor).
- **Run history** — keep all the candidate's `Run` clicks, not just the final Submit, for post-interview review.
- **Add to problem bank** button — if a generated problem turned out great, save it as a `CodingProblem` for future HR use.
- **Cheat signals** — tab switches, paste events. The candidate page already runs in their browser; the existing pre-screen page has the plumbing.
