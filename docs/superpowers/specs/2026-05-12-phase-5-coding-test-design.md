# Phase 5 — Coding Test (Design)

**Status:** Draft for review
**Date:** 2026-05-12

## 1. Goal

Add a coding challenge layer to Round 1 so HR can judge a candidate by their actual code, not just MCQ scores. HR maintains a coding problem bank (with AI-generated drafting help), sends a coding test link to the candidate, the candidate solves the problem(s) in a Monaco editor (JS / Python / PHP), submits — the system auto-runs test cases via the Piston public API, stores per-case results, and notifies HR. HR reviews the code and per-case results, rates each problem, and clicks Shortlist or Reject to flip the candidate's status with the corresponding email.

The coding test is **independent of the existing MCQ test** — HR can send one, the other, or both. When both are sent, the MCQ's auto-shortlist behavior is suppressed and HR makes the final call after reviewing the coding test.

## 2. End-to-end flow

```
HR approves resume
        │
        ├── Send test (MCQ, existing) ──→ pending → completed → [auto: shortlisted / rejected / cheated]
        │                                                          (auto-fire SUPPRESSED if coding pending)
        │
        └── Send coding test (NEW) ──→ samples N problems from bank
                                              │
                                              ▼
                                   candidate.codingTest.sentAt set
                                              │
                                              ▼
                       Candidate opens /coding-test/:token
                              │
                              ▼
                Monaco editor + problem + language picker
                              │
                              ▼
                       Candidate submits
                              │
                              ▼
              Backend runs each test case via Piston (sequential)
                              │
                              ▼
                One CodingSubmission per problem stored
                              │
                              ▼
                    HR notification email fires
                              │
                              ▼
       HR opens /candidates/:id — Coding Test panel renders
                              │
                              ▼
        HR rates each problem 1-5 + comment
                              │
                              ▼
   [Shortlist] → candidate.status = shortlisted + shortlist email
   [Reject]    → candidate.status = rejected + rejection email
```

## 3. CodingProblem entity

### 3.1 Mongoose model

```js
{
  title:              String   (required, ≤200),
  description:        String   (required, ≤10000),       // markdown
  difficulty:         enum ['easy', 'medium', 'hard'] (required, default 'medium'),
  techStack:          [String] (required, ≥1),           // e.g. ['react', 'frontend']
  supportedLanguages: [String] (required, ≥1),           // subset of ['js', 'python', 'php']
  starterCode: {
    js:     String,
    python: String,
    php:    String,
  },
  testCases: [{
    stdin:          String,
    expectedStdout: String,
    isHidden:       Boolean (default true),              // visible cases shown as samples to candidate
  }],
  source:    enum ['manual', 'ai'] (default 'manual'),
  isActive:  Boolean (default true),
  timesUsed: Number (default 0),                          // round-robin like Round 1 question shuffling
  createdBy: ObjectId (ref Admin, required),
  timestamps: true,
}
```

Indexes:
- `{ techStack: 1, difficulty: 1, isActive: 1 }` — sampling lookups
- `{ source: 1, isActive: 1, updatedAt: -1 }` — admin list

### 3.2 Admin UI — `/coding-problems`

- New sidebar nav entry: **Coding Problems** (placed near Questions / Job Descriptions).
- List columns: `Title | Tech / Difficulty | Languages | Test cases | Status | Updated | Actions`.
- Filters: search (title/tech), difficulty, language (one of JS/Python/PHP), source (manual/AI), active/inactive.
- Row actions: **Edit**, **Deactivate** (soft-delete only — preserves references on candidates that already used this problem).

### 3.3 Create / edit form

