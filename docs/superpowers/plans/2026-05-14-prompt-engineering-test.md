# Prompt Engineering Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third independent candidate test — prompt engineering — alongside MCQ and Coding. Admin assigns a single scenario (manual library pick OR AI-generated from the candidate's resume + screening data). Candidate writes a prompt, previews up to 5 times, submits. Backend evaluates via a 3-step AI pipeline (rubric → execute → output check) and stores a breakdown. Admin reviews and Shortlists/Rejects like the other tests.

**Architecture:** Two new collections (`PromptProblem`, `PromptSubmission`) + a `Candidate.promptTest` sub-doc (mirrors `codingTest`). Three new backend services: `promptProblemAiService` (personalized generation), `promptEvaluationService` (3-step AI pipeline), `promptTestService` (orchestration). Reuses existing `aiService.askWithFallback()` Gemini→Groq chain, existing token signing (`TEST_TOKEN_SECRET`), existing email infrastructure, existing rate-limiter pattern. Frontend adds an admin Prompt Problems page, an `AssignPromptTestModal`, a public `/prompt-test/:token` candidate page, and an admin review panel.

**Tech Stack:** Node.js, Express, Mongoose, Joi, Jest. React + Redux Toolkit, Vite, SCSS. No new third-party packages.

**Spec reference:** [`docs/superpowers/specs/2026-05-14-prompt-engineering-test-design.md`](../specs/2026-05-14-prompt-engineering-test-design.md)

---

## File structure

### Backend — new files
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
- `backend/tests/unit/promptProblemAiService.test.js`
- `backend/tests/unit/promptEvaluationService.test.js`
- `backend/tests/unit/promptTestService.test.js`

### Backend — modified files
- `backend/src/models/Candidate.js` — add `promptTest` sub-doc
- `backend/src/middlewares/rateLimiter.js` — add `promptPreviewLimiter`
- `backend/src/services/emailService.js` — add three new sender functions
- `backend/src/app.js` — register three new routers
- `backend/src/utils/constants.js` — add `PROMPT_SUBMISSION_STATUS`, `PROMPT_PROBLEM_SOURCE`

### Frontend — new files
- `frontend/src/api/promptProblemApi.js`
- `frontend/src/api/promptTestApi.js`
- `frontend/src/features/promptProblems/PromptProblemsPage.jsx`
- `frontend/src/features/promptProblems/PromptProblemsPage.scss`
- `frontend/src/features/promptProblems/PromptProblemForm.jsx`
- `frontend/src/features/promptProblems/promptProblemSlice.js`
- `frontend/src/features/promptTest/AssignPromptTestModal.jsx`
- `frontend/src/features/promptTest/AssignPromptTestModal.scss`
- `frontend/src/features/promptTest/PromptTestPage.jsx`
- `frontend/src/features/promptTest/PromptTestPage.scss`
- `frontend/src/features/promptTest/PromptTestReviewPanel.jsx`
- `frontend/src/features/promptTest/PromptTestReviewPanel.scss`
- `frontend/src/features/promptTest/promptTestSlice.js`

### Frontend — modified files
- `frontend/src/features/candidates/CandidateDetailPage.jsx` — wire panel + assign actions
- `frontend/src/routes/AppRoutes.jsx` — add `/prompt-problems` and `/prompt-test/:token`
- `frontend/src/store.js` (or wherever the slice registry lives) — register `promptProblems` + `promptTest` slices
- `frontend/src/components/Sidebar.jsx` (or analogous nav) — add "Prompt Problems" admin link

### Docs (modified)
- `docs/FEATURES.md` — add prompt-test section
- `frontend/docs/FEATURES.md` — sync copy

---

## Task 1: Constants + `Candidate.promptTest` sub-doc

**Files:**
- Modify: `backend/src/utils/constants.js`
- Modify: `backend/src/models/Candidate.js`

- [ ] **Step 1: Add prompt-test enums to constants**

In `backend/src/utils/constants.js`, append:

```js
const PROMPT_SUBMISSION_STATUS = Object.freeze({
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  EVALUATING: 'evaluating',
  EVALUATED: 'evaluated',
  EVALUATION_FAILED: 'evaluation_failed',
});
const PROMPT_SUBMISSION_STATUS_LIST = Object.values(PROMPT_SUBMISSION_STATUS);

const PROMPT_PROBLEM_SOURCE = Object.freeze({
  MANUAL: 'manual',
  AI_PERSONALIZED: 'ai-personalized',
});
const PROMPT_PROBLEM_SOURCE_LIST = Object.values(PROMPT_PROBLEM_SOURCE);

module.exports = {
  ...module.exports,
  PROMPT_SUBMISSION_STATUS, PROMPT_SUBMISSION_STATUS_LIST,
  PROMPT_PROBLEM_SOURCE, PROMPT_PROBLEM_SOURCE_LIST,
};
```

(Adjust the export merge to whatever the existing file uses — read it first.)

- [ ] **Step 2: Add `promptTest` sub-doc to `Candidate`**

In `backend/src/models/Candidate.js`, add inside the schema after the `codingTest` block:

```js
promptTest: {
  token:           { type: String, default: null },
  expiresAt:       { type: Date, default: null },
  problemId:       { type: mongoose.Schema.Types.ObjectId, ref: 'PromptProblem', default: null },
  durationMinutes: { type: Number, default: null, min: 1, max: 240 },
  sentAt:          { type: Date, default: null },
  firstOpenedAt:   { type: Date, default: null },
  submittedAt:     { type: Date, default: null },
  reviewedAt:      { type: Date, default: null },
  outcome: {
    type: String,
    enum: ['pending_review', 'shortlisted', 'rejected', null],
    default: null,
  },
},
```

- [ ] **Step 3: Verify model loads**

Run: `cd backend && node -e "require('./src/models/Candidate'); console.log('ok')"`
Expected: `ok` printed, no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/utils/constants.js backend/src/models/Candidate.js
git commit -m "feat(prompt-test): add status/source constants and Candidate.promptTest sub-doc"
```

---

## Task 2: `PromptProblem` model + repository

**Files:**
- Create: `backend/src/models/PromptProblem.js`
- Create: `backend/src/repositories/promptProblemRepository.js`

- [ ] **Step 1: Write the model**

Create `backend/src/models/PromptProblem.js`:

```js
'use strict';
const mongoose = require('mongoose');
const { PROMPT_PROBLEM_SOURCE_LIST } = require('../utils/constants');

