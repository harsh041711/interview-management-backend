# Prompt Engineering Test (Design)

**Status:** Draft for review
**Date:** 2026-05-14

## 1. Goal

Add a third independent candidate test — alongside the existing MCQ and Coding tests — that evaluates **prompt-engineering skill**. Admin assigns a single prompt scenario (manual library pick OR AI-generated from the candidate's resume + screening data). Candidate writes a prompt for the scenario, can optionally preview the LLM output up to N times, then submits. Backend evaluates the prompt and the produced output across two axes (**rubric** and **output**), each scored 0–50, summing to a total of 0–100. Admin reviews the breakdown and decides Shortlist / Reject like the other tests.

The prompt test is **independent** of MCQ and Coding — admin can send any one, two, or all three. Each test feeds the same downstream Shortlist / Reject decision flow.

## 2. End-to-end flow

```
Admin opens candidate detail
        │
        ├── Pick from Prompt Problem library ─────────────┐
        │                                                  │
        └── Generate with AI (uses candidate context) ─────┤
              (resume text + screening summary +           │
               techStack + experience years)               │
                       │                                   │
                       ▼                                   │
              AI returns tailored PromptProblem            │
              (admin previews & can edit before save)      │
                       │                                   │
                       └──────────────► save (createdFor)──┤
                                                           ▼
                                          Candidate.promptTest set
                                          (token + expiry + problemId + sentAt)
                                                           │
                                                           ▼
                                   Candidate opens /prompt-test/:token
                                                           │
                                                           ▼
                          Scenario + sample input + prompt textarea + "Try it"
                                                           │
                                              ┌────────────┴────────────┐
                                              ▼                         ▼
                                 ▶ Run preview (≤5 times)        Submit prompt
                                  AI executes → shows output            │
                                  (rate-limited)                        │
                                                                        ▼
                                                       PromptSubmission saved
                                                                        │
                                                                        ▼
                                                       Async AI evaluation pipeline:
                                                        1) Score prompt vs rubric (0–50)
                                                        2) Execute prompt with sample input
                                                        3) Score output vs criteria (0–50)
                                                                        │
                                                                        ▼
                                                       PromptSubmission.evaluation populated
                                                                        │
                                                                        ▼
                                                       Admin notification email fires
                                                                        │
                                                                        ▼
                                          Admin reviews on Candidate detail → Prompt Test panel
                                          Total + rubric breakdown + execution output + criteria check
                                                                        │
                                                                        ▼
                                                       [Shortlist] / [Reject]
```

## 3. PromptProblem entity

### 3.1 Mongoose model

```js
{
  title:                  String  (required, ≤200),
  description:            String  (required, ≤4000)   // the scenario
  sampleInput:            String  (required, ≤4000),  // the text the prompt will be applied to
  expectedOutputCriteria: [String] (required, 1–10 items, each ≤300),
  customRubricCriteria:   [String] (optional, 0–5 items, each ≤200),
  difficulty:             enum('easy','medium','hard')  (default 'medium'),
  tags:                   [String] (optional),
  durationMinutes:        Number  (default 20, range 5–120),
  source:                 enum('manual','ai-personalized')  (required),
  createdFor:             ObjectId(Candidate) | null,    // set when source='ai-personalized'; excluded from library list
  createdBy:              ObjectId(Admin)  (required),
  timestamps:             true,
}
```

### 3.2 Library listing rules

- `GET /api/v1/prompt-problems` — returns only `createdFor: null` (i.e., reusable problems). Filterable by difficulty, tags, search.
- Personalized problems (`createdFor: <candidateId>`) are accessible via the candidate's submission, not from the library page.

## 4. PromptSubmission entity

One submission per (candidate, problem) — there is exactly one prompt problem per candidate assignment (single-scenario test).

### 4.1 Mongoose model

```js
{
  candidate:        ObjectId(Candidate)   (required, indexed),
  promptProblem:    ObjectId(PromptProblem) (required),
  accessToken:      String                (required, unique, indexed),     // signed with TEST_TOKEN_SECRET
  assignedAt:       Date                  (required),
  expiresAt:        Date                  (required),
  firstOpenedAt:    Date                  (default null),
  submittedAt:      Date                  (default null),

  candidatePrompt:  String                (≤8000, default ''),

  previewRunsUsed:  Number                (default 0, max 5),
  lastPreviewOutput: String               (≤4000, default null),   // UI memory of last preview
  lastPreviewAt:    Date                  (default null),

  status: enum('assigned','in_progress','submitted','evaluating','evaluated','evaluation_failed')
          (default 'assigned'),

  evaluation: {
    rubricScore:      Number  (0–50),
    rubricBreakdown:  [{
      criterion: String,
      score:     Number (0–5),    // each rubric item scored 0–5; rubricScore = (sum / maxSum) * 50
      notes:     String,
    }],
    outputScore:      Number  (0–50),
    outputBreakdown:  [{
      criterion: String,
      pass:      Boolean,
      notes:     String,
    }],
    executionOutput:  String  (≤4000),   // what the LLM produced when running the candidate's prompt
    totalScore:       Number  (0–100),   // rubricScore + outputScore
    aiNotes:          String  (≤2000),
    evaluatedAt:      Date,
    aiProviderUsed:   String,             // e.g. "gemini-2.5-flash" or "groq-llama-3.3-70b"
  },

  timestamps: true,
}
```

### 4.2 Status transitions

```
assigned          ── candidate first opens link ──→ in_progress
in_progress       ── candidate submits ─────────→ submitted
submitted         ── evaluator picks up ────────→ evaluating
evaluating        ── AI returns successfully ───→ evaluated
evaluating        ── AI fails after retries ───→ evaluation_failed
```

Admin may manually re-trigger evaluation on `evaluation_failed` (idempotent — re-runs the pipeline, overwrites `evaluation`).

## 5. Candidate.promptTest sub-doc (mirror of `Candidate.codingTest`)

Added to `Candidate` model:

```js
promptTest: {
  token:           String   (default null),
  expiresAt:       Date     (default null),
  problemId:       ObjectId(PromptProblem) (default null),
  durationMinutes: Number   (default null),
  sentAt:          Date     (default null),
  firstOpenedAt:   Date     (default null),
  submittedAt:     Date     (default null),
  reviewedAt:      Date     (default null),
  outcome:         enum('pending_review','shortlisted','rejected', null) (default null),
}
```

Lifecycle and meaning of fields mirrors `codingTest` exactly. `outcome` ties back into the shared shortlist/reject flow.

## 6. AI generation service (`promptProblemAiService`)

### 6.1 Public function

```js
generatePersonalizedPromptProblem({ candidateId, topicOverride, difficultyOverride })
   → { title, description, sampleInput, expectedOutputCriteria,
       customRubricCriteria, difficulty, tags, durationMinutes }
```

### 6.2 Personalization signal

Built from `Candidate` model fields (already populated by resume-screening):

| Source                          | Used as                                              |
|---------------------------------|------------------------------------------------------|
| `candidate.name`                | Persona reference (rarely used in scenario)          |
| `candidate.techStack`           | Stack the scenario should target                     |
| `candidate.experience`          | Sets difficulty floor (entry → easy/medium, senior → medium/hard) |
| `candidate.screening.summary`   | Short narrative — calibrates depth                   |
| `candidate.screening.greenFlags`| Strengths the scenario can lean into                 |
| `candidate.screening.redFlags`  | Weaknesses the scenario can probe                    |
| `candidate.screening.resumeText`| Raw resume text excerpt (≤2000 chars) for grounding  |
| `topicOverride` (optional)      | Admin can pin a topic (e.g., "error-log triage")     |
| `difficultyOverride` (optional) | Admin overrides difficulty                           |

### 6.3 AI prompt template

```
You are designing a prompt-engineering interview problem for a specific candidate.

Candidate profile:
- Experience level: <entry|mid|senior>
- Tech stack: <comma-separated>
- Screening summary: <summary>
- Strengths: <greenFlags joined with semicolons>
- Gaps to probe: <redFlags joined with semicolons>
- Resume excerpt: <first ~2000 chars of resumeText>

Constraints:
- Difficulty: <override or matched to experience>
- Topic (if specified): <topicOverride or "candidate's strongest area">
- Duration: 15–20 minutes

Generate ONE prompt-engineering scenario. The candidate will be given the
scenario + a sample input and asked to write a prompt that, when run against
the sample input, produces the expected output. The scenario should be
realistic for their experience level and target their stack.

Output ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{
  "title": "<short>",
  "description": "<2–4 sentences describing the task>",
  "sampleInput": "<the actual text/data the prompt will be applied to — be concrete>",
  "expectedOutputCriteria": [
    "<criterion 1 — what the LLM output must contain or do>",
    "<criterion 2>",
    "<criterion 3>"
  ],
  "customRubricCriteria": [
    "<criterion specific to this scenario, on top of the default rubric>"
  ],
  "difficulty": "<easy|medium|hard>",
  "tags": ["<tag1>","<tag2>"],
  "durationMinutes": 20
}
```

### 6.4 Provider chain

Reuses `aiService.askWithFallback()`:
1. gemini-2.5-flash → 2.5-flash-lite → 2.0-flash → 2.0-flash-lite
2. groq-llama-3.3-70b-versatile → groq-llama-3.1-8b-instant

If all fail, returns null and the admin sees a clear error message with a "Retry" button. Manual authoring remains available as a fallback.

## 7. AI evaluation service (`promptEvaluationService`)

### 7.1 Public function

```js
evaluate(submissionId)
   → updates PromptSubmission.evaluation, sets status to 'evaluated' or 'evaluation_failed'
```

### 7.2 Three-step pipeline

**Step 1 — Rubric scoring (prompt-craft, 0–50)**

Single AI call with a structured rubric request:

```
You are evaluating a candidate's prompt-engineering submission.

Scenario:
<promptProblem.description>

Sample input the prompt will be applied to:
<promptProblem.sampleInput>

Candidate's prompt:
<submission.candidatePrompt>

Score the prompt against this rubric. Each item: 0 = absent, 5 = excellent.

Default rubric:
1. Clarity & specificity
2. Role / context definition
3. Output format specification
4. Examples or constraints provided
5. Edge-case handling

Custom rubric (scenario-specific):
<each entry in promptProblem.customRubricCriteria>

Return ONLY JSON:
{
  "items": [
    { "criterion": "<name>", "score": <0-5>, "notes": "<one sentence>" }
  ]
}
```

`rubricScore = round((sum of scores / (5 * itemCount)) * 50)`.

**Step 2 — Execute candidate's prompt against sample input**

Single AI call where the AI plays the role of the LLM being prompted by the candidate:

```
Treat the user message as an instruction prompt. Apply it to the input
provided. Respond exactly as the instruction asks — do not interpret,
explain, or add commentary unless the instruction explicitly asks for it.

[USER PROMPT]
<submission.candidatePrompt>

[INPUT TO APPLY THE PROMPT TO]
<promptProblem.sampleInput>
```

Store result in `evaluation.executionOutput`.

**Step 3 — Output scoring (0–50)**

```
Given the expected output criteria and the actual LLM output produced by
running the candidate's prompt, judge each criterion as pass or fail.

Expected output criteria:
<each criterion in promptProblem.expectedOutputCriteria>

Actual output:
<executionOutput from step 2>

Return ONLY JSON:
{
  "items": [
    { "criterion": "<name>", "pass": true|false, "notes": "<one sentence>" }
  ]
}
```

`outputScore = round((passCount / criteriaCount) * 50)`.

`totalScore = rubricScore + outputScore`.

### 7.3 Failure handling

- Each step retries once on AI provider error (the existing chain already retries internally).
- If any step still fails, set `status='evaluation_failed'` and populate `aiNotes` with the failure reason. Admin can retry from the UI.
- The three calls run sequentially (not parallel) so output scoring sees the actual execution result.

### 7.4 Trigger mechanism

Evaluation is queued via `setImmediate` from `promptTestService.submit()` — same pattern already used by `reviewService` and the coding-submission notification path. The submit endpoint returns immediately to the candidate after `PromptSubmission.status = 'submitted'`; the background job transitions through `'evaluating'` → `'evaluated' | 'evaluation_failed'`. The admin's review panel shows an "Evaluating…" placeholder while `status === 'evaluating'`.

## 8. Preview ("Try it") flow

Candidate can run their prompt against the sample input up to **5 times** before submitting.

- Endpoint: `POST /api/v1/prompt-test/:token/preview` with `{ prompt }`
- Server-side check: `submission.previewRunsUsed < 5`
- Increments `previewRunsUsed`, stores `lastPreviewOutput`, `lastPreviewAt`
- Reuses the same execution call as Step 2 above
- Rate-limited at the HTTP layer too: `promptPreviewLimiter` — 10 requests/min per IP, on top of the per-test counter

## 9. API endpoints

### 9.1 Admin (JWT required)

| Method | Path                                                          | Purpose                                     |
|--------|---------------------------------------------------------------|---------------------------------------------|
| GET    | `/api/v1/prompt-problems`                                     | List library (excludes `createdFor != null`) |
| POST   | `/api/v1/prompt-problems`                                     | Create manual problem                       |
| GET    | `/api/v1/prompt-problems/:id`                                 | Detail                                      |
| PATCH  | `/api/v1/prompt-problems/:id`                                 | Update                                      |
| DELETE | `/api/v1/prompt-problems/:id`                                 | Soft-delete (only if no submissions)        |
| POST   | `/api/v1/candidates/:id/prompt-test/generate`                 | AI-generate personalized problem (preview, not yet saved) |
| POST   | `/api/v1/candidates/:id/prompt-test/assign`                   | Save problem (if generated) and assign to candidate |
| POST   | `/api/v1/candidates/:id/prompt-test/reevaluate`               | Manually re-run evaluation pipeline         |
| GET    | `/api/v1/candidates/:id/prompt-test/submission`               | Get submission detail with evaluation       |

### 9.2 Public (token-based)

| Method | Path                                              | Purpose                                                  |
|--------|---------------------------------------------------|----------------------------------------------------------|
| GET    | `/api/v1/prompt-test/:token`                      | Fetch scenario + sample input + remaining preview runs   |
| POST   | `/api/v1/prompt-test/:token/preview`              | Run prompt against sample (rate-limited, ≤5/test)        |
| POST   | `/api/v1/prompt-test/:token/submit`               | Final submit — locks the test, queues async evaluation   |

All public endpoints validate token signature (`TEST_TOKEN_SECRET`), expiry, and submission state.

## 10. Frontend

### 10.1 New pages / sections

| Page                                                          | Purpose                                          |
|---------------------------------------------------------------|--------------------------------------------------|
| `/prompt-problems` (admin)                                    | Library list + create + edit (manual only)       |
| `/prompt-problems/:id` (admin)                                | View / edit one problem                          |
| Candidate detail → **Assign Prompt Test** dropdown            | Pick from library  /  Generate with AI           |
| Candidate detail → **Prompt Test panel** (after submission)   | Read-only view: prompt + output + breakdown + score |
| `/prompt-test/:token` (public, candidate)                     | Scenario + sample input + textarea + Try it + Submit |

### 10.2 Assign flow UI

Dropdown from a single "Assign Prompt Test" button on the candidate detail page:

- **Pick from library** → opens modal with searchable problem list → "Assign"
- **Generate with AI** → opens modal with optional fields (topic override, difficulty override) → "Generate" → AI preview with all fields editable → "Save & Assign"

### 10.3 Candidate test page

```
┌──────────────────────────────────────────────────────────────┐
│  Scenario: <title>                                Timer 19:43 │
│  ──────────────────────────────────────────────────────────── │
│  <description>                                                 │
│                                                                │
│  Sample input:                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ <readonly sampleInput>                                 │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  Your prompt:                                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ <textarea, ≤8000 chars>                                │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  [▶ Try it (3 of 5 left)]                  [Submit & Finish]  │
│                                                                │
│  Last preview output:                                          │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ <readonly executionOutput>                             │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 10.4 Admin review panel

```
Prompt Test                                       Total: 82 / 100
─────────────────────────────────────────────────────────────────
Problem: <title>            Submitted: 14 May 2026, 10:48
Difficulty: medium          Duration used: 16m 12s

Candidate's prompt:
<readonly text>

Execution output (LLM ran the candidate's prompt against the sample):
<readonly text>

Rubric (prompt craft)                                       42/50
  Clarity & specificity ............ 5/5  "Strong, unambiguous"
  Role / context definition ........ 4/5  "Implicit role only"
  Output format specification ...... 5/5
  Examples or constraints .......... 3/5  "No examples given"
  Edge-case handling ............... 4/5
  [custom] JSON keys spelled exactly 5/5

Output (against expected criteria)                          40/50
  ✓ Extracts customer name           "Got 'Alice Chen' correctly"
  ✓ Identifies sentiment             "Negative — correct"
  ✗ Returns JSON with required keys  "Used 'sentiment' but expected 'mood'"
  ✓ Lists 2+ action items

AI notes:
<short paragraph>

[Re-run evaluation]            [Shortlist]    [Reject]
```

## 11. Email notifications

Reuses existing email infrastructure (`emailService`):

| Trigger                                  | To           | Template                                  |
|------------------------------------------|--------------|-------------------------------------------|
| Admin assigns prompt test to candidate   | Candidate    | `promptTestAssignedCandidate` — link + duration + expiry |
| Candidate submits                        | HR           | `promptTestSubmittedHr` — link to review  |
| Evaluation fails (after retries)         | HR           | `promptTestEvaluationFailedHr` — "manual retry needed" |

Subject templates follow existing `emailService` style.

## 12. Rate limiting & safety

| Limit                                  | Value             | Where           |
|----------------------------------------|-------------------|-----------------|
| Preview runs per test                  | 5 total           | `PromptSubmission.previewRunsUsed` check |
| Preview HTTP rate                      | 10 / minute / IP  | `promptPreviewLimiter` (mirrors `codingRunLimiter`) |
| AI evaluation request timeout          | 15s (existing)    | `AI_REQUEST_TIMEOUT_MS` env, reused      |
| `candidatePrompt` length               | ≤8000 chars       | Validator                                |
| `sampleInput` length                   | ≤4000 chars       | Validator                                |
| `executionOutput` length stored         | ≤4000 chars       | Truncated server-side before save        |
| Token expiry                           | Default 60 min from `sentAt` (configurable per problem `durationMinutes`) | Token signing |

## 13. Coexistence with MCQ + Coding

- The candidate detail page exposes three independent "Assign / Send" actions (MCQ, Coding, Prompt). Admin can use any combination.
- Each test's submission/outcome is stored independently. The Shortlist / Reject buttons remain a single decision affecting `candidate.status` — admin makes the call after reviewing whichever tests they sent.
- The auto-shortlist suppression rule that already exists between MCQ and Coding extends to Prompt: if **any** of (coding, prompt) is pending or not yet reviewed, the MCQ's auto-shortlist is suppressed and admin makes the final call manually.

## 14. Testing strategy

### 14.1 Unit tests

- `promptProblemAiService.generatePersonalizedPromptProblem` — mock `aiService.askWithFallback`, verify candidate context is included in the prompt, verify JSON parse + validation, verify fallback to null on all-providers-fail.
- `promptEvaluationService.evaluate` — mock the three AI calls, verify pipeline ordering, scoring math, and status transitions on success and on each failure point.
- `promptTestService.assign` — manual problem path + AI-generated path; verifies token signing, candidate sub-doc update, email queue.
- `promptTestService.preview` — rate-limit enforcement; counter increments.
- `promptTestService.submit` — locks the test, queues evaluation, updates statuses.
- Token validation — expired, tampered, missing.

### 14.2 Integration tests

- End-to-end: admin assigns → candidate fetches → preview → submit → evaluation runs → admin sees populated panel.
- AI providers fully mocked for deterministic results.

## 15. Out of scope (future)

- Multi-scenario prompt tests (could be added by extending the assign flow to pick N problems and storing N submissions).
- Streaming preview output (current pattern: send full response after AI completes).
- Re-using a personalized problem (`createdFor`) for a second candidate — they remain candidate-specific.
- Letting candidates iterate on the preview output as conversation turns (chat-style) — current scope is single-prompt single-output.
- HR-defined rubric weighting (e.g., output worth 70% instead of 50%) — current scope is fixed 50/50.

## 16. Files touched (preview)

### 16.1 Backend (new)

- `backend/src/models/PromptProblem.js`
- `backend/src/models/PromptSubmission.js`
- `backend/src/repositories/promptProblemRepository.js`
- `backend/src/repositories/promptSubmissionRepository.js`
- `backend/src/services/promptProblemAiService.js`
- `backend/src/services/promptEvaluationService.js`
- `backend/src/services/promptTestService.js`
- `backend/src/controllers/promptProblemController.js`
- `backend/src/controllers/promptTestAdminController.js`
- `backend/src/controllers/promptTestPublicController.js`
- `backend/src/routes/promptProblemRoutes.js`
- `backend/src/routes/promptTestAdminRoutes.js`
- `backend/src/routes/promptTestPublicRoutes.js`
- `backend/src/validators/promptProblemValidator.js`
- `backend/src/validators/promptTestValidator.js`
- `backend/src/templates/promptTestAssignedCandidateEmail.js`
- `backend/src/templates/promptTestSubmittedHrEmail.js`
- `backend/src/templates/promptTestEvaluationFailedHrEmail.js`

### 16.2 Backend (modified)

- `backend/src/models/Candidate.js` — add `promptTest` sub-doc
- `backend/src/middlewares/rateLimiter.js` — add `promptPreviewLimiter`
- `backend/src/services/emailService.js` — add three new send-functions
- `backend/src/app.js` — register new routers
- `backend/src/utils/constants.js` — add prompt-test status/source enums

### 16.3 Frontend (new)

- `frontend/src/features/promptProblems/PromptProblemsPage.jsx`
- `frontend/src/features/promptProblems/PromptProblemForm.jsx`
- `frontend/src/features/promptProblems/promptProblemSlice.js`
- `frontend/src/features/promptProblems/promptProblemApi.js`
- `frontend/src/features/promptTest/AssignPromptTestModal.jsx`
- `frontend/src/features/promptTest/PromptTestPage.jsx` (candidate)
- `frontend/src/features/promptTest/PromptTestReviewPanel.jsx` (admin)
- `frontend/src/features/promptTest/promptTestSlice.js`
- `frontend/src/api/promptTestApi.js`

### 16.4 Frontend (modified)

- `frontend/src/features/candidates/CandidateDetailPage.jsx` — wire Prompt Test panel + assign actions
- `frontend/src/routes/AppRoutes.jsx` — add `/prompt-problems`, `/prompt-test/:token`
- `frontend/src/store.js` — register new slices
- `frontend/src/features/dashboard/DashboardPage.jsx` — add "Prompt Tests" stat tile (optional)

## 17. Open questions

None — all major decisions locked during brainstorming:
- Third independent test ✓
- Single scenario per test ✓
- Scenario shape: description + sample input + expected output criteria + (optional) custom rubric ✓
- Evaluation = rubric (0–50) + output check (0–50) ✓
- Run preview button, 5 runs max ✓
- Default rubric + admin can add custom criteria per scenario ✓
- AI generation is candidate-personalized only (manual path covers library-style authoring) ✓
- Marks fixed at 50/50, total 100 ✓