Sections in order:
1. **Metadata** — title, difficulty radio, tech stack (tag input), supported languages (checkbox group: JS/Python/PHP).
2. **Description** — markdown textarea with live preview.
3. **Starter code** — one Monaco editor per supported language. Each has a **Generate with AI** button that drafts boilerplate (function signature + stdin parsing scaffolding) for that single language.
4. **Test cases** — repeatable row of `stdin` / `expectedStdout` textareas + `isHidden` checkbox. At least one required.
5. **Top-level shortcut** — **Generate entire problem** button. HR types a topic + difficulty + language set → AI drafts title, description, starter code for each language, and 3–5 test cases. HR reviews/edits and saves.

### 3.4 AI generation

New service: `backend/src/services/codingProblemAiService.js`. Reuses `aiService.askWithFallback` (Gemini chain → Groq fallback, mirroring Round 1).

Two prompt builders:

**`buildStarterCodePrompt({ description, language })`** — returns starter code string only.
- Prompt: "Given this coding problem: {description}, generate ONLY the starter code for {language} as a self-contained program that reads stdin and prints output. Include parsing scaffolding and a clearly-marked 'your code here' placeholder. Output ONLY the code, no commentary."

**`buildFullProblemPrompt({ topic, difficulty, languages })`** — returns full problem JSON.
- Prompt: "Generate a coding interview problem matching: topic={topic}, difficulty={difficulty}, languages=[{languages}]. Output ONLY valid JSON: { title, description, starterCode: { lang: code, ... }, testCases: [{ stdin, expectedStdout, isHidden }] }. 3-5 test cases, mostly hidden. Description in markdown."

Both prompts use `aiService.extractJson` for parsing. On failure, return null and the controller surfaces a friendly error to HR.

### 3.5 Admin API surface (admin-only, `requireRole('admin')`)

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/api/v1/coding-problems`               | Paginated list with filters |
| `POST`   | `/api/v1/coding-problems`               | Create |
| `GET`    | `/api/v1/coding-problems/:id`           | Detail |
| `PATCH`  | `/api/v1/coding-problems/:id`           | Update |
| `DELETE` | `/api/v1/coding-problems/:id`           | Soft-delete (sets `isActive = false`) |
| `POST`   | `/api/v1/coding-problems/ai/starter-code` | Body: `{ description, language }` → `{ code: string }` |
| `POST`   | `/api/v1/coding-problems/ai/full-problem` | Body: `{ topic, difficulty, languages }` → full problem JSON |

## 4. Sending the coding test

### 4.1 HR UI

On `/candidates/:id`, alongside the existing "Send test" button (for MCQ), a new **Send coding test** button. Clicking it opens a small modal:

```
Send coding test
─────────────────
Problems:   [ 1 ▼ ]   (1–5)
Duration:   [ 30 ] min
Difficulty: [ medium ▼ ]

         [ Cancel ]   [ Send coding test ]