const promptProblemSchema = new mongoose.Schema(
  {
    title:                  { type: String, required: true, maxlength: 200, trim: true },
    description:            { type: String, required: true, maxlength: 4000 },
    sampleInput:            { type: String, required: true, maxlength: 4000 },
    expectedOutputCriteria: {
      type: [{ type: String, maxlength: 300 }],
      validate: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 10,
    },
    customRubricCriteria: {
      type: [{ type: String, maxlength: 200 }],
      default: [],
      validate: (v) => Array.isArray(v) && v.length <= 5,
    },
    difficulty:      { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
    tags:            { type: [String], default: [] },
    durationMinutes: { type: Number, default: 20, min: 5, max: 120 },
    source:          { type: String, enum: PROMPT_PROBLEM_SOURCE_LIST, required: true },
    createdFor:      { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', default: null, index: true },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret) => { delete ret.__v; return ret; } },
  },
);

promptProblemSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PromptProblem', promptProblemSchema);
```

- [ ] **Step 2: Write the repository**

Create `backend/src/repositories/promptProblemRepository.js`:

```js
'use strict';
const PromptProblem = require('../models/PromptProblem');

const create = (data) => PromptProblem.create(data);
const findById = (id) => PromptProblem.findById(id);

// Library list excludes candidate-specific problems
const listLibrary = async ({ page = 1, limit = 20, difficulty, q } = {}) => {
  const filter = { createdFor: null };
  if (difficulty) filter.difficulty = difficulty;
  if (q) filter.title = { $regex: q, $options: 'i' };
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    PromptProblem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PromptProblem.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const updateById = (id, patch) => PromptProblem.findByIdAndUpdate(id, patch, { new: true });
const deleteById = (id) => PromptProblem.findByIdAndDelete(id);

module.exports = { create, findById, listLibrary, updateById, deleteById };
```

- [ ] **Step 3: Verify**

Run: `cd backend && node -e "const m=require('./src/models/PromptProblem'); const r=require('./src/repositories/promptProblemRepository'); console.log('model:', !!m, 'repo keys:', Object.keys(r).join(','));"`
Expected: `model: true repo keys: create,findById,listLibrary,updateById,deleteById`

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/PromptProblem.js backend/src/repositories/promptProblemRepository.js
git commit -m "feat(prompt-test): add PromptProblem model and repository"
```

---

## Task 3: `PromptSubmission` model + repository

**Files:**
- Create: `backend/src/models/PromptSubmission.js`
- Create: `backend/src/repositories/promptSubmissionRepository.js`

- [ ] **Step 1: Write the model**

Create `backend/src/models/PromptSubmission.js`:

```js
'use strict';
const mongoose = require('mongoose');
const { PROMPT_SUBMISSION_STATUS, PROMPT_SUBMISSION_STATUS_LIST } = require('../utils/constants');

const breakdownRubricSchema = new mongoose.Schema(
  { criterion: String, score: { type: Number, min: 0, max: 5 }, notes: String },
  { _id: false },
);
const breakdownOutputSchema = new mongoose.Schema(
  { criterion: String, pass: Boolean, notes: String },
  { _id: false },
);

const promptSubmissionSchema = new mongoose.Schema(
  {
    candidate:        { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    promptProblem:    { type: mongoose.Schema.Types.ObjectId, ref: 'PromptProblem', required: true },
    accessToken:      { type: String, required: true, unique: true, index: true },
    assignedAt:       { type: Date, required: true },
    expiresAt:        { type: Date, required: true },
    firstOpenedAt:    { type: Date, default: null },
    submittedAt:      { type: Date, default: null },
    candidatePrompt:  { type: String, default: '', maxlength: 8000 },
    previewRunsUsed:  { type: Number, default: 0, min: 0, max: 5 },
    lastPreviewOutput:{ type: String, default: null, maxlength: 4000 },
    lastPreviewAt:    { type: Date, default: null },
    status: {
      type: String,
      enum: PROMPT_SUBMISSION_STATUS_LIST,
      default: PROMPT_SUBMISSION_STATUS.ASSIGNED,
      index: true,
    },
    evaluation: {
      rubricScore:     { type: Number, min: 0, max: 50 },
      rubricBreakdown: { type: [breakdownRubricSchema], default: undefined },
      outputScore:     { type: Number, min: 0, max: 50 },
      outputBreakdown: { type: [breakdownOutputSchema], default: undefined },
      executionOutput: { type: String, maxlength: 4000 },
      totalScore:      { type: Number, min: 0, max: 100 },
      aiNotes:         { type: String, maxlength: 2000 },
      evaluatedAt:     Date,
      aiProviderUsed:  String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret) => { delete ret.__v; return ret; } },
  },
);

promptSubmissionSchema.index({ candidate: 1, createdAt: -1 });

module.exports = mongoose.model('PromptSubmission', promptSubmissionSchema);
```

- [ ] **Step 2: Write the repository**

Create `backend/src/repositories/promptSubmissionRepository.js`:

```js
'use strict';
const PromptSubmission = require('../models/PromptSubmission');

const create = (data) => PromptSubmission.create(data);
const findById = (id) => PromptSubmission.findById(id).populate('promptProblem');
const findByToken = (token) => PromptSubmission.findOne({ accessToken: token }).populate('promptProblem');
const findByCandidate = (candidateId) =>
  PromptSubmission.findOne({ candidate: candidateId }).sort({ createdAt: -1 }).populate('promptProblem');
const updateById = (id, patch) => PromptSubmission.findByIdAndUpdate(id, patch, { new: true });
const incrementPreviewRuns = (id, output) =>
  PromptSubmission.findByIdAndUpdate(
    id,
    { $inc: { previewRunsUsed: 1 }, $set: { lastPreviewOutput: output, lastPreviewAt: new Date() } },
    { new: true },
  );

module.exports = { create, findById, findByToken, findByCandidate, updateById, incrementPreviewRuns };
```

- [ ] **Step 3: Verify**

Run: `cd backend && node -e "const m=require('./src/models/PromptSubmission'); const r=require('./src/repositories/promptSubmissionRepository'); console.log('model:', !!m, 'repo keys:', Object.keys(r).join(','));"`
Expected: `model: true repo keys: create,findById,findByToken,findByCandidate,updateById,incrementPreviewRuns`

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/PromptSubmission.js backend/src/repositories/promptSubmissionRepository.js
git commit -m "feat(prompt-test): add PromptSubmission model and repository"
```

---

## Task 4: `promptProblemAiService` — personalized generation

**Files:**
- Create: `backend/src/services/promptProblemAiService.js`
- Test: `backend/tests/unit/promptProblemAiService.test.js`

- [ ] **Step 1: Write the test**

Create `backend/tests/unit/promptProblemAiService.test.js`:

```js
const aiService = require('../../src/services/aiService');
jest.mock('../../src/services/aiService');

const svc = require('../../src/services/promptProblemAiService');

describe('promptProblemAiService.generatePersonalizedPromptProblem', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed JSON when AI succeeds', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({
        title: 'T', description: 'D', sampleInput: 'I',
        expectedOutputCriteria: ['c1'], customRubricCriteria: ['r1'],
        difficulty: 'medium', tags: ['x'], durationMinutes: 20,
      }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const candidate = {
      name: 'A', techStack: ['Node'], experience: 'mid',
      screening: { summary: 's', greenFlags: [], redFlags: [], resumeText: 'r' },
    };
    const out = await svc.generatePersonalizedPromptProblem({ candidate });
    expect(out.title).toBe('T');
    expect(out.expectedOutputCriteria).toEqual(['c1']);
    expect(out._provider).toBe('gemini');
  });

  test('returns null when AI returns nothing', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const out = await svc.generatePersonalizedPromptProblem({
      candidate: { techStack: ['x'], experience: 'mid', screening: {} },
    });
    expect(out).toBeNull();
  });

  test('strips markdown fences before parsing', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: '```json\n{"title":"T","description":"D","sampleInput":"I","expectedOutputCriteria":["c"],"difficulty":"easy","tags":[],"durationMinutes":15}\n```',
      provider: 'groq', model: 'llama',
    });
    const out = await svc.generatePersonalizedPromptProblem({
      candidate: { techStack: ['x'], experience: 'entry', screening: {} },
    });
    expect(out.title).toBe('T');
  });

  test('passes candidate context into the AI prompt', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    await svc.generatePersonalizedPromptProblem({
      candidate: {
        techStack: ['Node', 'React'], experience: 'senior',
        screening: { summary: 'strong full-stack', greenFlags: ['arch'], redFlags: ['tests'], resumeText: 'Built X' },
      },
    });
    const promptArg = aiService.askWithFallback.mock.calls[0][0];
    expect(promptArg).toContain('Node, React');
    expect(promptArg).toContain('senior');
    expect(promptArg).toContain('strong full-stack');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd backend && npx jest tests/unit/promptProblemAiService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/services/promptProblemAiService.js`:

```js
'use strict';
const aiService = require('./aiService');
const logger = require('../config/logger');

const RESUME_EXCERPT_LIMIT = 2000;

const buildPrompt = ({ candidate, topicOverride, difficultyOverride }) => {
  const sc = candidate.screening || {};
  const resumeExcerpt = (sc.resumeText || '').slice(0, RESUME_EXCERPT_LIMIT);
  const lines = [
    'You are designing a prompt-engineering interview problem for a specific candidate.',
    '',
    'Candidate profile:',
    `- Experience level: ${candidate.experience || 'mid'}`,
    `- Tech stack: ${(candidate.techStack || []).join(', ') || 'unspecified'}`,
    `- Screening summary: ${sc.summary || 'n/a'}`,
    `- Strengths: ${(sc.greenFlags || []).join('; ') || 'n/a'}`,
    `- Gaps to probe: ${(sc.redFlags || []).join('; ') || 'n/a'}`,
    `- Resume excerpt: ${resumeExcerpt || 'n/a'}`,
    '',
    'Constraints:',
    `- Difficulty: ${difficultyOverride || 'matched to experience'}`,
    `- Topic: ${topicOverride || "candidate's strongest area"}`,
    '- Duration: 15-20 minutes',
    '',
    'Generate ONE prompt-engineering scenario. The candidate will be given the scenario',
    '+ a sample input and asked to write a prompt that, when run against the sample input,',
    'produces the expected output. The scenario should be realistic for their experience',
    'level and target their stack.',
    '',
    'Output ONLY valid JSON in this exact shape (no markdown fences, no commentary):',
    '{',
    '  "title": "<short>",',
    '  "description": "<2-4 sentences describing the task>",',
    '  "sampleInput": "<the actual text/data the prompt will be applied to>",',
    '  "expectedOutputCriteria": ["<criterion 1>", "<criterion 2>", "<criterion 3>"],',
    '  "customRubricCriteria": ["<scenario-specific criterion>"],',
    '  "difficulty": "<easy|medium|hard>",',
    '  "tags": ["<tag1>", "<tag2>"],',
    '  "durationMinutes": 20',
    '}',
  ];
  return lines.join('\n');
};

const stripFences = (s) =>
  String(s || '').replace(/^```[a-zA-Z]*\n?/m, '').replace(/```\s*$/m, '').trim();

const generatePersonalizedPromptProblem = async ({ candidate, topicOverride, difficultyOverride } = {}) => {
  const prompt = buildPrompt({ candidate, topicOverride, difficultyOverride });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('AI prompt-problem generation returned nothing');
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err) {
    logger.warn('AI prompt-problem generation: JSON parse failed', { err: err.message });
    return null;
  }
  if (!parsed.title || !parsed.description || !parsed.sampleInput || !Array.isArray(parsed.expectedOutputCriteria)) {
    logger.warn('AI prompt-problem generation: required fields missing');
    return null;
  }
  parsed._provider = provider;
  parsed._model = model;
  logger.info('AI prompt-problem generated', { provider, model });
  return parsed;
};

module.exports = { generatePersonalizedPromptProblem };
```

- [ ] **Step 4: Run test — verify pass**

Run: `cd backend && npx jest tests/unit/promptProblemAiService.test.js`
Expected: PASS, 4/4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/promptProblemAiService.js backend/tests/unit/promptProblemAiService.test.js
git commit -m "feat(prompt-test): add AI generation service for personalized prompt problems"
```

---

## Task 5: `promptEvaluationService` — 3-step pipeline

**Files:**
- Create: `backend/src/services/promptEvaluationService.js`
- Test: `backend/tests/unit/promptEvaluationService.test.js`

- [ ] **Step 1: Write the test**

Create `backend/tests/unit/promptEvaluationService.test.js`:

```js
const aiService = require('../../src/services/aiService');
const promptSubmissionRepository = require('../../src/repositories/promptSubmissionRepository');
jest.mock('../../src/services/aiService');
jest.mock('../../src/repositories/promptSubmissionRepository');

const svc = require('../../src/services/promptEvaluationService');
const { PROMPT_SUBMISSION_STATUS } = require('../../src/utils/constants');

const baseSub = {
  _id: 'sub1', id: 'sub1',
  candidatePrompt: 'Summarize the email:',
  promptProblem: {
    description: 'Summarize support emails',
    sampleInput: 'Hello, my order is late',
    expectedOutputCriteria: ['Identifies subject', 'Suggests next step'],
    customRubricCriteria: ['Uses bullet points'],
  },
  status: PROMPT_SUBMISSION_STATUS.SUBMITTED,
};

describe('promptEvaluationService.evaluate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('happy path: scores rubric, executes, scores output, marks evaluated', async () => {
    promptSubmissionRepository.findById.mockResolvedValue(baseSub);
    aiService.askWithFallback
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [
        { criterion: 'Clarity', score: 5, notes: 'ok' },
        { criterion: 'Role',    score: 4, notes: 'ok' },
        { criterion: 'Format',  score: 3, notes: 'ok' },
        { criterion: 'Examples',score: 2, notes: 'none' },
        { criterion: 'Edge',    score: 4, notes: 'ok' },
        { criterion: 'Uses bullet points', score: 5, notes: 'yes' },
      ]}), provider: 'gemini', model: 'g-2.5' })
      .mockResolvedValueOnce({ text: '- subject: late order\n- next: refund', provider: 'gemini', model: 'g-2.5' })
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [
        { criterion: 'Identifies subject', pass: true, notes: 'yes' },
        { criterion: 'Suggests next step', pass: true, notes: 'yes' },
      ]}), provider: 'gemini', model: 'g-2.5' });
    promptSubmissionRepository.updateById.mockResolvedValue({ ...baseSub, status: PROMPT_SUBMISSION_STATUS.EVALUATED });

    await svc.evaluate('sub1');

    const patch = promptSubmissionRepository.updateById.mock.calls.find((c) =>
      c[1].status === PROMPT_SUBMISSION_STATUS.EVALUATED,
    )[1];
    expect(patch.evaluation.rubricScore).toBeGreaterThan(0);
    expect(patch.evaluation.outputScore).toBe(50);
    expect(patch.evaluation.totalScore).toBe(patch.evaluation.rubricScore + 50);
    expect(patch.evaluation.executionOutput).toContain('subject');
    expect(patch.evaluation.aiProviderUsed).toBe('gemini');
  });

  test('marks evaluation_failed when rubric AI returns nothing', async () => {
    promptSubmissionRepository.findById.mockResolvedValue(baseSub);
    aiService.askWithFallback.mockResolvedValueOnce({ text: null });
    promptSubmissionRepository.updateById.mockResolvedValue(baseSub);

    await svc.evaluate('sub1');

    const failPatch = promptSubmissionRepository.updateById.mock.calls.find((c) =>
      c[1].status === PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
    );
    expect(failPatch).toBeTruthy();
    expect(failPatch[1].evaluation.aiNotes).toMatch(/rubric/i);
  });

  test('counts partial output pass correctly', async () => {
    promptSubmissionRepository.findById.mockResolvedValue(baseSub);
    aiService.askWithFallback
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [{ criterion: 'A', score: 5, notes: '' }]}), provider: 'g', model: 'm' })
      .mockResolvedValueOnce({ text: 'output', provider: 'g', model: 'm' })
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [
        { criterion: 'Identifies subject', pass: true, notes: '' },
        { criterion: 'Suggests next step', pass: false, notes: '' },
      ]}), provider: 'g', model: 'm' });
    promptSubmissionRepository.updateById.mockResolvedValue(baseSub);

    await svc.evaluate('sub1');

    const finalPatch = promptSubmissionRepository.updateById.mock.calls.find((c) =>
      c[1].status === PROMPT_SUBMISSION_STATUS.EVALUATED,
    )[1];
    expect(finalPatch.evaluation.outputScore).toBe(25);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd backend && npx jest tests/unit/promptEvaluationService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/services/promptEvaluationService.js`:

```js
'use strict';
const aiService = require('./aiService');
const promptSubmissionRepository = require('../repositories/promptSubmissionRepository');
const logger = require('../config/logger');
const { PROMPT_SUBMISSION_STATUS } = require('../utils/constants');

const DEFAULT_RUBRIC = [
  'Clarity & specificity',
  'Role / context definition',
  'Output format specification',
  'Examples or constraints provided',
  'Edge-case handling',
];

const stripFences = (s) =>
  String(s || '').replace(/^```[a-zA-Z]*\n?/m, '').replace(/```\s*$/m, '').trim();

const parseJsonSafely = (text) => {
  try { return JSON.parse(stripFences(text)); } catch { return null; }
};

const buildRubricPrompt = ({ problem, candidatePrompt }) => {
  const customRubric = problem.customRubricCriteria || [];
  return [
    "You are evaluating a candidate's prompt-engineering submission.",
    '',
    'Scenario:',
    problem.description,
    '',
    'Sample input the prompt will be applied to:',
    problem.sampleInput,
    '',
    "Candidate's prompt:",
    candidatePrompt,
    '',
    'Score the prompt against this rubric. Each item: 0 = absent, 5 = excellent.',
    '',
    'Default rubric:',
    ...DEFAULT_RUBRIC.map((c, i) => `${i + 1}. ${c}`),
    '',
    customRubric.length ? 'Custom rubric (scenario-specific):' : '',
    ...customRubric.map((c) => `- ${c}`),
    '',
    'Return ONLY JSON: { "items": [{ "criterion": "<name>", "score": <0-5>, "notes": "<one sentence>" }] }',
  ].filter(Boolean).join('\n');
};

const buildExecutionPrompt = ({ problem, candidatePrompt }) => [
  'Treat the user message as an instruction prompt. Apply it to the input provided.',
  'Respond exactly as the instruction asks - do not interpret, explain, or add commentary',
  'unless the instruction explicitly asks for it.',
  '',
  '[USER PROMPT]',
  candidatePrompt,
  '',
  '[INPUT TO APPLY THE PROMPT TO]',
  problem.sampleInput,
].join('\n');

const buildOutputCheckPrompt = ({ problem, executionOutput }) => [
  'Given the expected output criteria and the actual LLM output produced by running the',
  "candidate's prompt, judge each criterion as pass or fail.",
  '',
  'Expected output criteria:',
  ...problem.expectedOutputCriteria.map((c) => `- ${c}`),
  '',
  'Actual output:',
  executionOutput,
  '',
  'Return ONLY JSON: { "items": [{ "criterion": "<name>", "pass": true|false, "notes": "<one sentence>" }] }',
].join('\n');

const evaluate = async (submissionId) => {
  const submission = await promptSubmissionRepository.findById(submissionId);
  if (!submission) {
    logger.warn('promptEvaluationService.evaluate: submission not found', { submissionId });
    return;
  }
  await promptSubmissionRepository.updateById(submissionId, { status: PROMPT_SUBMISSION_STATUS.EVALUATING });

  const problem = submission.promptProblem;
  const candidatePrompt = submission.candidatePrompt || '';
  let providerUsed = null;

  // Step 1: Rubric
  const rubricRes = await aiService.askWithFallback(buildRubricPrompt({ problem, candidatePrompt }));
  if (!rubricRes.text) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { aiNotes: 'Rubric scoring failed: AI returned no output' },
    });
    return;
  }
  const rubricParsed = parseJsonSafely(rubricRes.text);
  if (!rubricParsed || !Array.isArray(rubricParsed.items) || rubricParsed.items.length === 0) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { aiNotes: 'Rubric scoring failed: unparseable response' },
    });
    return;
  }
  providerUsed = `${rubricRes.provider}:${rubricRes.model}`;
  const rubricItems = rubricParsed.items.map((it) => ({
    criterion: String(it.criterion || ''),
    score: Math.max(0, Math.min(5, Number(it.score) || 0)),
    notes: String(it.notes || ''),
  }));
  const rubricSum = rubricItems.reduce((s, it) => s + it.score, 0);
  const rubricScore = Math.round((rubricSum / (5 * rubricItems.length)) * 50);

  // Step 2: Execute
  const execRes = await aiService.askWithFallback(buildExecutionPrompt({ problem, candidatePrompt }));
  if (!execRes.text) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { rubricScore, rubricBreakdown: rubricItems, aiNotes: 'Execution step failed: AI returned no output' },
    });
    return;
  }
  const executionOutput = String(execRes.text).slice(0, 4000);

  // Step 3: Output check
  const checkRes = await aiService.askWithFallback(buildOutputCheckPrompt({ problem, executionOutput }));
  if (!checkRes.text) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { rubricScore, rubricBreakdown: rubricItems, executionOutput, aiNotes: 'Output check failed: AI returned no output' },
    });
    return;
  }
  const checkParsed = parseJsonSafely(checkRes.text);
  if (!checkParsed || !Array.isArray(checkParsed.items) || checkParsed.items.length === 0) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { rubricScore, rubricBreakdown: rubricItems, executionOutput, aiNotes: 'Output check failed: unparseable response' },
    });
    return;
  }
  const outputItems = checkParsed.items.map((it) => ({
    criterion: String(it.criterion || ''),
    pass: !!it.pass,
    notes: String(it.notes || ''),
  }));
  const passCount = outputItems.filter((it) => it.pass).length;
  const outputScore = Math.round((passCount / outputItems.length) * 50);
  const totalScore = rubricScore + outputScore;

  await promptSubmissionRepository.updateById(submissionId, {
    status: PROMPT_SUBMISSION_STATUS.EVALUATED,
    evaluation: {
      rubricScore, rubricBreakdown: rubricItems,
      outputScore, outputBreakdown: outputItems,
      executionOutput, totalScore,
      aiNotes: 'Evaluated successfully',
      evaluatedAt: new Date(),
      aiProviderUsed: providerUsed,
    },
  });
  logger.info('Prompt submission evaluated', { submissionId, totalScore, providerUsed });
};

const runPreview = async ({ problem, candidatePrompt }) => {
  const res = await aiService.askWithFallback(buildExecutionPrompt({ problem, candidatePrompt }));
  if (!res.text) return { output: null, provider: null };
  return { output: String(res.text).slice(0, 4000), provider: `${res.provider}:${res.model}` };
};

module.exports = { evaluate, runPreview, DEFAULT_RUBRIC };
```

- [ ] **Step 4: Run test — verify pass**

Run: `cd backend && npx jest tests/unit/promptEvaluationService.test.js`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/promptEvaluationService.js backend/tests/unit/promptEvaluationService.test.js
git commit -m "feat(prompt-test): add 3-step AI evaluation pipeline (rubric + execute + output check)"
```

---

## Task 6: `promptTestService` — orchestration

**Files:**
- Create: `backend/src/services/promptTestService.js`
- Test: `backend/tests/unit/promptTestService.test.js`

- [ ] **Step 1: Write the test**

Create `backend/tests/unit/promptTestService.test.js`:

```js
jest.mock('../../src/repositories/promptProblemRepository');
jest.mock('../../src/repositories/promptSubmissionRepository');
jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/services/promptEvaluationService');
jest.mock('../../src/services/emailService');
jest.mock('../../src/utils/interviewToken', () => ({
  generateInterviewToken: () => ({ token: 'tok-abc', expiresAt: new Date(Date.now() + 3600000) }),
}));

const problemRepo = require('../../src/repositories/promptProblemRepository');
const subRepo = require('../../src/repositories/promptSubmissionRepository');
const candidateRepo = require('../../src/repositories/candidateRepository');
const evalSvc = require('../../src/services/promptEvaluationService');

const svc = require('../../src/services/promptTestService');
const { PROMPT_SUBMISSION_STATUS } = require('../../src/utils/constants');

describe('promptTestService.assign', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates a submission and updates candidate.promptTest', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1', save: jest.fn(), promptTest: {} });
    problemRepo.findById.mockResolvedValue({ id: 'p1', durationMinutes: 20 });
    subRepo.create.mockResolvedValue({ id: 's1', accessToken: 'tok-abc' });

    const res = await svc.assign({ candidateId: 'c1', problemId: 'p1' });

    expect(subRepo.create).toHaveBeenCalled();
    expect(res.accessToken).toBe('tok-abc');
  });
});

describe('promptTestService.preview', () => {
  test('rejects when previewRunsUsed >= 5', async () => {
    subRepo.findByToken.mockResolvedValue({
      id: 's1', previewRunsUsed: 5,
      promptProblem: { sampleInput: 'in' },
      status: PROMPT_SUBMISSION_STATUS.IN_PROGRESS,
      submittedAt: null,
    });
    await expect(svc.preview({ token: 'x', candidatePrompt: 'p' })).rejects.toThrow(/limit/i);
  });

  test('rejects when already submitted', async () => {
    subRepo.findByToken.mockResolvedValue({
      id: 's1', previewRunsUsed: 0,
      promptProblem: { sampleInput: 'in' },
      submittedAt: new Date(),
    });
    await expect(svc.preview({ token: 'x', candidatePrompt: 'p' })).rejects.toThrow(/submitted/i);
  });

  test('runs preview and increments counter', async () => {
    subRepo.findByToken.mockResolvedValue({
      id: 's1', previewRunsUsed: 1,
      promptProblem: { sampleInput: 'in' },
      submittedAt: null,
    });
    evalSvc.runPreview.mockResolvedValue({ output: 'result', provider: 'g' });
    subRepo.incrementPreviewRuns.mockResolvedValue({});
    const res = await svc.preview({ token: 'x', candidatePrompt: 'p' });
    expect(res.output).toBe('result');
    expect(res.runsRemaining).toBe(3);
  });
});