```

Defaults: 1 problem · 30 min · medium difficulty.

### 4.2 Backend sampling logic

When HR submits the modal, `POST /api/v1/candidates/:id/send-coding-test` runs this pipeline:

1. **Query the bank** — `CodingProblem.find({ isActive: true, techStack: { $in: candidate.techStack }, difficulty })` ordered by `timesUsed: asc` (least-used first) for fairness.
2. **If enough matches** (`bank.length >= problemCount`) → take the top `problemCount`, atomically increment their `timesUsed` counter, done.
3. **If not enough** → for each missing slot, call `codingProblemAiService.generateFullProblem({ topic: candidate.techStack[0], difficulty, languages: ['js','python','php'] })`. Persist each AI-generated problem to the `CodingProblem` collection with `source: 'ai'`, `timesUsed: 1`. Use them in this candidate's test.
4. **If AI also fails** (both Gemini and Groq down) and bank can't fill the request → return `409` with `E_NO_PROBLEMS`. HR sees an error toast: "No problems available and AI generation failed. Please create coding problems manually first."
5. **Generate coding-test token** — UUID + HMAC, mirrors `tokenGenerator`. 24-hour default `expiresAt`.
6. **Persist on candidate:**
   ```js
   candidate.codingTest = {
     token, expiresAt,
     problems: [<problem ObjectIds>],
     problemCount, durationMinutes, difficulty,
     sentAt: new Date(),
     firstOpenedAt: null,
     submittedAt: null,
     reviewedAt: null,
     outcome: null,
   };
   ```
7. **Fire candidate email** via `setImmediate`:

   > Subject: **Your coding challenge is ready — {techStack}**
   >
   > Hi {name},
   >
   > As part of your application, please complete this coding challenge: **{problemCount} problem(s)**, **{durationMinutes} minutes** total. Supported languages: **JavaScript / Python / PHP** (pick one per problem).
   >
   > Open your coding test: **{frontendUrl}/coding-test/{token}**
   >
   > Note: pasting is disabled in the editor and tab-switching is monitored. The timer starts the moment you open the link.
   >
   > Best regards,
   > The Hiring Team

### 4.3 Resend / Regenerate

- **Resend invite** (`POST /api/v1/candidates/:id/coding-test/resend`) — re-fires the same email with the existing token. Guards: `codingTest.sentAt` exists and not expired.
- **Regenerate** (`POST /api/v1/candidates/:id/coding-test/regenerate`) — fresh token + `expiresAt`, resets `submittedAt`/`firstOpenedAt`/`outcome` to null, fires the email. Old `CodingSubmission` records remain (audit trail).

## 5. Candidate-facing UI

### 5.1 Route + layout

`/coding-test/:token` — uses `PublicLayout` (no auth). Backend validates token + HMAC, checks `expiresAt`, checks `submittedAt` (already submitted? show locked card). On first open: stamps `firstOpenedAt`.

### 5.2 Page structure (single problem)

```
┌───────────────────────────────────────────────────────────────┐
│ Coding Challenge — Alice Doe          ⏱  28:42 remaining      │
│ Problem 1 of 1 · Tab-switches: 0                              │
├───────────────────────────────────────────────────────────────┤
│ Sum of N numbers · Easy                                       │
│ ───                                                           │
│ Given a list of integers via stdin (space-separated on one    │
│ line), print their sum to stdout.                             │
│                                                                │
│ Sample input:  1 2 3 4 5                                      │
│ Sample output: 15                                             │
├───────────────────────────────────────────────────────────────┤
│ Language: [ JavaScript ▼ ]                                    │
│                                                                │
│ ┌─ Monaco editor ───────────────────────────────────────────┐│
│ │ // Read stdin and print the sum                            ││
│ │ const input = require('fs').readFileSync(0, 'utf8');       ││
│ │ const nums = input.trim().split(/\s+/).map(Number);        ││
│ │ // your code here                                          ││
│ └────────────────────────────────────────────────────────────┘│
│                                  [ Submit and finish ]        │
└───────────────────────────────────────────────────────────────┘
```

### 5.3 Multi-problem navigation (count > 1)

Problems shown one at a time. Header gets **Previous / Next** buttons. Per-problem `(language, code)` state held in component state + localStorage. Single **Submit** at the bottom of the last problem; once any problem has code, a "Submit all" button is also available from any problem view.

### 5.4 Language picker

Dropdown shows only languages the problem supports (intersection of problem's `supportedLanguages` and the global enabled set). Switching languages on a non-empty editor opens a confirmation modal: *"Switching language will replace your current code with the starter code for {new language}. Continue?"*

### 5.5 Monaco editor config

- `language` mode matches selected language (`javascript`, `python`, `php`).
- `theme: 'vs'`, `automaticLayout: true`, `minimap: { enabled: false }`.
- `contextmenu: false`.
- Read-only fields not set (this is the candidate's editing instance).

### 5.6 Anti-cheat

1. **Block paste** — Monaco `onDidPaste` → `preventDefault` + toast "Pasting is disabled. Please type your code."
2. **Block copy** — wrap editor in a div with `onCopy={(e) => e.preventDefault()}` to disable text export.
3. **Block context menu** — Monaco option `contextmenu: false` + wrapper `onContextMenu={(e) => e.preventDefault()}`.
4. **Block keyboard shortcuts** — global `keydown` listener while the coding-test page is mounted: prevent `Ctrl+V` / `Cmd+V` / `Ctrl+Shift+V` / `Ctrl+C` / `Cmd+C` (still allow other shortcuts the candidate needs).
5. **Tab-switch detection** — `visibilitychange` listener. On `document.hidden === true`:
   - Increment local `tabSwitches` counter.
   - When candidate returns: stern modal *"You left the test tab. Tab switching is monitored. This is switch #N. Please stay focused."* — single OK button.
6. **No auto-submit on tab-switch.** Count is the signal HR uses during review.

### 5.7 Timer

- `firstOpenedAt` stamped on first server GET. Frontend computes remaining from `firstOpenedAt + durationMinutes - now`.
- Persists across browser refresh (server-stored).
- At T-0, auto-submits whatever's in the editors (sets `autoSubmitted: true` on each submission record).

### 5.8 Submit

`POST /api/v1/coding-test/:token/submit`:
- Body: `{ submissions: [{ problemId, language, code }, ...], tabSwitches }`.
- Backend validates token, not-already-submitted, then for each problem:
  - Create `CodingSubmission` skeleton.
  - Call `codingExecutionService.runAllTestCases({ language, code, testCases })` synchronously.
  - Update submission with `runs[]`, `passedCount`, `totalCount`, `submittedAt`.
- After all submissions are saved: set `candidate.codingTest.submittedAt = now`, `outcome = 'pending_review'`.
- Fire HR notification email via `setImmediate`.
- Return success page render data to candidate.

## 6. Submission storage & Piston integration

### 6.1 Mongoose model — `CodingSubmission`

```js
{
  candidate:        ObjectId (ref Candidate, required, indexed),
  codingTestToken:  String   (required, indexed),
  problem:          ObjectId (ref CodingProblem, required),
  language:         enum ['js', 'python', 'php'] (required),
  code:             String   (required, ≤50000),

  runs: [{
    stdin:          String,
    expectedStdout: String,
    actualStdout:   String,
    stderr:         String,
    exitCode:       Number,
    runtimeMs:      Number,
    passed:         Boolean,
    error:          String,           // populated when piston call itself failed
  }],
  passedCount: Number,
  totalCount:  Number,

  rating:        Number (1–5, null until rated),
  reviewComment: String (≤2000),
  reviewedBy:    ObjectId (ref Admin),
  reviewedAt:    Date,

  tabSwitches:   Number (default 0),
  submittedAt:   Date (required),
  autoSubmitted: Boolean (default false),

  timestamps: true,
}
```

Index: `{ candidate: 1, problem: 1 }` unique (one submission per candidate per problem).

### 6.2 Piston call (per test case)

`POST https://emkc.org/api/v2/piston/execute`