describe('promptTestService.submit', () => {
  test('locks submission, queues evaluation', async () => {
    const sub = {
      id: 's1', submittedAt: null,
      promptProblem: { sampleInput: 'in' },
    };
    subRepo.findByToken.mockResolvedValue(sub);
    subRepo.updateById.mockResolvedValue({ ...sub, submittedAt: new Date() });
    candidateRepo.findById = jest.fn().mockResolvedValue({ id: 'c1', save: jest.fn(), promptTest: {} });

    await svc.submit({ token: 'x', candidatePrompt: 'final', candidateId: 'c1' });

    expect(subRepo.updateById).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ submittedAt: expect.any(Date), candidatePrompt: 'final' }),
    );
  });

  test('rejects double submit', async () => {
    subRepo.findByToken.mockResolvedValue({ id: 's1', submittedAt: new Date() });
    await expect(svc.submit({ token: 'x', candidatePrompt: 'p' })).rejects.toThrow(/already/i);
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `cd backend && npx jest tests/unit/promptTestService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/services/promptTestService.js`:

```js
'use strict';
const promptProblemRepository = require('../repositories/promptProblemRepository');
const promptSubmissionRepository = require('../repositories/promptSubmissionRepository');
const candidateRepository = require('../repositories/candidateRepository');
const promptEvaluationService = require('./promptEvaluationService');
const promptProblemAiService = require('./promptProblemAiService');
const emailService = require('./emailService');
const { generateInterviewToken } = require('../utils/interviewToken');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { PROMPT_SUBMISSION_STATUS, PROMPT_PROBLEM_SOURCE } = require('../utils/constants');

const PREVIEW_LIMIT = 5;

const assign = async ({ candidateId, problemId, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const problem = await promptProblemRepository.findById(problemId);
  if (!problem) throw ApiError.notFound('Prompt problem not found');

  const { token, expiresAt } = generateInterviewToken({ ttlMinutes: problem.durationMinutes });
  const submission = await promptSubmissionRepository.create({
    candidate: candidateId,
    promptProblem: problemId,
    accessToken: token,
    assignedAt: new Date(),
    expiresAt,
    status: PROMPT_SUBMISSION_STATUS.ASSIGNED,
  });

  candidate.promptTest = {
    token, expiresAt,
    problemId,
    durationMinutes: problem.durationMinutes,
    sentAt: new Date(),
    firstOpenedAt: null,
    submittedAt: null,
    reviewedAt: null,
    outcome: null,
  };
  await candidate.save();

  setImmediate(async () => {
    try {
      await emailService.sendPromptTestAssignedCandidate({ candidate, problem, accessToken: token, expiresAt });
    } catch (err) { logger.error('Prompt-test assigned email failed', { err: err.message }); }
  });

  return { submissionId: submission.id || submission._id, accessToken: token, expiresAt };
};

const generateAndAssign = async ({ candidateId, topicOverride, difficultyOverride, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const generated = await promptProblemAiService.generatePersonalizedPromptProblem({
    candidate, topicOverride, difficultyOverride,
  });
  if (!generated) {
    throw ApiError.badRequest('AI generation failed. Try again or author manually.', { code: 'E_AI_GEN_FAILED' });
  }
  // The admin will review/edit BEFORE save — this method returns the draft without persisting.
  // Persisting + assigning is done by saveGeneratedAndAssign below after admin clicks Save.
  return { draft: generated };
};

const saveGeneratedAndAssign = async ({ candidateId, draft, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');

  const problem = await promptProblemRepository.create({
    title: draft.title, description: draft.description, sampleInput: draft.sampleInput,
    expectedOutputCriteria: draft.expectedOutputCriteria,
    customRubricCriteria: draft.customRubricCriteria || [],
    difficulty: draft.difficulty || 'medium',
    tags: draft.tags || [],
    durationMinutes: draft.durationMinutes || 20,
    source: PROMPT_PROBLEM_SOURCE.AI_PERSONALIZED,
    createdFor: candidateId,
    createdBy: adminId,
  });

  return assign({ candidateId, problemId: problem.id || problem._id, adminId });
};

const getByToken = async (token) => {
  const submission = await promptSubmissionRepository.findByToken(token);
  if (!submission) throw ApiError.notFound('Invalid or expired link');
  if (submission.expiresAt && submission.expiresAt < new Date()) {
    throw ApiError.badRequest('Test link expired', { code: 'E_EXPIRED' });
  }
  if (!submission.firstOpenedAt) {
    await promptSubmissionRepository.updateById(submission.id || submission._id, {
      firstOpenedAt: new Date(),
      status: PROMPT_SUBMISSION_STATUS.IN_PROGRESS,
    });
  }
  const p = submission.promptProblem;
  return {
    submissionId: submission.id || submission._id,
    title: p.title, description: p.description, sampleInput: p.sampleInput,
    durationMinutes: p.durationMinutes,
    expiresAt: submission.expiresAt,
    previewRunsUsed: submission.previewRunsUsed,
    previewRunsRemaining: Math.max(0, PREVIEW_LIMIT - submission.previewRunsUsed),
    lastPreviewOutput: submission.lastPreviewOutput,
    submitted: !!submission.submittedAt,
    candidatePrompt: submission.candidatePrompt || '',
  };
};

const preview = async ({ token, candidatePrompt }) => {
  const submission = await promptSubmissionRepository.findByToken(token);
  if (!submission) throw ApiError.notFound('Invalid link');
  if (submission.submittedAt) throw ApiError.conflict('Test already submitted', { code: 'E_ALREADY_SUBMITTED' });
  if (submission.previewRunsUsed >= PREVIEW_LIMIT) {
    throw ApiError.conflict('Preview limit reached', { code: 'E_PREVIEW_LIMIT' });
  }
  const { output, provider } = await promptEvaluationService.runPreview({
    problem: submission.promptProblem, candidatePrompt,
  });
  if (output == null) throw ApiError.badRequest('AI service unavailable. Try again.');
  const updated = await promptSubmissionRepository.incrementPreviewRuns(submission.id || submission._id, output);
  return {
    output,
    runsRemaining: Math.max(0, PREVIEW_LIMIT - (updated?.previewRunsUsed || submission.previewRunsUsed + 1)),
  };
};

const submit = async ({ token, candidatePrompt }) => {
  const submission = await promptSubmissionRepository.findByToken(token);
  if (!submission) throw ApiError.notFound('Invalid link');
  if (submission.submittedAt) throw ApiError.conflict('Already submitted', { code: 'E_ALREADY_SUBMITTED' });
  const submittedAt = new Date();
  const updated = await promptSubmissionRepository.updateById(submission.id || submission._id, {
    candidatePrompt: String(candidatePrompt || '').slice(0, 8000),
    submittedAt,
    status: PROMPT_SUBMISSION_STATUS.SUBMITTED,
  });
  // Update candidate sub-doc
  try {
    const candidate = await candidateRepository.findById(submission.candidate);
    if (candidate && candidate.promptTest) {
      candidate.promptTest.submittedAt = submittedAt;
      await candidate.save();
    }
  } catch (err) { logger.warn('candidate.promptTest update on submit failed', { err: err.message }); }

  // Queue evaluation + HR email
  setImmediate(async () => {
    try { await promptEvaluationService.evaluate(submission.id || submission._id); }
    catch (err) { logger.error('Prompt evaluation crashed', { err: err.message }); }
  });
  setImmediate(async () => {
    try { await emailService.sendPromptTestSubmittedHr({ submissionId: submission.id || submission._id }); }
    catch (err) { logger.error('Prompt-test HR notify failed', { err: err.message }); }
  });
  return { submittedAt };
};

const reevaluate = async (submissionId) => {
  setImmediate(async () => {
    try { await promptEvaluationService.evaluate(submissionId); }
    catch (err) { logger.error('Re-evaluation crashed', { err: err.message }); }
  });
  return { queued: true };
};

const getSubmissionForCandidate = async (candidateId) =>
  promptSubmissionRepository.findByCandidate(candidateId);

module.exports = {
  assign, generateAndAssign, saveGeneratedAndAssign,
  getByToken, preview, submit, reevaluate,
  getSubmissionForCandidate,
  PREVIEW_LIMIT,
};
```

- [ ] **Step 4: Run test — verify pass**

Run: `cd backend && npx jest tests/unit/promptTestService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/promptTestService.js backend/tests/unit/promptTestService.test.js
git commit -m "feat(prompt-test): add orchestration service (assign, preview, submit, evaluate)"
```

---

## Task 7: Validators

**Files:**
- Create: `backend/src/validators/promptProblemValidator.js`
- Create: `backend/src/validators/promptTestValidator.js`

- [ ] **Step 1: Write validators**

Create `backend/src/validators/promptProblemValidator.js`:

```js
'use strict';
const Joi = require('joi');

const baseProblemFields = {
  title:                  Joi.string().min(3).max(200).required(),
  description:            Joi.string().min(10).max(4000).required(),
  sampleInput:            Joi.string().min(1).max(4000).required(),
  expectedOutputCriteria: Joi.array().items(Joi.string().max(300)).min(1).max(10).required(),
  customRubricCriteria:   Joi.array().items(Joi.string().max(200)).max(5).default([]),
  difficulty:             Joi.string().valid('easy', 'medium', 'hard').default('medium'),
  tags:                   Joi.array().items(Joi.string()).default([]),
  durationMinutes:        Joi.number().integer().min(5).max(120).default(20),
};

const createSchema = { body: Joi.object(baseProblemFields) };
const updateSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    ...Object.fromEntries(Object.entries(baseProblemFields).map(([k, v]) => [k, v.optional()])),
  }).min(1),
};
const listSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    difficulty: Joi.string().valid('easy', 'medium', 'hard'),
    q: Joi.string().max(200),
  }),
};
const idParamSchema = { params: Joi.object({ id: Joi.string().hex().length(24).required() }) };

module.exports = { createSchema, updateSchema, listSchema, idParamSchema };
```

Create `backend/src/validators/promptTestValidator.js`:

```js
'use strict';
const Joi = require('joi');

const assignSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({ problemId: Joi.string().hex().length(24).required() }),
};
const generateSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    topicOverride: Joi.string().max(200),
    difficultyOverride: Joi.string().valid('easy', 'medium', 'hard'),
  }),
};
const saveGeneratedSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    draft: Joi.object({
      title: Joi.string().required(),
      description: Joi.string().required(),
      sampleInput: Joi.string().required(),
      expectedOutputCriteria: Joi.array().items(Joi.string()).min(1).required(),
      customRubricCriteria: Joi.array().items(Joi.string()).default([]),
      difficulty: Joi.string().valid('easy', 'medium', 'hard').default('medium'),
      tags: Joi.array().items(Joi.string()).default([]),
      durationMinutes: Joi.number().integer().min(5).max(120).default(20),
    }).required(),
  }),
};
const tokenParamSchema = { params: Joi.object({ token: Joi.string().required() }) };
const previewSchema = {
  params: Joi.object({ token: Joi.string().required() }),
  body: Joi.object({ prompt: Joi.string().min(1).max(8000).required() }),
};
const submitSchema = {
  params: Joi.object({ token: Joi.string().required() }),
  body: Joi.object({ prompt: Joi.string().min(1).max(8000).required() }),
};

module.exports = {
  assignSchema, generateSchema, saveGeneratedSchema,
  tokenParamSchema, previewSchema, submitSchema,
};
```

- [ ] **Step 2: Verify load**

Run: `cd backend && node -e "console.log(Object.keys(require('./src/validators/promptProblemValidator')), Object.keys(require('./src/validators/promptTestValidator')))"`
Expected: arrays of expected keys.

- [ ] **Step 3: Commit**

```bash
git add backend/src/validators/promptProblemValidator.js backend/src/validators/promptTestValidator.js
git commit -m "feat(prompt-test): add Joi validators"
```

---

## Task 8: Email templates + emailService methods

**Files:**
- Create: `backend/src/templates/promptTestAssignedCandidateEmail.js`
- Create: `backend/src/templates/promptTestSubmittedHrEmail.js`
- Create: `backend/src/templates/promptTestEvaluationFailedHrEmail.js`
- Modify: `backend/src/services/emailService.js`

- [ ] **Step 1: Write candidate-assigned template**

Create `backend/src/templates/promptTestAssignedCandidateEmail.js`:

```js
'use strict';
module.exports = ({ candidate, problem, accessUrl, expiresAt }) => ({
  html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;color:#111">
  <h2 style="color:#2563eb">Your Prompt Engineering Test</h2>
  <p>Hi ${candidate.name || 'there'},</p>
  <p>You've been assigned a prompt engineering scenario as part of your interview process.</p>
  <p><strong>Scenario:</strong> ${problem.title}</p>
  <p><strong>Duration:</strong> ${problem.durationMinutes} minutes</p>
  <p><strong>Expires:</strong> ${expiresAt.toLocaleString()}</p>
  <p style="margin:24px 0">
    <a href="${accessUrl}" style="background:#2563eb;color:white;padding:10px 18px;border-radius:6px;text-decoration:none">Start the test</a>
  </p>
  <p>If the button doesn't work, paste this URL: ${accessUrl}</p>
</div>`,
  text: `Hi ${candidate.name || 'there'},

You've been assigned a prompt engineering test: ${problem.title}
Duration: ${problem.durationMinutes} minutes
Expires: ${expiresAt.toLocaleString()}

Start: ${accessUrl}`,
});
```

- [ ] **Step 2: Write HR-submitted template**

Create `backend/src/templates/promptTestSubmittedHrEmail.js`:

```js
'use strict';
module.exports = ({ candidate, reviewUrl }) => ({
  html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111">
  <h2 style="color:#2563eb">Prompt test submitted</h2>
  <p><strong>${candidate.name || 'A candidate'}</strong> has submitted their prompt engineering test.</p>
  <p>The AI evaluation is running in the background; once complete you'll see the full breakdown.</p>
  <p><a href="${reviewUrl}">Open the candidate</a></p>
</div>`,
  text: `Prompt test submitted by ${candidate.name || 'a candidate'}.
Review: ${reviewUrl}`,
});
```

- [ ] **Step 3: Write HR-eval-failed template**

Create `backend/src/templates/promptTestEvaluationFailedHrEmail.js`:

```js
'use strict';
module.exports = ({ candidate, reason, reviewUrl }) => ({
  html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111">
  <h2 style="color:#dc2626">Prompt test evaluation failed</h2>
  <p>The AI evaluation for <strong>${candidate.name || 'a candidate'}</strong>'s prompt test could not complete.</p>
  <p><strong>Reason:</strong> ${reason}</p>
  <p>You can retry from the candidate detail page.</p>
  <p><a href="${reviewUrl}">Open the candidate</a></p>
</div>`,
  text: `Prompt test evaluation failed for ${candidate.name}. Reason: ${reason}. Retry: ${reviewUrl}`,
});
```

- [ ] **Step 4: Wire into emailService**

In `backend/src/services/emailService.js`, find the existing exports (e.g., `sendInterviewReminderCandidate`) and add similar wrappers. At the top, import the new templates:

```js
const promptTestAssignedTpl = require('../templates/promptTestAssignedCandidateEmail');
const promptTestSubmittedTpl = require('../templates/promptTestSubmittedHrEmail');
const promptTestEvalFailedTpl = require('../templates/promptTestEvaluationFailedHrEmail');
```

Add three exported functions (use the existing `sendMail`/transporter helper):

```js
const sendPromptTestAssignedCandidate = async ({ candidate, problem, accessToken, expiresAt }) => {
  const base = env.frontendUrl.replace(/\/$/, '');
  const accessUrl = `${base}/prompt-test/${accessToken}`;
  const { html, text } = promptTestAssignedTpl({ candidate, problem, accessUrl, expiresAt });
  await sendMail({ to: candidate.email, subject: `Prompt Engineering Test — ${problem.title}`, html, text });
};