```json
{
  "language": "python",
  "version": "*",
  "files": [{ "name": "main.py", "content": "<code>" }],
  "stdin": "<test case stdin>",
  "run_timeout": 5000,
  "compile_timeout": 10000,
  "run_memory_limit": 256000000
}
```

Response shape:
```json
{
  "language": "python",
  "version": "3.12.0",
  "run": {
    "stdout": "15\n",
    "stderr": "",
    "code": 0,
    "signal": null,
    "output": "15\n"
  }
}
```

Pass logic: `passed = run.stdout.trim() === expectedStdout.trim() && run.code === 0`.

### 6.3 Service — `codingExecutionService.js`

```js
const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const LANG_MAP   = { js: 'javascript', python: 'python', php: 'php' };
const FILE_NAMES = { js: 'main.js', python: 'main.py', php: 'main.php' };
const RUN_TIMEOUT_MS = 5000;

const runOne = async ({ language, code, stdin }) => { /* fetch with timeout */ };
const runAllTestCases = async ({ language, code, testCases }) => {
  const runs = [];
  for (const tc of testCases) {           // sequential — stays under Piston's 5 req/s rate
    const r = await runOne({ language, code, stdin: tc.stdin });
    runs.push({
      stdin: tc.stdin,
      expectedStdout: tc.expectedStdout,
      actualStdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode,
      runtimeMs: r.runtimeMs,
      passed: r.stdout?.trim() === tc.expectedStdout.trim() && r.exitCode === 0,
      error: r.error,
    });
  }
  return runs;
};
```