const sendPromptTestSubmittedHr = async ({ submissionId }) => {
  const sub = await require('../repositories/promptSubmissionRepository').findById(submissionId);
  if (!sub) return;
  const candidate = await require('../repositories/candidateRepository').findById(sub.candidate);
  const hrEmail = await resolveHrEmail();
  const base = env.frontendUrl.replace(/\/$/, '');
  const reviewUrl = `${base}/candidates/${candidate.id || candidate._id}`;
  const { html, text } = promptTestSubmittedTpl({ candidate, reviewUrl });
  await sendMail({ to: hrEmail, subject: `Prompt test submitted: ${candidate.name}`, html, text });
};

const sendPromptTestEvaluationFailed = async ({ candidateId, reason }) => {
  const candidate = await require('../repositories/candidateRepository').findById(candidateId);
  const hrEmail = await resolveHrEmail();
  const base = env.frontendUrl.replace(/\/$/, '');
  const reviewUrl = `${base}/candidates/${candidate.id || candidate._id}`;
  const { html, text } = promptTestEvalFailedTpl({ candidate, reason, reviewUrl });
  await sendMail({ to: hrEmail, subject: `Prompt test evaluation failed: ${candidate.name}`, html, text });
};
```

Append the three names to `module.exports`.

- [ ] **Step 5: Verify**

Run: `cd backend && node -e "const e=require('./src/services/emailService'); console.log(typeof e.sendPromptTestAssignedCandidate);"`
Expected: `function`

- [ ] **Step 6: Commit**

```bash
git add backend/src/templates/promptTest*.js backend/src/services/emailService.js
git commit -m "feat(prompt-test): add email templates and emailService methods"
```

---

## Task 9: Rate limiter

**Files:**
- Modify: `backend/src/middlewares/rateLimiter.js`

- [ ] **Step 1: Add `promptPreviewLimiter`**

Read the existing file first, find the export style. Add a new limiter mirroring `codingRunLimiter`:

```js
const promptPreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many preview attempts. Wait a minute.' },
});
```

And include it in `module.exports`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/middlewares/rateLimiter.js
git commit -m "feat(prompt-test): add promptPreviewLimiter (10/min/IP)"
```

---

## Task 10: Admin controllers + routes (Prompt Problems CRUD)

**Files:**
- Create: `backend/src/controllers/promptProblemController.js`
- Create: `backend/src/routes/promptProblemRoutes.js`

- [ ] **Step 1: Controller**

Create `backend/src/controllers/promptProblemController.js`:

```js
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const problemRepo = require('../repositories/promptProblemRepository');
const subRepo = require('../repositories/promptSubmissionRepository');
const { PROMPT_PROBLEM_SOURCE } = require('../utils/constants');

const create = asyncHandler(async (req, res) => {
  const problem = await problemRepo.create({
    ...req.body,
    source: PROMPT_PROBLEM_SOURCE.MANUAL,
    createdFor: null,
    createdBy: req.admin.id,
  });
  return created(res, { problem }, 'Created');
});

const list = asyncHandler(async (req, res) => {
  const result = await problemRepo.listLibrary(req.query);
  return ok(res, result, 'OK');
});

const detail = asyncHandler(async (req, res) => {
  const problem = await problemRepo.findById(req.params.id);
  if (!problem) throw ApiError.notFound('Not found');
  return ok(res, { problem }, 'OK');
});

const update = asyncHandler(async (req, res) => {
  const problem = await problemRepo.updateById(req.params.id, req.body);
  if (!problem) throw ApiError.notFound('Not found');
  return ok(res, { problem }, 'Updated');
});

const remove = asyncHandler(async (req, res) => {
  // Block delete if any submission references this problem
  const anySub = await subRepo.findByCandidate; // sanity import check
  const PromptSubmission = require('../models/PromptSubmission');
  const used = await PromptSubmission.exists({ promptProblem: req.params.id });
  if (used) throw ApiError.conflict('Problem in use — cannot delete', { code: 'E_PROBLEM_IN_USE' });
  await problemRepo.deleteById(req.params.id);
  return ok(res, {}, 'Deleted');
});

module.exports = { create, list, detail, update, remove };
```

- [ ] **Step 2: Routes**

Create `backend/src/routes/promptProblemRoutes.js`:

```js
'use strict';
const express = require('express');
const ctrl = require('../controllers/promptProblemController');
const validate = require('../middlewares/validate');
const requireAdmin = require('../middlewares/requireAdmin');
const v = require('../validators/promptProblemValidator');

const router = express.Router();
router.use(requireAdmin);

router.get('/',         validate(v.listSchema),   ctrl.list);
router.post('/',        validate(v.createSchema), ctrl.create);
router.get('/:id',      validate(v.idParamSchema),ctrl.detail);
router.patch('/:id',    validate(v.updateSchema), ctrl.update);
router.delete('/:id',   validate(v.idParamSchema),ctrl.remove);

module.exports = router;
```

(If `requireAdmin` middleware has a different name, match the existing convention — read `backend/src/middlewares/` first.)

- [ ] **Step 3: Verify loads**

Run: `cd backend && node -e "require('./src/routes/promptProblemRoutes'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/promptProblemController.js backend/src/routes/promptProblemRoutes.js
git commit -m "feat(prompt-test): admin CRUD for prompt problems"
```

---

## Task 11: Admin controller + routes (assign / generate / review)

**Files:**
- Create: `backend/src/controllers/promptTestAdminController.js`
- Create: `backend/src/routes/promptTestAdminRoutes.js`

- [ ] **Step 1: Controller**

Create `backend/src/controllers/promptTestAdminController.js`:

```js
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const svc = require('../services/promptTestService');

const assign = asyncHandler(async (req, res) => {
  const result = await svc.assign({
    candidateId: req.params.id,
    problemId: req.body.problemId,
    adminId: req.admin.id,
  });
  return created(res, result, 'Prompt test assigned');
});

const generate = asyncHandler(async (req, res) => {
  const result = await svc.generateAndAssign({
    candidateId: req.params.id,
    topicOverride: req.body.topicOverride,
    difficultyOverride: req.body.difficultyOverride,
    adminId: req.admin.id,
  });
  return ok(res, result, 'Draft generated');
});

const saveGenerated = asyncHandler(async (req, res) => {
  const result = await svc.saveGeneratedAndAssign({
    candidateId: req.params.id,
    draft: req.body.draft,
    adminId: req.admin.id,
  });
  return created(res, result, 'Saved and assigned');
});

const getSubmission = asyncHandler(async (req, res) => {
  const submission = await svc.getSubmissionForCandidate(req.params.id);
  return ok(res, { submission }, 'OK');
});

const reevaluate = asyncHandler(async (req, res) => {
  const submission = await svc.getSubmissionForCandidate(req.params.id);
  if (!submission) return ok(res, {}, 'No submission');
  await svc.reevaluate(submission.id || submission._id);
  return ok(res, { queued: true }, 'Re-evaluation queued');
});

module.exports = { assign, generate, saveGenerated, getSubmission, reevaluate };
```

- [ ] **Step 2: Routes**

Create `backend/src/routes/promptTestAdminRoutes.js`:

```js
'use strict';
const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/promptTestAdminController');
const validate = require('../middlewares/validate');
const requireAdmin = require('../middlewares/requireAdmin');
const v = require('../validators/promptTestValidator');

router.use(requireAdmin);

router.post('/assign',         validate(v.assignSchema),         ctrl.assign);
router.post('/generate',       validate(v.generateSchema),       ctrl.generate);
router.post('/save-generated', validate(v.saveGeneratedSchema),  ctrl.saveGenerated);
router.get('/submission',      validate(v.assignSchema.params ? { params: v.assignSchema.params } : {}), ctrl.getSubmission);
router.post('/reevaluate',     validate({ params: v.assignSchema.params }), ctrl.reevaluate);

module.exports = router;
```

- [ ] **Step 3: Verify**

Run: `cd backend && node -e "require('./src/routes/promptTestAdminRoutes'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/promptTestAdminController.js backend/src/routes/promptTestAdminRoutes.js
git commit -m "feat(prompt-test): admin endpoints (assign, generate, save, reevaluate)"
```

---

## Task 12: Public controller + routes (candidate token endpoints)

**Files:**
- Create: `backend/src/controllers/promptTestPublicController.js`
- Create: `backend/src/routes/promptTestPublicRoutes.js`

- [ ] **Step 1: Controller**

Create `backend/src/controllers/promptTestPublicController.js`:

```js
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const svc = require('../services/promptTestService');

const fetch = asyncHandler(async (req, res) => {
  const data = await svc.getByToken(req.params.token);
  return ok(res, data, 'OK');
});

const preview = asyncHandler(async (req, res) => {
  const result = await svc.preview({ token: req.params.token, candidatePrompt: req.body.prompt });
  return ok(res, result, 'OK');
});

const submit = asyncHandler(async (req, res) => {
  const result = await svc.submit({ token: req.params.token, candidatePrompt: req.body.prompt });
  return ok(res, result, 'Submitted');
});

module.exports = { fetch, preview, submit };
```

- [ ] **Step 2: Routes**

Create `backend/src/routes/promptTestPublicRoutes.js`:

```js
'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/promptTestPublicController');
const validate = require('../middlewares/validate');
const v = require('../validators/promptTestValidator');
const { promptPreviewLimiter } = require('../middlewares/rateLimiter');

router.get('/:token',         validate(v.tokenParamSchema), ctrl.fetch);
router.post('/:token/preview', promptPreviewLimiter, validate(v.previewSchema), ctrl.preview);
router.post('/:token/submit',  validate(v.submitSchema),    ctrl.submit);

module.exports = router;
```

- [ ] **Step 3: Verify**

Run: `cd backend && node -e "require('./src/routes/promptTestPublicRoutes'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/promptTestPublicController.js backend/src/routes/promptTestPublicRoutes.js
git commit -m "feat(prompt-test): public token endpoints (fetch, preview, submit)"
```

---

## Task 13: Register routers + extend MCQ auto-shortlist suppression

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/src/services/testService.js`

- [ ] **Step 1: Add router mounts**

Read `backend/src/app.js`, find where other routers like `codingProblemRoutes` are mounted. Add:

```js
const promptProblemRoutes = require('./routes/promptProblemRoutes');
const promptTestAdminRoutes = require('./routes/promptTestAdminRoutes');
const promptTestPublicRoutes = require('./routes/promptTestPublicRoutes');

// ... alongside the other app.use calls:
app.use('/api/v1/prompt-problems', promptProblemRoutes);
app.use('/api/v1/candidates/:id/prompt-test', promptTestAdminRoutes);
app.use('/api/v1/prompt-test', promptTestPublicRoutes);
```

- [ ] **Step 2: Extend the MCQ auto-outcome suppression**

In `backend/src/services/testService.js` around line 186, the MCQ submission flow currently suppresses the auto-shortlist when a coding test is pending review. Add the same check for prompt test. Find:

```js
const codingPending =
  candidate.codingTest?.sentAt &&
  candidate.codingTest?.outcome === 'pending_review';

if (outcome === ROUND1_OUTCOMES.DISQUALIFIED) {
  // ...
} else if (codingPending) {
  // ...
}
```

Change to:

```js
const codingPending =
  candidate.codingTest?.sentAt &&
  candidate.codingTest?.outcome === 'pending_review';
const promptPending =
  candidate.promptTest?.sentAt &&
  (!candidate.promptTest?.outcome || candidate.promptTest?.outcome === 'pending_review');
const otherTestPending = codingPending || promptPending;

if (outcome === ROUND1_OUTCOMES.DISQUALIFIED) {
  // ...
} else if (otherTestPending) {
  logger.info('Round 1 auto-outcome suppressed — coding or prompt test pending review', {
    candidateId: candidate.id || candidate._id,
  });
  queueReportEmail({ candidate, submission });
} else {
  // ...
}
```

(Update the existing log message and conditional branch from `codingPending` → `otherTestPending`. Keep the rest of the branch's behavior identical.)

- [ ] **Step 3: Boot test**

Run: `cd backend && timeout 5 node src/server.js || true`
Expected: server logs startup without route-registration errors. Kill is fine.

- [ ] **Step 4: Run full backend test suite**

Run: `cd backend && npx jest`
Expected: all existing tests pass + the 3 new test files pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.js backend/src/services/testService.js
git commit -m "feat(prompt-test): register routers and extend auto-shortlist suppression to promptTest"
```

---

## Task 14: Frontend API clients

**Files:**
- Create: `frontend/src/api/promptProblemApi.js`
- Create: `frontend/src/api/promptTestApi.js`

- [ ] **Step 1: promptProblemApi**

Create `frontend/src/api/promptProblemApi.js`:

```js
import axios from './axios';

export const promptProblemApi = {
  list:   (params) => axios.get('/prompt-problems', { params }).then((r) => r.data.data),
  create: (body)   => axios.post('/prompt-problems', body).then((r) => r.data.data),
  detail: (id)     => axios.get(`/prompt-problems/${id}`).then((r) => r.data.data),
  update: (id, b)  => axios.patch(`/prompt-problems/${id}`, b).then((r) => r.data.data),
  remove: (id)     => axios.delete(`/prompt-problems/${id}`).then((r) => r.data.data),
};
```

- [ ] **Step 2: promptTestApi**

Create `frontend/src/api/promptTestApi.js`:

```js
import axios from './axios';

export const promptTestApi = {
  // Admin (candidate-scoped)
  assign:        (candidateId, problemId)            => axios.post(`/candidates/${candidateId}/prompt-test/assign`, { problemId }).then((r) => r.data.data),
  generate:      (candidateId, body)                 => axios.post(`/candidates/${candidateId}/prompt-test/generate`, body).then((r) => r.data.data),
  saveGenerated: (candidateId, draft)                => axios.post(`/candidates/${candidateId}/prompt-test/save-generated`, { draft }).then((r) => r.data.data),
  getSubmission: (candidateId)                       => axios.get(`/candidates/${candidateId}/prompt-test/submission`).then((r) => r.data.data),
  reevaluate:    (candidateId)                       => axios.post(`/candidates/${candidateId}/prompt-test/reevaluate`).then((r) => r.data.data),

  // Public (token)
  fetchByToken:  (token)                             => axios.get(`/prompt-test/${token}`).then((r) => r.data.data),
  preview:       (token, prompt)                     => axios.post(`/prompt-test/${token}/preview`, { prompt }).then((r) => r.data.data),
  submit:        (token, prompt)                     => axios.post(`/prompt-test/${token}/submit`, { prompt }).then((r) => r.data.data),
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/promptProblemApi.js frontend/src/api/promptTestApi.js
git commit -m "feat(prompt-test): frontend API clients"
```

---

## Task 15: Redux slices + store registration

**Files:**
- Create: `frontend/src/features/promptProblems/promptProblemSlice.js`
- Create: `frontend/src/features/promptTest/promptTestSlice.js`
- Modify: `frontend/src/store.js` (or wherever slices are wired)

- [ ] **Step 1: promptProblemSlice**

Create `frontend/src/features/promptProblems/promptProblemSlice.js`:

```js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { promptProblemApi } from '@/api/promptProblemApi';
import { extractError } from '@/api/axios';

export const fetchProblems = createAsyncThunk('promptProblems/list',
  async (params, { rejectWithValue }) => {
    try { return await promptProblemApi.list(params); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const createProblem = createAsyncThunk('promptProblems/create',
  async (body, { rejectWithValue }) => {
    try { return await promptProblemApi.create(body); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const updateProblem = createAsyncThunk('promptProblems/update',
  async ({ id, body }, { rejectWithValue }) => {
    try { return await promptProblemApi.update(id, body); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const deleteProblem = createAsyncThunk('promptProblems/delete',
  async (id, { rejectWithValue }) => {
    try { await promptProblemApi.remove(id); return id; }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

const slice = createSlice({
  name: 'promptProblems',
  initialState: { list: [], meta: {}, status: 'idle', error: null },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchProblems.pending, (s) => { s.status = 'loading'; });
    b.addCase(fetchProblems.fulfilled, (s, a) => {
      s.status = 'succeeded';
      s.list = a.payload.items;
      s.meta = { page: a.payload.page, limit: a.payload.limit, total: a.payload.total, totalPages: a.payload.totalPages };
    });
    b.addCase(fetchProblems.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message; });
    b.addCase(createProblem.fulfilled, (s, a) => { s.list = [a.payload.problem, ...s.list]; });
    b.addCase(updateProblem.fulfilled, (s, a) => {
      s.list = s.list.map((p) => (p.id === a.payload.problem.id ? a.payload.problem : p));
    });
    b.addCase(deleteProblem.fulfilled, (s, a) => { s.list = s.list.filter((p) => p.id !== a.payload); });
  },
});

export default slice.reducer;
```

- [ ] **Step 2: promptTestSlice**

Create `frontend/src/features/promptTest/promptTestSlice.js`:

```js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { promptTestApi } from '@/api/promptTestApi';
import { extractError } from '@/api/axios';

export const fetchTestByToken = createAsyncThunk('promptTest/fetch',
  async (token, { rejectWithValue }) => {
    try { return await promptTestApi.fetchByToken(token); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const runPreview = createAsyncThunk('promptTest/preview',
  async ({ token, prompt }, { rejectWithValue }) => {
    try { return await promptTestApi.preview(token, prompt); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const submitTest = createAsyncThunk('promptTest/submit',
  async ({ token, prompt }, { rejectWithValue }) => {
    try { return await promptTestApi.submit(token, prompt); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const fetchSubmissionForCandidate = createAsyncThunk('promptTest/getSubmission',
  async (candidateId, { rejectWithValue }) => {
    try { return await promptTestApi.getSubmission(candidateId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const assignFromLibrary = createAsyncThunk('promptTest/assign',
  async ({ candidateId, problemId }, { rejectWithValue }) => {
    try { return await promptTestApi.assign(candidateId, problemId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const generateDraft = createAsyncThunk('promptTest/generate',
  async ({ candidateId, topicOverride, difficultyOverride }, { rejectWithValue }) => {
    try { return await promptTestApi.generate(candidateId, { topicOverride, difficultyOverride }); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const saveDraftAndAssign = createAsyncThunk('promptTest/saveGenerated',
  async ({ candidateId, draft }, { rejectWithValue }) => {
    try { return await promptTestApi.saveGenerated(candidateId, draft); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const reevaluate = createAsyncThunk('promptTest/reevaluate',
  async (candidateId, { rejectWithValue }) => {
    try { return await promptTestApi.reevaluate(candidateId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

const slice = createSlice({
  name: 'promptTest',
  initialState: {
    candidateView: null, candidateStatus: 'idle',
    previewOutput: null, runsRemaining: null,
    submitStatus: 'idle',
    adminSubmission: null, adminSubmissionStatus: 'idle',
    draft: null, draftStatus: 'idle',
    error: null,
  },
  reducers: {
    clearDraft: (s) => { s.draft = null; s.draftStatus = 'idle'; },
  },
  extraReducers: (b) => {
    b.addCase(fetchTestByToken.pending, (s) => { s.candidateStatus = 'loading'; });
    b.addCase(fetchTestByToken.fulfilled, (s, a) => {
      s.candidateStatus = 'succeeded';
      s.candidateView = a.payload;
      s.runsRemaining = a.payload.previewRunsRemaining;
      s.previewOutput = a.payload.lastPreviewOutput;
    });
    b.addCase(fetchTestByToken.rejected, (s, a) => { s.candidateStatus = 'failed'; s.error = a.payload?.message; });

    b.addCase(runPreview.fulfilled, (s, a) => {
      s.previewOutput = a.payload.output;
      s.runsRemaining = a.payload.runsRemaining;
    });

    b.addCase(submitTest.pending, (s) => { s.submitStatus = 'loading'; });
    b.addCase(submitTest.fulfilled, (s) => { s.submitStatus = 'succeeded'; });
    b.addCase(submitTest.rejected, (s, a) => { s.submitStatus = 'failed'; s.error = a.payload?.message; });

    b.addCase(fetchSubmissionForCandidate.fulfilled, (s, a) => {
      s.adminSubmission = a.payload.submission;
      s.adminSubmissionStatus = 'succeeded';
    });

    b.addCase(generateDraft.pending, (s) => { s.draftStatus = 'loading'; });
    b.addCase(generateDraft.fulfilled, (s, a) => { s.draftStatus = 'succeeded'; s.draft = a.payload.draft; });
    b.addCase(generateDraft.rejected, (s, a) => { s.draftStatus = 'failed'; s.error = a.payload?.message; });
  },
});

export const { clearDraft } = slice.actions;
export default slice.reducer;
```

- [ ] **Step 3: Wire into store**

Read `frontend/src/store.js` (or equivalent), import:
```js
import promptProblemsReducer from '@/features/promptProblems/promptProblemSlice';
import promptTestReducer from '@/features/promptTest/promptTestSlice';
```
Add to the reducer object:
```js
promptProblems: promptProblemsReducer,
promptTest: promptTestReducer,
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/promptProblems/promptProblemSlice.js \
        frontend/src/features/promptTest/promptTestSlice.js \
        frontend/src/store.js
git commit -m "feat(prompt-test): Redux slices for problems and test flow"
```

---

## Task 16: Prompt Problems admin page

**Files:**
- Create: `frontend/src/features/promptProblems/PromptProblemsPage.jsx`
- Create: `frontend/src/features/promptProblems/PromptProblemsPage.scss`
- Create: `frontend/src/features/promptProblems/PromptProblemForm.jsx`

- [ ] **Step 1: PromptProblemsPage (list view)**

Create `frontend/src/features/promptProblems/PromptProblemsPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchProblems, deleteProblem } from './promptProblemSlice';
import PromptProblemForm from './PromptProblemForm';
import './PromptProblemsPage.scss';

export default function PromptProblemsPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { list, status, error } = useSelector((s) => s.promptProblems);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => { dispatch(fetchProblems({ page: 1, limit: 50 })); }, [dispatch]);

  const onDelete = async (id) => {
    if (!window.confirm('Delete this problem?')) return;
    const a = await dispatch(deleteProblem(id));
    if (deleteProblem.fulfilled.match(a)) push({ type: 'success', message: 'Deleted' });
    else push({ type: 'error', message: a.payload?.message || 'Failed' });
  };

  if (status === 'loading' && list.length === 0) return <Loader message="Loading problems…" />;
  if (status === 'failed') return <EmptyState title="Failed" description={error || '—'} />;

  return (
    <div className="prompt-problems">
      <div className="prompt-problems__head">
        <h2>Prompt Problems</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ New Problem</Button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No prompt problems yet" description="Create one with the button above." />
      ) : (
        <table className="prompt-problems__table">
          <thead><tr><th>Title</th><th>Difficulty</th><th>Tags</th><th>Duration</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{p.difficulty}</td>
                <td>{(p.tags || []).join(', ')}</td>
                <td>{p.durationMinutes} min</td>
                <td>
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(p); setFormOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => onDelete(p.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <PromptProblemForm
        open={formOpen}
        initial={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: PromptProblemForm (create/edit modal)**

Create `frontend/src/features/promptProblems/PromptProblemForm.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import TextArea from '@/components/common/TextArea';
import { useToast } from '@/components/common/Toast';
import { createProblem, updateProblem } from './promptProblemSlice';

const DEFAULT = {
  title: '', description: '', sampleInput: '',
  expectedOutputCriteria: [''],
  customRubricCriteria: [],
  difficulty: 'medium', tags: [], durationMinutes: 20,
};