### 6.4 Piston failure

If Piston times out or returns 5xx for a case: store `run.error = 'piston unavailable'`, `passed = false`. HR sees the error in the review UI and has a **Re-run** button that re-executes all cases via Piston fresh.

### 6.5 Concurrency

Test cases for one submission run sequentially. Across multiple problems in one coding test (e.g. 3 problems × 5 cases = 15 cases), submissions are processed sequentially too — worst case ~15s total backend latency on submit. HR is notified asynchronously, so the candidate's success page doesn't have to wait the full 15s — we render the success page after the first problem completes and continue running the rest in `setImmediate`. (Parallel execution via `Promise.all` is deferred — see §13.)

## 7. HR review UI

### 7.1 Coding Test panel on `/candidates/:id`

Renders when `candidate.codingTest` exists. Layout:

```
┌─ Coding Test ────────────────────────────────────────────────┐
│ Sent 12 May 14:30 · Submitted 12 May 15:02 (32 min taken)    │
│ 1 problem · Tab-switches: 3                  [ Re-run all ]  │
└──────────────────────────────────────────────────────────────┘

For each submitted problem (one card each):

┌─ Problem 1: Sum of N numbers · medium ──────────────────────┐
│ Language: Python · 0 tab-switches during this problem        │
│                                                               │
│ Test cases: 3/4 passed                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ #1 ✓  stdin "1 2 3"     expected "6"   got "6"          │ │
│ │ #2 ✓  stdin "10 -5"     expected "5"   got "5"          │ │
│ │ #3 ✓  stdin "0"         expected "0"   got "0"          │ │
│ │ #4 ✗  stdin ""          expected "0"   got ""           │ │
│ │       stderr: TypeError: ...                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─ Code (read-only Monaco) ──────────────────────────────┐  │
│ │ def solve():                                             │  │
│ │     nums = input().split()                               │  │
│ │     print(sum(int(n) for n in nums))                     │  │
│ │ solve()                                                  │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                               │
│ Rating: ⭐⭐⭐⭐☆   Comment: [_________________________]      │
│                                       [ Save rating ]        │
└───────────────────────────────────────────────────────────────┘

After every problem has a rating:
[ Shortlist candidate ]   [ Reject candidate ]
```

### 7.2 Components & interactions

- **Read-only Monaco** — `@monaco-editor/react` with `options={{ readOnly: true }}`. Same package as the candidate side; bundle is loaded once and shared.
- **Test cases table** — collapsed by default per case; click row to expand and see full stdout/stderr.
- **Tab-switch badge** — color: red if > 5, amber if 1–5, green if 0. Tooltip shows summary.
- **Re-run all** — `POST /api/v1/coding-submissions/:submissionId/re-run` per problem submission. Re-executes via Piston, overwrites `runs[]`.
- **Rating + comment** — autosave on blur. Save explicitly via "Save rating" button. Persists `rating`, `reviewComment`, `reviewedBy`, `reviewedAt`.
- **Shortlist / Reject** — disabled until **every** problem submission has `rating != null`. Hover tooltip explains.

### 7.3 HR API additions

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/coding-submissions/:id/rate`   | Body `{ rating, reviewComment }` |
| `POST` | `/api/v1/coding-submissions/:id/re-run` | Re-runs test cases via Piston |

The Shortlist/Reject buttons reuse the existing Round 1 outcome endpoints (`POST /:id/shortlist`, `POST /:id/reject` if present, otherwise piggyback on the existing select/reject flow). Both update `candidate.codingTest.outcome` in the same transaction.

## 8. Status model & MCQ/coding interaction

**No new values added to `CANDIDATE_STATUS` enum.** Coding state lives on the `candidate.codingTest` sub-doc + linked `CodingSubmission` records.

### 8.1 `candidate.codingTest` sub-doc

```js
codingTest: {
  token, expiresAt,
  problems:        [ObjectId],
  problemCount, durationMinutes, difficulty,
  sentAt,
  firstOpenedAt,
  submittedAt,
  reviewedAt,
  outcome: enum ['pending_review', 'shortlisted', 'rejected', null],
}
```

`outcome` is set when HR clicks Shortlist/Reject on the coding panel — alongside the flip of `candidate.status`.

### 8.2 MCQ + coding interaction

| Scenario | Behavior |
|---|---|
| Only MCQ sent | Existing auto-shortlist on MCQ submit. No change. |
| Only coding sent | No auto-shortlist. HR manually clicks Shortlist/Reject after reviewing. |
| Both sent — MCQ submitted first | MCQ auto-shortlist **suppressed** if `candidate.codingTest.sentAt` exists and `codingTest.outcome === 'pending_review'`. MCQ result is stored normally (percentage, submission record), but the auto-status-flip and Round 1 outcome email are skipped. HR makes final call from coding panel. |
| Both sent — coding submitted first | Nothing auto-flips. HR waits for MCQ to come in (or its timer expires), then makes the call. |
| Both submitted, HR clicks Shortlist/Reject on coding | Status flips, one Round 1 outcome email fires. Idempotency guard: only send email if `candidate.status` is changing from a non-terminal state. |

### 8.3 The MCQ-side change (single edit)

In `backend/src/services/submissionService.js` (or wherever the Round 1 outcome auto-fires) — insert one check before firing the outcome email + status flip:

```js
const hasPendingCodingReview =
  candidate.codingTest?.sentAt &&
  candidate.codingTest.outcome === 'pending_review';