export default function PromptProblemForm({ open, initial, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [form, setForm] = useState(DEFAULT);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setForm(initial || DEFAULT); }, [initial, open]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCriterion = (arr, i, v) =>
    setField(arr, form[arr].map((c, idx) => (idx === i ? v : c)));
  const addCriterion = (arr) => setField(arr, [...form[arr], '']);
  const removeCriterion = (arr, i) => setField(arr, form[arr].filter((_, idx) => idx !== i));

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      ...form,
      tags: typeof form.tags === 'string' ? form.tags.split(',').map((s) => s.trim()).filter(Boolean) : form.tags,
      expectedOutputCriteria: form.expectedOutputCriteria.filter(Boolean),
      customRubricCriteria: (form.customRubricCriteria || []).filter(Boolean),
    };
    const action = initial
      ? await dispatch(updateProblem({ id: initial.id, body }))
      : await dispatch(createProblem(body));
    setBusy(false);
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: initial ? 'Updated' : 'Created' });
      onClose();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed' });
    }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Prompt Problem' : 'New Prompt Problem'}>
      <form onSubmit={onSubmit} className="prompt-problem-form">
        <Input label="Title" value={form.title} onChange={(e) => setField('title', e.target.value)} required />
        <TextArea label="Scenario description" value={form.description} onChange={(e) => setField('description', e.target.value)} rows={3} required />
        <TextArea label="Sample input" value={form.sampleInput} onChange={(e) => setField('sampleInput', e.target.value)} rows={4} required />

        <label className="form-label">Expected output criteria</label>
        {form.expectedOutputCriteria.map((c, i) => (
          <div key={i} className="prompt-problem-form__row">
            <Input value={c} onChange={(e) => setCriterion('expectedOutputCriteria', i, e.target.value)} />
            <Button size="sm" variant="ghost" type="button" onClick={() => removeCriterion('expectedOutputCriteria', i)}>×</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" type="button" onClick={() => addCriterion('expectedOutputCriteria')}>+ criterion</Button>

        <label className="form-label">Custom rubric criteria (optional)</label>
        {(form.customRubricCriteria || []).map((c, i) => (
          <div key={i} className="prompt-problem-form__row">
            <Input value={c} onChange={(e) => setCriterion('customRubricCriteria', i, e.target.value)} />
            <Button size="sm" variant="ghost" type="button" onClick={() => removeCriterion('customRubricCriteria', i)}>×</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" type="button" onClick={() => addCriterion('customRubricCriteria')}>+ rubric item</Button>

        <div className="prompt-problem-form__grid">
          <label>Difficulty
            <select value={form.difficulty} onChange={(e) => setField('difficulty', e.target.value)}>
              <option>easy</option><option>medium</option><option>hard</option>
            </select>
          </label>
          <Input label="Duration (min)" type="number" min={5} max={120}
            value={form.durationMinutes} onChange={(e) => setField('durationMinutes', Number(e.target.value))} />
          <Input label="Tags (comma-separated)" value={Array.isArray(form.tags) ? form.tags.join(', ') : form.tags}
            onChange={(e) => setField('tags', e.target.value)} />
        </div>

        <div className="prompt-problem-form__actions">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button loading={busy} type="submit">{initial ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: SCSS (minimal)**

Create `frontend/src/features/promptProblems/PromptProblemsPage.scss`:

```scss
.prompt-problems {
  padding: 24px;
  &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  &__table { width: 100%; border-collapse: collapse; td, th { padding: 10px; border-bottom: 1px solid #eee; text-align: left; } }
}
.prompt-problem-form {
  display: flex; flex-direction: column; gap: 12px;
  &__row { display: flex; gap: 8px; align-items: center; }
  &__grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  &__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
}
.form-label { font-weight: 600; font-size: 14px; }
```

- [ ] **Step 4: Quick render check (optional manual)**

After wiring into routes (Task 21), open `/prompt-problems` and verify list + form render.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/promptProblems/
git commit -m "feat(prompt-test): admin Prompt Problems page (list + create/edit)"
```

---

## Task 17: Assign-Prompt-Test modal (library pick + AI generate)

**Files:**
- Create: `frontend/src/features/promptTest/AssignPromptTestModal.jsx`
- Create: `frontend/src/features/promptTest/AssignPromptTestModal.scss`

- [ ] **Step 1: Component**

Create `frontend/src/features/promptTest/AssignPromptTestModal.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import TextArea from '@/components/common/TextArea';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { fetchProblems } from '@/features/promptProblems/promptProblemSlice';
import {
  assignFromLibrary, generateDraft, saveDraftAndAssign, clearDraft,
} from './promptTestSlice';
import './AssignPromptTestModal.scss';

export default function AssignPromptTestModal({ open, onClose, candidateId, onAssigned }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { list: problems } = useSelector((s) => s.promptProblems);
  const { draft, draftStatus, error } = useSelector((s) => s.promptTest);
  const [mode, setMode] = useState('library');  // 'library' | 'ai'
  const [selectedId, setSelectedId] = useState('');
  const [topicOverride, setTopicOverride] = useState('');
  const [difficultyOverride, setDifficultyOverride] = useState('');
  const [editing, setEditing] = useState(null);  // editable draft fields
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) dispatch(fetchProblems({ page: 1, limit: 100 })); }, [open, dispatch]);
  useEffect(() => { if (draft) setEditing(draft); }, [draft]);
  useEffect(() => { if (!open) { dispatch(clearDraft()); setEditing(null); } }, [open, dispatch]);

  const onAssignFromLibrary = async () => {
    if (!selectedId) return push({ type: 'error', message: 'Pick a problem' });
    setBusy(true);
    const a = await dispatch(assignFromLibrary({ candidateId, problemId: selectedId }));
    setBusy(false);
    if (assignFromLibrary.fulfilled.match(a)) {
      push({ type: 'success', message: 'Assigned' });
      onAssigned?.();
      onClose();
    } else push({ type: 'error', message: a.payload?.message || 'Failed' });
  };

  const onGenerate = async () => {
    setBusy(true);
    const a = await dispatch(generateDraft({ candidateId, topicOverride, difficultyOverride }));
    setBusy(false);
    if (!generateDraft.fulfilled.match(a)) push({ type: 'error', message: a.payload?.message || 'AI failed' });
  };

  const onSaveAndAssign = async () => {
    if (!editing) return;
    setBusy(true);
    const a = await dispatch(saveDraftAndAssign({ candidateId, draft: editing }));
    setBusy(false);
    if (saveDraftAndAssign.fulfilled.match(a)) {
      push({ type: 'success', message: 'Saved and assigned' });
      onAssigned?.();
      onClose();
    } else push({ type: 'error', message: a.payload?.message || 'Failed' });
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Assign Prompt Test" wide>
      <div className="assign-prompt-modal">
        <div className="assign-prompt-modal__tabs">
          <button className={mode === 'library' ? 'active' : ''} onClick={() => setMode('library')}>Pick from library</button>
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>Generate with AI</button>
        </div>

        {mode === 'library' && (
          <>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="assign-prompt-modal__select">
              <option value="">-- pick a problem --</option>
              {problems.map((p) => (
                <option key={p.id} value={p.id}>{p.title} ({p.difficulty}, {p.durationMinutes}m)</option>
              ))}
            </select>
            <div className="assign-prompt-modal__actions">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button loading={busy} onClick={onAssignFromLibrary}>Assign</Button>
            </div>
          </>
        )}

        {mode === 'ai' && !editing && (
          <>
            <Input label="Topic override (optional)" value={topicOverride} onChange={(e) => setTopicOverride(e.target.value)} placeholder="e.g. error-log triage" />
            <label>Difficulty override (optional)
              <select value={difficultyOverride} onChange={(e) => setDifficultyOverride(e.target.value)}>
                <option value="">— auto —</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <div className="assign-prompt-modal__actions">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button loading={busy || draftStatus === 'loading'} onClick={onGenerate}>Generate</Button>
            </div>
            {draftStatus === 'loading' && <Loader message="AI is drafting…" />}
            {error && <div className="assign-prompt-modal__err">{error}</div>}
          </>
        )}

        {mode === 'ai' && editing && (
          <>
            <Input label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <TextArea label="Description" value={editing.description} rows={3} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <TextArea label="Sample input" value={editing.sampleInput} rows={4} onChange={(e) => setEditing({ ...editing, sampleInput: e.target.value })} />
            <TextArea label="Expected output criteria (one per line)"
              value={(editing.expectedOutputCriteria || []).join('\n')}
              rows={4}
              onChange={(e) => setEditing({ ...editing, expectedOutputCriteria: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
            <TextArea label="Custom rubric criteria (one per line)"
              value={(editing.customRubricCriteria || []).join('\n')}
              rows={2}
              onChange={(e) => setEditing({ ...editing, customRubricCriteria: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
            <div className="assign-prompt-modal__actions">
              <Button variant="secondary" onClick={() => { dispatch(clearDraft()); setEditing(null); }}>Discard & regenerate</Button>
              <Button loading={busy} onClick={onSaveAndAssign}>Save & Assign</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: SCSS**

Create `frontend/src/features/promptTest/AssignPromptTestModal.scss`:

```scss
.assign-prompt-modal {
  display: flex; flex-direction: column; gap: 12px;
  &__tabs {
    display: flex; gap: 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 12px;
    button {
      padding: 8px 16px; background: transparent; border: none; cursor: pointer; border-bottom: 2px solid transparent;
      &.active { border-bottom-color: #2563eb; color: #2563eb; font-weight: 600; }
    }
  }
  &__select { padding: 8px; width: 100%; }
  &__actions { display: flex; justify-content: flex-end; gap: 8px; }
  &__err { color: #dc2626; font-size: 14px; }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/promptTest/AssignPromptTestModal.{jsx,scss}
git commit -m "feat(prompt-test): assign modal with library pick + AI generate paths"
```

---

## Task 18: Candidate test page (`/prompt-test/:token`)

**Files:**
- Create: `frontend/src/features/promptTest/PromptTestPage.jsx`
- Create: `frontend/src/features/promptTest/PromptTestPage.scss`

- [ ] **Step 1: Component**

Create `frontend/src/features/promptTest/PromptTestPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchTestByToken, runPreview, submitTest } from './promptTestSlice';
import './PromptTestPage.scss';

export default function PromptTestPage() {
  const { token } = useParams();
  const dispatch = useDispatch();
  const { push } = useToast();
  const { candidateView, candidateStatus, previewOutput, runsRemaining, submitStatus, error } =
    useSelector((s) => s.promptTest);
  const [prompt, setPrompt] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { dispatch(fetchTestByToken(token)); }, [token, dispatch]);
  useEffect(() => { if (candidateView?.candidatePrompt) setPrompt(candidateView.candidatePrompt); }, [candidateView]);

  if (candidateStatus === 'loading') return <Loader message="Loading test…" />;
  if (candidateStatus === 'failed') return <EmptyState title="Could not load" description={error || '—'} />;
  if (!candidateView) return null;
  if (candidateView.submitted || submitted) {
    return (
      <div className="prompt-test prompt-test--done">
        <h2>Submitted</h2>
        <p>Thanks — your prompt test has been submitted. Your interviewer will review it.</p>
      </div>
    );
  }

  const onTryIt = async () => {
    if (!prompt.trim()) return push({ type: 'error', message: 'Write a prompt first' });
    const a = await dispatch(runPreview({ token, prompt }));
    if (!runPreview.fulfilled.match(a)) push({ type: 'error', message: a.payload?.message || 'Preview failed' });
  };

  const onSubmit = async () => {
    if (!prompt.trim()) return push({ type: 'error', message: 'Write a prompt first' });
    if (!window.confirm('Submit and finish? You can\'t change it after this.')) return;
    const a = await dispatch(submitTest({ token, prompt }));
    if (submitTest.fulfilled.match(a)) { setSubmitted(true); push({ type: 'success', message: 'Submitted' }); }
    else push({ type: 'error', message: a.payload?.message || 'Submit failed' });
  };

  return (
    <div className="prompt-test">
      <div className="prompt-test__head">
        <h2>{candidateView.title}</h2>
        <span className="prompt-test__duration">{candidateView.durationMinutes} min</span>
      </div>

      <section className="prompt-test__card">
        <h3>Scenario</h3>
        <p className="prompt-test__desc">{candidateView.description}</p>
        <h3>Sample input</h3>
        <pre className="prompt-test__sample">{candidateView.sampleInput}</pre>
      </section>

      <section className="prompt-test__card">
        <h3>Your prompt</h3>
        <textarea
          className="prompt-test__textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          maxLength={8000}
          placeholder="Write the prompt you would send to an LLM for this task…"
        />
        <div className="prompt-test__actions">
          <Button variant="secondary" onClick={onTryIt} disabled={runsRemaining === 0}>
            ▶ Try it ({runsRemaining} left)
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={submitStatus === 'loading'}>
            Submit & Finish
          </Button>
        </div>
      </section>

      {previewOutput && (
        <section className="prompt-test__card">
          <h3>Last preview output</h3>
          <pre className="prompt-test__output">{previewOutput}</pre>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: SCSS**

Create `frontend/src/features/promptTest/PromptTestPage.scss`:

```scss
.prompt-test {
  max-width: 880px; margin: 32px auto; padding: 16px;
  &__head { display: flex; justify-content: space-between; align-items: center; }
  &__duration { color: #6b7280; }
  &__card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  &__desc { white-space: pre-wrap; }
  &__sample, &__output {
    background: #f9fafb; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word;
  }
  &__textarea {
    width: 100%; padding: 12px; font-family: ui-monospace, monospace; font-size: 14px;
    border: 1px solid #d1d5db; border-radius: 6px;
  }
  &__actions { display: flex; gap: 12px; margin-top: 12px; justify-content: flex-end; }
  &--done { text-align: center; padding: 64px; }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/promptTest/PromptTestPage.{jsx,scss}
git commit -m "feat(prompt-test): candidate-facing /prompt-test/:token page with preview & submit"
```

---

## Task 19: Admin review panel

**Files:**
- Create: `frontend/src/features/promptTest/PromptTestReviewPanel.jsx`
- Create: `frontend/src/features/promptTest/PromptTestReviewPanel.scss`

- [ ] **Step 1: Component**

Create `frontend/src/features/promptTest/PromptTestReviewPanel.jsx`:

```jsx
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import { fetchSubmissionForCandidate, reevaluate } from './promptTestSlice';
import { useToast } from '@/components/common/Toast';
import './PromptTestReviewPanel.scss';

export default function PromptTestReviewPanel({ candidateId }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { adminSubmission } = useSelector((s) => s.promptTest);

  useEffect(() => { if (candidateId) dispatch(fetchSubmissionForCandidate(candidateId)); }, [candidateId, dispatch]);

  if (!adminSubmission) return null;
  const s = adminSubmission;
  const e = s.evaluation || {};
  const status = s.status;

  const onReeval = async () => {
    const a = await dispatch(reevaluate(candidateId));
    if (reevaluate.fulfilled.match(a)) push({ type: 'success', message: 'Re-evaluation queued' });
    else push({ type: 'error', message: a.payload?.message || 'Failed' });
  };

  return (
    <div className="prompt-review">
      <div className="prompt-review__head">
        <h3>Prompt Test</h3>
        <span className="prompt-review__total">Total: {e.totalScore ?? '—'} / 100</span>
      </div>
      <div className="prompt-review__meta">
        Problem: {s.promptProblem?.title} · Difficulty: {s.promptProblem?.difficulty} · Submitted: {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}
      </div>

      {status === 'evaluating' && <div className="prompt-review__pending">Evaluating… give it a few seconds.</div>}
      {status === 'evaluation_failed' && (
        <div className="prompt-review__err">
          Evaluation failed: {e.aiNotes}
          <Button size="sm" variant="secondary" onClick={onReeval}>Retry</Button>
        </div>
      )}

      <section>
        <h4>Candidate's prompt</h4>
        <pre className="prompt-review__pre">{s.candidatePrompt || '—'}</pre>
      </section>

      {e.executionOutput && (
        <section>
          <h4>Execution output</h4>
          <pre className="prompt-review__pre">{e.executionOutput}</pre>
        </section>
      )}

      {e.rubricBreakdown && (
        <section>
          <h4>Rubric (prompt craft) — {e.rubricScore}/50</h4>
          <ul className="prompt-review__list">
            {e.rubricBreakdown.map((r, i) => (
              <li key={i}><strong>{r.criterion}</strong>: {r.score}/5 — {r.notes}</li>
            ))}
          </ul>
        </section>
      )}

      {e.outputBreakdown && (
        <section>
          <h4>Output — {e.outputScore}/50</h4>
          <ul className="prompt-review__list">
            {e.outputBreakdown.map((r, i) => (
              <li key={i}>{r.pass ? '✓' : '✗'} <strong>{r.criterion}</strong> — {r.notes}</li>
            ))}
          </ul>
        </section>
      )}

      {status === 'evaluated' && (
        <div className="prompt-review__actions">
          <Button size="sm" variant="secondary" onClick={onReeval}>Re-run evaluation</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: SCSS**

Create `frontend/src/features/promptTest/PromptTestReviewPanel.scss`:

```scss
.prompt-review {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;
  &__head { display: flex; justify-content: space-between; align-items: center; }
  &__total { font-weight: 700; color: #2563eb; }
  &__meta { color: #6b7280; margin-bottom: 12px; font-size: 14px; }
  &__pre { background: #f9fafb; padding: 12px; border-radius: 6px; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 13px; }
  &__list { padding-left: 18px; li { margin-bottom: 6px; } }
  &__actions { margin-top: 12px; display: flex; justify-content: flex-end; }
  &__pending { padding: 12px; background: #fef3c7; border-radius: 6px; }
  &__err { padding: 12px; background: #fee2e2; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/promptTest/PromptTestReviewPanel.{jsx,scss}
git commit -m "feat(prompt-test): admin review panel with score breakdown"
```

---

## Task 20: Wire into CandidateDetailPage

**Files:**
- Modify: `frontend/src/features/candidates/CandidateDetailPage.jsx`

- [ ] **Step 1: Import + render**

Read `CandidateDetailPage.jsx`. At the top:

```jsx
import AssignPromptTestModal from '@/features/promptTest/AssignPromptTestModal';
import PromptTestReviewPanel from '@/features/promptTest/PromptTestReviewPanel';
```

Add local state near other modal flags:

```jsx
const [promptModalOpen, setPromptModalOpen] = useState(false);
```

In the action button row (near the existing "Assign Coding Test" button), add:

```jsx
<Button onClick={() => setPromptModalOpen(true)}>Assign Prompt Test</Button>
```

Below the existing test panels (after Coding Test panel), add:

```jsx
{c.promptTest?.sentAt && <PromptTestReviewPanel candidateId={c.id} />}
```

Mount the modal anywhere in the return:

```jsx
<AssignPromptTestModal
  open={promptModalOpen}
  onClose={() => setPromptModalOpen(false)}
  candidateId={c.id}
  onAssigned={() => { /* page refetch hook here */ }}
/>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/candidates/CandidateDetailPage.jsx
git commit -m "feat(prompt-test): wire Assign Prompt Test action + Review panel into Candidate detail"
```

---

## Task 21: Routes

**Files:**
- Modify: `frontend/src/routes/AppRoutes.jsx`

- [ ] **Step 1: Add routes**

Read `AppRoutes.jsx` and add:

```jsx
import PromptProblemsPage from '@/features/promptProblems/PromptProblemsPage';
import PromptTestPage from '@/features/promptTest/PromptTestPage';
```

Inside the route table:

```jsx
{/* Admin */}
<Route path="/prompt-problems" element={<ProtectedAdmin><PromptProblemsPage /></ProtectedAdmin>} />

{/* Public (candidate) */}
<Route path="/prompt-test/:token" element={<PromptTestPage />} />
```

(Match the wrappers used by existing admin/public routes — `ProtectedAdmin` is illustrative; use whatever pattern exists.)

- [ ] **Step 2: Add nav link**

In the admin sidebar (e.g., `frontend/src/components/Sidebar.jsx` or analogous), add:

```jsx
<NavItem to="/prompt-problems">Prompt Problems</NavItem>
```

- [ ] **Step 3: Smoke test**

Run: `cd frontend && npm run dev`
Open http://localhost:5173/prompt-problems — should render the page with empty state. Open http://localhost:5173/prompt-test/test-token — should render a "Could not load" message (no such token), proving the page mounts.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/AppRoutes.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(prompt-test): add /prompt-problems and /prompt-test/:token routes"
```

---

## Task 22: Update FEATURES.md + PDF source

**Files:**
- Modify: `docs/FEATURES.md`
- Modify: `frontend/docs/FEATURES.md`

- [ ] **Step 1: Append prompt-test section**

In both `FEATURES.md` files, add a new section after the Coding Test section:

```markdown
## 5. Prompt Engineering Test

A third independent candidate test that evaluates prompt-engineering skill.
Admin assigns a single scenario — either manually authored from the Prompt
Problems library, or AI-generated personally for the candidate using their
resume + screening summary + tech stack. The candidate writes a prompt,
optionally previews the LLM output up to 5 times, then submits. The backend
runs a 3-step evaluation:

1. **Rubric score (0–50)** — AI grades the prompt against a default rubric
   (clarity, role/context, output format, examples, edge-case handling) plus
   any scenario-specific criteria the admin added.
2. **Execution** — the candidate's prompt is run against the sample input by
   the Gemini→Groq chain.
3. **Output score (0–50)** — AI checks the produced output against the
   expected criteria.

Total score 0–100, with full breakdown shown to the admin (per-criterion
notes, execution output, AI provider used). Re-evaluation can be triggered
manually if the AI pipeline fails.

Coexists with MCQ and Coding tests — admin can send any combination.
```

- [ ] **Step 2: Commit**

```bash
git add docs/FEATURES.md frontend/docs/FEATURES.md
git commit -m "docs(prompt-test): add Prompt Engineering Test section to FEATURES.md"
```

---

## Task 23: End-to-end smoke test

- [ ] **Step 1: Start backend**

Run: `cd backend && npm run dev`
Expected: server starts, no route registration errors.

- [ ] **Step 2: Start frontend**

Run: `cd frontend && npm run dev`

- [ ] **Step 3: Admin flow**

1. Log in as admin.
2. Navigate to **Prompt Problems** → create a manual problem with title/description/sampleInput/criteria.
3. Navigate to a candidate detail page → click **Assign Prompt Test** → **Pick from library** → pick the problem → **Assign**.
4. Verify the candidate received an email (check mail server logs or use Mailtrap).
5. Verify `candidate.promptTest.sentAt` is set (check the panel).

- [ ] **Step 4: Candidate flow**

1. Open the email link / paste the URL `/prompt-test/<token>`.
2. Read the scenario + sample input.
3. Write a prompt.
4. Click **▶ Try it** — verify output renders, runsRemaining decrements.
5. Click **Submit & Finish** — verify "Submitted" page.

- [ ] **Step 5: Admin review**

1. Refresh candidate detail page.
2. Wait ~5–15s for the evaluation to finish.
3. Verify **Prompt Test** panel shows: total score, rubric breakdown, execution output, output criteria pass/fail.

- [ ] **Step 6: AI-generated path**

1. On candidate detail, click **Assign Prompt Test** → **Generate with AI** → optionally set topic/difficulty → **Generate**.
2. Verify AI returns a draft tailored to the candidate's resume/skills.
3. Edit any field.
4. **Save & Assign** → verify candidate gets a new email.

- [ ] **Step 7: Commit (if any tweaks made)**

```bash
git add -A
git commit -m "chore(prompt-test): smoke-test fixes"
```

---

## Implementation order summary

Backend foundation (Tasks 1–3) → AI services (Tasks 4–5) → Orchestration (Task 6) → Validators/email/rate (Tasks 7–9) → Routes (Tasks 10–13) → Frontend foundation (Tasks 14–15) → Pages (Tasks 16–19) → Wiring (Tasks 20–21) → Docs + smoke test (Tasks 22–23).