if (hasPendingCodingReview) {
  logger.info('MCQ auto-shortlist suppressed — coding test pending HR review', { candidateId });
  // store submission + percentage as today, but DO NOT flip status or fire outcome email
} else {
  // existing auto-shortlist behavior
}
```

This is the **only change** required in pre-Phase-5 code. Minimal blast radius.

## 9. Emails

Two new templates:

### 9.1 `sendCodingTestInvite` — to candidate when HR clicks Send coding test

Subject: **Your coding challenge is ready — {techStack}**

Body covered in §4.2 step 7.

### 9.2 `sendCodingSubmissionReceived` — to HR after candidate submits

Subject: **Coding submission received — {candidate.name}**

> {candidate.name} submitted their coding test ({problemCount} problem(s), language(s) used: {langs}). Test cases passed: **{passedTotal}/{totalTotal}**.
>
> Review here: **{adminUrl}/candidates/{candidate.id}**

The Shortlist / Reject decisions reuse the existing Round 1 outcome templates from Phase 2 (`sendRound1Shortlisted`, `sendRound1Rejected`). No new templates needed there — content already covers messaging.

## 10. Edge cases

| Case | Handling |
|---|---|
| Candidate submits with empty editor for one problem | Submission recorded; test cases run against empty code (will fail). HR sees 0/N passed. |
| Candidate's token expires mid-test | Same as MCQ: auto-submits current state on next interaction or shows expired card. |
| Candidate refreshes mid-test | State persists via localStorage (per-problem code + selected language + tabSwitches). Timer resumes from server-stored `firstOpenedAt`. |
| Candidate opens link, never submits | After `expiresAt`, `codingTest.outcome` stays `null`/`pending_review`. HR can manually reject via existing flow. |
| Candidate submits the same coding-test token twice | Second POST rejected with `E_ALREADY_SUBMITTED`. |
| HR clicks Shortlist before all problems are rated | Button disabled; tooltip explains. |
| Piston completely down | Submission still stores code; `runs[].error = 'piston unavailable'`, `passedCount = 0`. HR clicks Re-run all later. |
| AI generation fails (starter code or full problem) | Frontend shows error toast; HR proceeds manually. Bank stays unchanged. |
| Problem soft-deleted after being sampled | `candidate.codingTest.problems` still resolves (soft-delete only flips `isActive`). HR sees problem normally during review. |
| HR regenerates coding test | Old `CodingSubmission` records remain (audit). New token issued. `submittedAt` reset to null. |
| Candidate switches language on non-empty editor | Confirmation modal warns of code replacement. Explicit opt-in. |
| Tab-switch counter desynced (refresh, network blip) | Best-effort; server stores whatever value the candidate submits. Slight under-count acceptable. |
| Candidate manually retypes content from another tab | Tab-switch count + tab durations are the signal HR uses. Cannot prevent retyping. |

## 11. Rollout & migration

- **Purely additive** to existing schemas. No breaking changes.
- **One MCQ-flow tweak** (the auto-shortlist suppression check in §8.3). Easy to revert.
- **New environment variables:** none. Piston public API requires no key. URL hardcoded in config.
- **New backend dependencies:** none — built-in `fetch` for Piston calls.
- **New frontend dependencies:** `@monaco-editor/react` (loads Monaco on demand).
- **Existing candidates unaffected** — no `codingTest` sub-doc, no `CodingSubmission` records, no new UI panels render for them.
- **No data migration** required.

## 12. Testing

Mirrors existing patterns under `backend/tests/unit/`:

- `codingProblemService.test.js` — CRUD, soft-delete behavior, sampling by stack/difficulty, `timesUsed` increment.
- `codingProblemAiService.test.js` — prompt builders, JSON validation of full-problem output, fallback chain behavior (`aiService` mocked).
- `codingExecutionService.test.js` — `runOne` Piston call shape (mocked `fetch`), `runAllTestCases` aggregation, error path when Piston returns 5xx.
- `codingSubmissionService.test.js` — submit happy path, duplicate-submission guard, rate-by-HR guards, shortlist/reject flow.
- Extension to existing `submissionService.test.js` — verify MCQ auto-shortlist is suppressed when `candidate.codingTest.outcome === 'pending_review'`.

E2E manual:
1. Create one coding problem manually + one via "AI generate full problem". Confirm both end up in the bank with correct `source`.
2. Create a candidate → approve resume → click **Send coding test** with a tech stack that has < N problems in the bank. Confirm AI fills the gap and new problems get persisted.
3. Open the candidate's `/coding-test/<token>` link in incognito → confirm anti-cheat (paste blocked, context menu blocked, tab-switch warns). Submit code that passes 3/4 cases.
4. On HR side: confirm notification email arrives. Open candidate detail → Coding Test panel renders with results → rate each problem → click **Shortlist** → confirm status flips and outcome email fires.
5. Repeat with **both** MCQ + coding sent: submit MCQ first, verify no auto-shortlist email fires. Submit coding, verify HR can then shortlist manually and the email fires once.
6. Force Piston unavailability (block egress) and submit — verify graceful degradation: HR sees the error and re-run button works once Piston is back.

## 13. Out of scope (deferred)

- Function-call test cases (we use stdin/stdout uniformly). Function-call would need per-language harness code per problem — defer until needed.
- Languages beyond JS/Python/PHP. Easy to add (Piston supports many); just need starter-code prompt tweaks.
- Submission concurrency: running multiple problems' test cases in parallel via `Promise.all` (saves wall-clock on multi-problem tests). Defer until backend latency is a real complaint.
- Code diff history / candidate editing recording / replay. Would help spot retyped pasted content but is heavy to build.
- IDE features (autocomplete from project context, linting, debugging) — out of scope for a 30-min assessment.
- Plagiarism detection across submissions. Out of scope.
