# Phase 5 — Coding Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coding-test layer to Round 1: HR-managed problem bank (with AI drafting help) → send link → candidate solves in Monaco editor with JS/Python/PHP → backend runs test cases via Piston public API → HR rates each problem and manually Shortlists or Rejects.

**Architecture:** Two new collections (`CodingProblem`, `CodingSubmission`) and a sub-doc on `Candidate.codingTest`. New backend services: `codingProblemService`, `codingProblemAiService`, `codingExecutionService` (Piston client), `codingSubmissionService`. One MCQ-flow tweak (auto-shortlist suppression when a coding test is pending). Frontend gets an admin "Coding Problems" page, a public `/coding-test/:token` page with Monaco editor and anti-cheat, and a "Coding Test" panel on the existing candidate detail page.

**Tech Stack:** Node.js, Express, Mongoose, Joi, Jest. React + Redux Toolkit, Vite, SCSS. Adds `@monaco-editor/react` (frontend) and uses Piston's public API at `https://emkc.org/api/v2/piston/execute` (no key, no signup, no new backend dep — built-in `fetch`).

**Spec reference:** [`docs/superpowers/specs/2026-05-12-phase-5-coding-test-design.md`](../specs/2026-05-12-phase-5-coding-test-design.md)

---

## File structure

### Backend — new files
- `backend/src/models/CodingProblem.js`
- `backend/src/models/CodingSubmission.js`
- `backend/src/repositories/codingProblemRepository.js`
- `backend/src/repositories/codingSubmissionRepository.js`
- `backend/src/services/codingProblemService.js`
- `backend/src/services/codingProblemAiService.js`
- `backend/src/services/codingExecutionService.js`
- `backend/src/services/codingSubmissionService.js`
- `backend/src/controllers/codingProblemController.js`
- `backend/src/controllers/codingSubmissionController.js`
- `backend/src/controllers/codingTestPublicController.js`
- `backend/src/routes/codingProblemRoutes.js`
- `backend/src/routes/codingSubmissionRoutes.js`
- `backend/src/routes/codingTestPublicRoutes.js`
- `backend/src/validators/codingProblemValidator.js`
- `backend/src/validators/codingSubmissionValidator.js`
- `backend/src/templates/codingTestInviteEmail.js`
- `backend/src/templates/codingSubmissionReceivedEmail.js`
- `backend/tests/unit/codingProblemService.test.js`
- `backend/tests/unit/codingProblemAiService.test.js`
- `backend/tests/unit/codingExecutionService.test.js`
- `backend/tests/unit/codingSubmissionService.test.js`

### Backend — modified files
- `backend/src/models/Candidate.js` — add `codingTest` sub-doc
- `backend/src/services/candidateService.js` — add `sendCodingTest`, `regenerateCodingTest`, `resendCodingTest`; extend `presentCandidate` to include `codingTest`
- `backend/src/services/submissionService.js` — auto-shortlist suppression check
- `backend/src/services/emailService.js` — register 2 new send functions
- `backend/src/controllers/candidateController.js` — 3 new handlers (send/regenerate/resend coding test)
- `backend/src/routes/candidateRoutes.js` — wire 3 new endpoints
- `backend/src/validators/candidateValidator.js` — new schema for send-coding-test body
- `backend/src/routes/index.js` — mount `/coding-problems`, `/coding-submissions`, `/coding-test`

### Frontend — new files
- `frontend/src/api/codingProblemApi.js`
- `frontend/src/api/codingTestApi.js`
- `frontend/src/api/codingSubmissionApi.js`
- `frontend/src/features/codingProblems/codingProblemsSlice.js`
- `frontend/src/features/codingProblems/CodingProblemListPage.jsx`
- `frontend/src/features/codingProblems/CodingProblemListPage.scss`
- `frontend/src/features/codingProblems/CodingProblemFormModal.jsx`
- `frontend/src/features/codingProblems/CodingProblemFormModal.scss`
- `frontend/src/features/codingTest/codingTestSlice.js`
- `frontend/src/features/codingTest/CodingTestPage.jsx`
- `frontend/src/features/codingTest/CodingTestPage.scss`
- `frontend/src/features/codingTest/CodingTestSuccessPage.jsx`
- `frontend/src/features/candidates/CodingTestPanel.jsx`
- `frontend/src/features/candidates/CodingTestPanel.scss`
- `frontend/src/features/candidates/SendCodingTestModal.jsx`

### Frontend — modified files
- `frontend/package.json` — add `@monaco-editor/react`
- `frontend/src/app/store.js` — register `codingProblems`, `codingTest` slices
- `frontend/src/routes/AppRoutes.jsx` — register `/coding-problems` (admin) and `/coding-test/:token` (public)
- `frontend/src/layouts/AdminLayout.jsx` — add "Coding Problems" nav entry
- `frontend/src/api/candidateApi.js` — add `sendCodingTest`, `regenerateCodingTest`, `resendCodingTest`
- `frontend/src/features/candidates/CandidateDetailPage.jsx` — render `<CodingTestPanel>` + Send Coding Test button

---

# Phase A — Coding Problem bank (backend)

## Task A1: Add `CodingProblem` model

**Files:**
- Create: `backend/src/models/CodingProblem.js`

- [ ] **Step 1: Create the model**

```js
'use strict';

const mongoose = require('mongoose');

const testCaseSchema = new mongoose.Schema(
  {
    stdin: { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    isHidden: { type: Boolean, default: true },
  },
  { _id: false },
);

const codingProblemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 10000 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
    techStack: {
      type: [String],
      required: true,
      validate: { validator: (a) => Array.isArray(a) && a.length > 0, message: 'At least one tech stack required' },
    },
    supportedLanguages: {
      type: [String],
      enum: ['js', 'python', 'php'],
      required: true,
      validate: { validator: (a) => Array.isArray(a) && a.length > 0, message: 'At least one supported language required' },
    },
    starterCode: {
      js: { type: String, default: '' },
      python: { type: String, default: '' },
      php: { type: String, default: '' },
    },
    testCases: { type: [testCaseSchema], default: [] },
    source: { type: String, enum: ['manual', 'ai'], default: 'manual', index: true },
    isActive: { type: Boolean, default: true, index: true },
    timesUsed: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

codingProblemSchema.index({ techStack: 1, difficulty: 1, isActive: 1 });
codingProblemSchema.index({ source: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model('CodingProblem', codingProblemSchema);
```

- [ ] **Step 2: Commit**

```bash
git -C backend add src/models/CodingProblem.js
git -C backend commit -m "feat: add CodingProblem model"
```

---

## Task A2: Add `codingProblemRepository`

**Files:**
- Create: `backend/src/repositories/codingProblemRepository.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const CodingProblem = require('../models/CodingProblem');

const create = (data) => CodingProblem.create(data);

const findById = (id) => CodingProblem.findById(id);

const updateById = (id, update) =>
  CodingProblem.findByIdAndUpdate(id, update, { new: true });

const list = async ({ page = 1, limit = 20, search, difficulty, language, source, isActive } = {}) => {
  const filter = {};
  if (isActive !== undefined && isActive !== null) filter.isActive = isActive;
  if (difficulty) filter.difficulty = difficulty;
  if (source) filter.source = source;
  if (language) filter.supportedLanguages = language;
  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { techStack: rx }];
  }
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    CodingProblem.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    CodingProblem.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const sampleActive = ({ techStacks, difficulty, limit }) =>
  CodingProblem.find({
    isActive: true,
    techStack: { $in: techStacks },
    difficulty,
  })
    .sort({ timesUsed: 1, updatedAt: -1 })
    .limit(limit);

const incrementTimesUsed = (ids) =>
  CodingProblem.updateMany({ _id: { $in: ids } }, { $inc: { timesUsed: 1 } });

module.exports = { create, findById, updateById, list, sampleActive, incrementTimesUsed };
```

- [ ] **Step 2: Commit**

```bash
git -C backend add src/repositories/codingProblemRepository.js
git -C backend commit -m "feat: add codingProblemRepository"
```

---

## Task A3: Add Joi validators

**Files:**
- Create: `backend/src/validators/codingProblemValidator.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const testCaseField = Joi.object({
  stdin: Joi.string().allow('').max(5000).default(''),
  expectedStdout: Joi.string().allow('').max(5000).default(''),
  isHidden: Joi.boolean().default(true),
});

const baseFields = {
  title: Joi.string().min(2).max(200).required(),
  description: Joi.string().min(10).max(10000).required(),
  difficulty: Joi.string().valid('easy', 'medium', 'hard').required(),
  techStack: Joi.array().items(Joi.string().lowercase().min(1).max(60)).min(1).required(),
  supportedLanguages: Joi.array().items(Joi.string().valid('js', 'python', 'php')).min(1).required(),
  starterCode: Joi.object({
    js: Joi.string().allow('').max(20000).default(''),
    python: Joi.string().allow('').max(20000).default(''),
    php: Joi.string().allow('').max(20000).default(''),
  }).default({}),
  testCases: Joi.array().items(testCaseField).min(1).max(20).required(),
};

const createSchema = { body: Joi.object(baseFields) };

const updateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    ...baseFields,
    title: baseFields.title.optional(),
    description: baseFields.description.optional(),
    difficulty: baseFields.difficulty.optional(),
    techStack: baseFields.techStack.optional(),
    supportedLanguages: baseFields.supportedLanguages.optional(),
    testCases: baseFields.testCases.optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),
};

const idParamSchema = { params: Joi.object({ id: objectId.required() }) };

const listSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().trim().max(120).empty('').optional(),
    difficulty: Joi.string().valid('easy', 'medium', 'hard').empty('').optional(),
    language: Joi.string().valid('js', 'python', 'php').empty('').optional(),
    source: Joi.string().valid('manual', 'ai').empty('').optional(),
    isActive: Joi.boolean().empty('').optional(),
  }),
};

const aiStarterCodeSchema = {
  body: Joi.object({
    description: Joi.string().min(10).max(10000).required(),
    language: Joi.string().valid('js', 'python', 'php').required(),
  }),
};

const aiFullProblemSchema = {
  body: Joi.object({
    topic: Joi.string().min(2).max(200).required(),
    difficulty: Joi.string().valid('easy', 'medium', 'hard').required(),
    languages: Joi.array().items(Joi.string().valid('js', 'python', 'php')).min(1).required(),
  }),
};

module.exports = {
  createSchema, updateSchema, idParamSchema, listSchema,
  aiStarterCodeSchema, aiFullProblemSchema,
};
```

- [ ] **Step 2: Commit**

```bash
git -C backend add src/validators/codingProblemValidator.js
git -C backend commit -m "feat: add coding-problem validators"
```

---

## Task A4: Add `codingProblemAiService` with tests

**Files:**
- Create: `backend/src/services/codingProblemAiService.js`
- Create: `backend/tests/unit/codingProblemAiService.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/unit/codingProblemAiService.test.js
'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/services/aiService', () => ({
  askWithFallback: jest.fn(),
  extractJson: jest.fn(),
}));

const aiService = require('../../src/services/aiService');
const codingAi = require('../../src/services/codingProblemAiService');

describe('codingProblemAiService.generateStarterCode', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns code string on success', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'def solve():\n    pass', provider: 'gemini', model: 'gemini-2.5-flash' });
    const result = await codingAi.generateStarterCode({ description: 'sum n nums', language: 'python' });
    expect(result).toContain('def solve');
  });

  test('returns null when AI text is null', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const result = await codingAi.generateStarterCode({ description: 'x', language: 'python' });
    expect(result).toBeNull();
  });
});

describe('codingProblemAiService.generateFullProblem', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed problem when AI returns valid JSON', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: '{}', provider: 'gemini', model: 'gemini-2.5-flash' });
    aiService.extractJson.mockReturnValue({
      title: 'Sum of N',
      description: 'add em up',
      starterCode: { js: 'function s(){}', python: 'def s():\n    pass', php: '<?php ?>' },
      testCases: [{ stdin: '1 2', expectedStdout: '3', isHidden: false }],
    });
    const result = await codingAi.generateFullProblem({ topic: 'arrays', difficulty: 'easy', languages: ['js','python','php'] });
    expect(result.title).toBe('Sum of N');
    expect(result.testCases).toHaveLength(1);
  });

  test('returns null when AI fails', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const result = await codingAi.generateFullProblem({ topic: 'x', difficulty: 'easy', languages: ['js'] });
    expect(result).toBeNull();
  });

  test('returns null when JSON parse fails', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'nope' });
    aiService.extractJson.mockReturnValue(null);
    const result = await codingAi.generateFullProblem({ topic: 'x', difficulty: 'easy', languages: ['js'] });
    expect(result).toBeNull();
  });

  test('returns null when required fields missing', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: '{}' });
    aiService.extractJson.mockReturnValue({ title: 'x' }); // missing description, testCases
    const result = await codingAi.generateFullProblem({ topic: 'x', difficulty: 'easy', languages: ['js'] });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

`cd backend && npx jest tests/unit/codingProblemAiService.test.js`
Expected: FAIL ("Cannot find module .../codingProblemAiService").

- [ ] **Step 3: Create the service**

```js
// backend/src/services/codingProblemAiService.js
'use strict';

const aiService = require('./aiService');
const logger = require('../config/logger');

const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };

const buildStarterCodePrompt = ({ description, language }) =>
  `Given this coding problem:

"""${description}"""

Generate ONLY the starter code for ${LANG_LABEL[language]} as a self-contained program that:
- Reads input from stdin
- Includes parsing scaffolding for typical inputs
- Has a clearly-marked "// your code here" (or equivalent) placeholder where the candidate writes their solution
- Prints output to stdout

Output ONLY the code with no commentary, no markdown fences, no explanation.`;

const buildFullProblemPrompt = ({ topic, difficulty, languages }) => `Generate a coding interview problem.

Requirements:
- topic: ${topic}
- difficulty: ${difficulty}
- supported languages: ${languages.join(', ')}

Output ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{
  "title": "<short problem name>",
  "description": "<markdown problem statement, includes sample input/output>",
  "starterCode": {
${languages.map((l) => `    "${l}": "<self-contained starter code for ${LANG_LABEL[l]} that reads stdin, parses input, and prints output>"`).join(',\n')}
  },
  "testCases": [
    { "stdin": "<input>", "expectedStdout": "<expected output>", "isHidden": false },
    { "stdin": "<input>", "expectedStdout": "<expected output>", "isHidden": true }
  ]
}

Include 3-5 test cases, with the first 1-2 visible (isHidden: false) as samples for the candidate.`;

const generateStarterCode = async ({ description, language }) => {
  const prompt = buildStarterCodePrompt({ description, language });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('AI starter-code generation failed (no text)');
    return null;
  }
  // Strip markdown fences if any
  const stripped = text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/```\s*$/m, '').trim();
  logger.info('AI starter-code generated', { provider, model, language });
  return stripped;
};

const generateFullProblem = async ({ topic, difficulty, languages }) => {
  const prompt = buildFullProblemPrompt({ topic, difficulty, languages });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('AI full-problem generation failed (no text)');
    return null;
  }
  const parsed = aiService.extractJson(text);
  if (!parsed || !parsed.title || !parsed.description || !Array.isArray(parsed.testCases) || parsed.testCases.length === 0) {
    logger.warn('AI full-problem JSON invalid or incomplete');
    return null;
  }
  const starterCode = { js: '', python: '', php: '' };
  for (const lang of languages) {
    if (parsed.starterCode?.[lang]) starterCode[lang] = String(parsed.starterCode[lang]);
  }
  const testCases = parsed.testCases.slice(0, 10).map((tc) => ({
    stdin: String(tc.stdin || ''),
    expectedStdout: String(tc.expectedStdout || ''),
    isHidden: tc.isHidden !== false,
  }));
  logger.info('AI full-problem generated', { provider, model, topic, difficulty });
  return {
    title: String(parsed.title).slice(0, 200),
    description: String(parsed.description).slice(0, 10000),
    difficulty,
    supportedLanguages: languages,
    starterCode,
    testCases,
  };
};

module.exports = { generateStarterCode, generateFullProblem, buildStarterCodePrompt, buildFullProblemPrompt };
```

- [ ] **Step 4: Run test, verify PASS**

`cd backend && npx jest tests/unit/codingProblemAiService.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C backend add src/services/codingProblemAiService.js tests/unit/codingProblemAiService.test.js
git -C backend commit -m "feat: add codingProblemAiService for starter-code + full-problem drafts"
```

---

## Task A5: Add `codingProblemService` (CRUD + sampling) with tests

**Files:**
- Create: `backend/src/services/codingProblemService.js`
- Create: `backend/tests/unit/codingProblemService.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// backend/tests/unit/codingProblemService.test.js
'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/codingProblemRepository');
jest.mock('../../src/services/codingProblemAiService', () => ({
  generateFullProblem: jest.fn(),
}));

const cpService = require('../../src/services/codingProblemService');
const cpRepo = require('../../src/repositories/codingProblemRepository');
const cpAi = require('../../src/services/codingProblemAiService');

describe('codingProblemService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates problem with createdBy stamp', async () => {
    cpRepo.create.mockResolvedValue({ id: 'p1', title: 'T' });
    const result = await cpService.create({ title: 'T', techStack: ['react'] }, 'admin1');
    expect(cpRepo.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'T', createdBy: 'admin1' }));
    expect(result.id).toBe('p1');
  });
});

describe('codingProblemService.deactivate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('soft-deletes by setting isActive=false', async () => {
    cpRepo.findById.mockResolvedValue({ id: 'p1', isActive: true });
    cpRepo.updateById.mockResolvedValue({ id: 'p1', isActive: false });
    await cpService.deactivate('p1');
    expect(cpRepo.updateById).toHaveBeenCalledWith('p1', { isActive: false });
  });

  test('404 when not found', async () => {
    cpRepo.findById.mockResolvedValue(null);
    await expect(cpService.deactivate('p1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('codingProblemService.sampleForCandidate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns problems from bank when enough exist', async () => {
    const bank = [
      { id: 'p1', _id: 'p1', title: 'A' },
      { id: 'p2', _id: 'p2', title: 'B' },
    ];
    cpRepo.sampleActive.mockResolvedValue(bank);
    cpRepo.incrementTimesUsed.mockResolvedValue();
    const result = await cpService.sampleForCandidate({
      techStacks: ['react'], difficulty: 'easy', problemCount: 2, adminId: 'admin1',
    });
    expect(result).toHaveLength(2);
    expect(cpAi.generateFullProblem).not.toHaveBeenCalled();
    expect(cpRepo.incrementTimesUsed).toHaveBeenCalledWith(['p1', 'p2']);
  });

  test('AI-fills missing problems when bank short', async () => {
    cpRepo.sampleActive.mockResolvedValue([{ id: 'p1', _id: 'p1', title: 'A' }]);
    cpAi.generateFullProblem.mockResolvedValue({
      title: 'AI Problem', description: 'd', difficulty: 'easy',
      supportedLanguages: ['js', 'python', 'php'], starterCode: { js: '', python: '', php: '' },
      testCases: [{ stdin: '', expectedStdout: '', isHidden: true }],
    });
    cpRepo.create.mockResolvedValue({ id: 'ai1', _id: 'ai1', title: 'AI Problem' });
    cpRepo.incrementTimesUsed.mockResolvedValue();
    const result = await cpService.sampleForCandidate({
      techStacks: ['react'], difficulty: 'easy', problemCount: 2, adminId: 'admin1',
    });
    expect(result).toHaveLength(2);
    expect(cpAi.generateFullProblem).toHaveBeenCalledTimes(1);
    expect(cpRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'AI Problem', source: 'ai', techStack: ['react'], createdBy: 'admin1',
    }));
  });

  test('throws E_NO_PROBLEMS when bank empty and AI fails', async () => {
    cpRepo.sampleActive.mockResolvedValue([]);
    cpAi.generateFullProblem.mockResolvedValue(null);
    await expect(cpService.sampleForCandidate({
      techStacks: ['rust'], difficulty: 'hard', problemCount: 1, adminId: 'admin1',
    })).rejects.toMatchObject({ code: 'E_NO_PROBLEMS' });
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

`cd backend && npx jest tests/unit/codingProblemService.test.js`
Expected: FAIL.

- [ ] **Step 3: Create the service**

```js
// backend/src/services/codingProblemService.js
'use strict';

const cpRepo = require('../repositories/codingProblemRepository');
const codingAi = require('./codingProblemAiService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const present = (doc) => ({
  id: doc.id || String(doc._id),
  title: doc.title,
  description: doc.description,
  difficulty: doc.difficulty,
  techStack: doc.techStack,
  supportedLanguages: doc.supportedLanguages,
  starterCode: doc.starterCode || { js: '', python: '', php: '' },
  testCases: doc.testCases || [],
  source: doc.source,
  isActive: doc.isActive,
  timesUsed: doc.timesUsed || 0,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const create = async (payload, adminId) => {
  const doc = await cpRepo.create({ ...payload, createdBy: adminId });
  return present(doc);
};

const detail = async (id) => {
  const doc = await cpRepo.findById(id);
  if (!doc) throw ApiError.notFound('Problem not found');
  return present(doc);
};

const update = async (id, updates) => {
  const doc = await cpRepo.findById(id);
  if (!doc) throw ApiError.notFound('Problem not found');
  const updated = await cpRepo.updateById(id, updates);
  return present(updated);
};

const deactivate = async (id) => {
  const doc = await cpRepo.findById(id);
  if (!doc) throw ApiError.notFound('Problem not found');
  const updated = await cpRepo.updateById(id, { isActive: false });
  return present(updated);
};

const list = async (query) => {
  const result = await cpRepo.list(query);
  return { ...result, items: result.items.map(present) };
};

const sampleForCandidate = async ({ techStacks, difficulty, problemCount, adminId }) => {
  const bank = await cpRepo.sampleActive({ techStacks, difficulty, limit: problemCount });
  const picked = [...bank];
  const stillNeed = problemCount - picked.length;

  if (stillNeed > 0) {
    const primaryStack = techStacks[0];
    for (let i = 0; i < stillNeed; i += 1) {
      const draft = await codingAi.generateFullProblem({
        topic: primaryStack,
        difficulty,
        languages: ['js', 'python', 'php'],
      });
      if (!draft) {
        if (picked.length === 0) {
          throw ApiError.conflict(
            'No coding problems available and AI generation failed',
            { code: 'E_NO_PROBLEMS' },
          );
        }
        // Partial success: return what we have rather than failing the whole request
        logger.warn('AI generation failed during sampling — returning partial set', {
          requested: problemCount, actual: picked.length,
        });
        break;
      }
      const saved = await cpRepo.create({
        ...draft,
        techStack: [primaryStack],
        source: 'ai',
        createdBy: adminId,
        timesUsed: 1,
      });
      picked.push(saved);
    }
  }

  if (picked.length > 0) {
    const bankIds = bank.map((p) => p._id || p.id);
    if (bankIds.length > 0) await cpRepo.incrementTimesUsed(bankIds);
  }
  return picked.map(present);
};

module.exports = { create, detail, update, deactivate, list, sampleForCandidate, present };
```

- [ ] **Step 4: Run test, verify PASS**

`cd backend && npx jest tests/unit/codingProblemService.test.js`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C backend add src/services/codingProblemService.js tests/unit/codingProblemService.test.js
git -C backend commit -m "feat: add codingProblemService with sampling + AI fallback"
```

---

## Task A6: Add controller + routes

**Files:**
- Create: `backend/src/controllers/codingProblemController.js`
- Create: `backend/src/routes/codingProblemRoutes.js`
- Modify: `backend/src/routes/index.js`

- [ ] **Step 1: Create the controller**

```js
// backend/src/controllers/codingProblemController.js
'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const cpService = require('../services/codingProblemService');
const cpAi = require('../services/codingProblemAiService');
const ApiError = require('../utils/ApiError');

const createProblem = asyncHandler(async (req, res) => {
  const p = await cpService.create(req.body, req.admin.id);
  return created(res, p, 'Coding problem created');
});

const listProblems = asyncHandler(async (req, res) => {
  const result = await cpService.list(req.query);
  return ok(res, result);
});

const getProblem = asyncHandler(async (req, res) => {
  const p = await cpService.detail(req.params.id);
  return ok(res, p);
});

const updateProblem = asyncHandler(async (req, res) => {
  const p = await cpService.update(req.params.id, req.body);
  return ok(res, p, 'Coding problem updated');
});

const deactivateProblem = asyncHandler(async (req, res) => {
  const p = await cpService.deactivate(req.params.id);
  return ok(res, p, 'Coding problem deactivated');
});

const aiStarterCode = asyncHandler(async (req, res) => {
  const { description, language } = req.body;
  const code = await cpAi.generateStarterCode({ description, language });
  if (!code) throw ApiError.serviceUnavailable('AI providers unavailable', { code: 'E_AI_UNAVAILABLE' });
  return ok(res, { code });
});

const aiFullProblem = asyncHandler(async (req, res) => {
  const draft = await cpAi.generateFullProblem(req.body);
  if (!draft) throw ApiError.serviceUnavailable('AI providers unavailable', { code: 'E_AI_UNAVAILABLE' });
  return ok(res, draft);
});

module.exports = {
  createProblem, listProblems, getProblem, updateProblem, deactivateProblem,
  aiStarterCode, aiFullProblem,
};
```

- [ ] **Step 2: Check `ApiError.serviceUnavailable` exists**

```bash
grep -n "serviceUnavailable\|static " backend/src/utils/ApiError.js
```

If `serviceUnavailable` is **not** defined, add it. Open `backend/src/utils/ApiError.js` and add this static method alongside the other helpers (e.g., after `gone`):

```js
static serviceUnavailable(message = 'Service unavailable', opts = {}) {
  return new ApiError(503, message, opts);
}
```

- [ ] **Step 3: Create the routes file**

```js
// backend/src/routes/codingProblemRoutes.js
'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/codingProblemController');
const {
  createSchema, updateSchema, idParamSchema, listSchema,
  aiStarterCodeSchema, aiFullProblemSchema,
} = require('../validators/codingProblemValidator');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.post('/', validate(createSchema), ctrl.createProblem);
router.get('/', validate(listSchema), ctrl.listProblems);
router.post('/ai/starter-code', validate(aiStarterCodeSchema), ctrl.aiStarterCode);
router.post('/ai/full-problem', validate(aiFullProblemSchema), ctrl.aiFullProblem);
router.get('/:id', validate(idParamSchema), ctrl.getProblem);
router.patch('/:id', validate(updateSchema), ctrl.updateProblem);
router.delete('/:id', validate(idParamSchema), ctrl.deactivateProblem);

module.exports = router;
```

- [ ] **Step 4: Mount in `backend/src/routes/index.js`**

Add alongside existing route imports:

```js
const codingProblemRoutes = require('./codingProblemRoutes');
```

And the mount alongside other `router.use(...)` calls:

```js
router.use('/coding-problems', codingProblemRoutes);
```

- [ ] **Step 5: Smoke-check**

```bash
cd backend && node -e "require('./src/routes')" && echo OK
```
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git -C backend add src/controllers/codingProblemController.js src/routes/codingProblemRoutes.js src/routes/index.js src/utils/ApiError.js
git -C backend commit -m "feat: wire /coding-problems routes + controller"
```

---

# Phase B — Sending the coding test (backend)

## Task B1: Add `codingTest` sub-doc to Candidate model

**Files:**
- Modify: `backend/src/models/Candidate.js`

- [ ] **Step 1: Add the sub-doc**

In `backend/src/models/Candidate.js`, just before the `createdBy` field, add:

```js
    codingTest: {
      token: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      problems: { type: [mongoose.Schema.Types.ObjectId], ref: 'CodingProblem', default: undefined },
      problemCount: { type: Number, default: null, min: 1, max: 5 },
      durationMinutes: { type: Number, default: null, min: 1, max: 240 },
      difficulty: { type: String, enum: ['easy', 'medium', 'hard', null], default: null },
      sentAt: { type: Date, default: null },
      firstOpenedAt: { type: Date, default: null },
      submittedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      outcome: {
        type: String,
        enum: ['pending_review', 'shortlisted', 'rejected', null],
        default: null,
      },
    },
```

- [ ] **Step 2: Smoke-check**

```bash
cd backend && node -e "require('./src/models/Candidate'); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 3: Run all tests**

```bash
cd backend && npm test --silent 2>&1 | tail -6
```
Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git -C backend add src/models/Candidate.js
git -C backend commit -m "feat: add codingTest sub-doc to Candidate"
```

---

## Task B2: Add candidate invite email template + register sender

**Files:**
- Create: `backend/src/templates/codingTestInviteEmail.js`
- Modify: `backend/src/services/emailService.js`

- [ ] **Step 1: Create the template**

```js
// backend/src/templates/codingTestInviteEmail.js
'use strict';

const buildCodingTestInviteHtml = ({ candidate, codingTestUrl, problemCount, durationMinutes }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#2563eb">Your coding challenge is ready</h2>
  <p>Hi ${candidate.name},</p>
  <p>As part of your application for the <strong>${(candidate.techStack || []).join(', ')}</strong> role, please complete this coding challenge.</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Problems</td><td><strong>${problemCount}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Duration</td><td><strong>${durationMinutes} minutes</strong> total</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Languages</td><td>JavaScript, Python, or PHP (your choice per problem)</td></tr>
  </table>
  <p><a href="${codingTestUrl}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">Open coding test</a></p>
  <p style="color:#6b7280;font-size:13px">Note: pasting is disabled in the editor and tab-switching is monitored. The timer starts the moment you open the link. Good luck!</p>
  <p>Best regards,<br/>The Hiring Team</p>
</body></html>`;

const buildCodingTestInviteText = ({ candidate, codingTestUrl, problemCount, durationMinutes }) =>
  `Hi ${candidate.name},

Your coding challenge is ready.

Problems: ${problemCount}
Duration: ${durationMinutes} minutes total
Languages: JavaScript, Python, or PHP (your choice per problem)

Open: ${codingTestUrl}

Note: pasting is disabled in the editor and tab-switching is monitored. The timer starts the moment you open the link.

Best regards,
The Hiring Team`;

module.exports = { buildCodingTestInviteHtml, buildCodingTestInviteText };
```

- [ ] **Step 2: Register in `emailService.js`**

In `backend/src/services/emailService.js`, alongside other template imports:

```js
const { buildCodingTestInviteHtml, buildCodingTestInviteText } = require('../templates/codingTestInviteEmail');
```

Add a new send function near other candidate-facing senders:

```js
const sendCodingTestInvite = async ({ candidate, codingTestUrl, problemCount, durationMinutes }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const subject = `Your coding challenge is ready — ${(candidate.techStack || []).join(', ')}`;
  const html = buildCodingTestInviteHtml({ candidate, codingTestUrl, problemCount, durationMinutes });
  const text = buildCodingTestInviteText({ candidate, codingTestUrl, problemCount, durationMinutes });
  const info = await transporter.sendMail({
    from: env.smtp.from,
    to: candidate.email,
    subject, text, html,
  });
  logger.info('Coding test invite sent', { messageId: info.messageId, candidate: candidate.id });
  return info;
};
```

Add `sendCodingTestInvite` to `module.exports`.

- [ ] **Step 3: Smoke-check**

```bash
cd backend && node -e "const e=require('./src/services/emailService'); console.log(typeof e.sendCodingTestInvite)"
```
Expected: `function`.

- [ ] **Step 4: Commit**

```bash
git -C backend add src/templates/codingTestInviteEmail.js src/services/emailService.js
git -C backend commit -m "feat: add coding-test invite email template + sender"
```

---

## Task B3: Add `sendCodingTest`, `regenerateCodingTest`, `resendCodingTest` to candidateService

**Files:**
- Modify: `backend/src/services/candidateService.js`

- [ ] **Step 1: Add imports + helpers**

At the top of `backend/src/services/candidateService.js`, add alongside existing imports:

```js
const codingProblemService = require('./codingProblemService');
```

After the existing `buildTestUrl` helper, add:

```js
const buildCodingTestUrl = (token) => {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/coding-test/${token}`;
};

const CODING_TEST_EXPIRY_HOURS = 24;
```

- [ ] **Step 2: Extend `presentCandidate` to include `codingTest`**

Find the `presentCandidate` function (around line 24). Add a `codingTest` field to its returned object:

```js
  codingTest: candidate.codingTest?.sentAt
    ? {
        sentAt: candidate.codingTest.sentAt,
        firstOpenedAt: candidate.codingTest.firstOpenedAt || null,
        submittedAt: candidate.codingTest.submittedAt || null,
        reviewedAt: candidate.codingTest.reviewedAt || null,
        outcome: candidate.codingTest.outcome || null,
        problemCount: candidate.codingTest.problemCount,
        durationMinutes: candidate.codingTest.durationMinutes,
        difficulty: candidate.codingTest.difficulty,
        expiresAt: candidate.codingTest.expiresAt,
        problems: candidate.codingTest.problems || [],
        codingTestUrl: candidate.codingTest.token ? buildCodingTestUrl(candidate.codingTest.token) : null,
      }
    : null,
```

Add this alongside other fields. Place it next to `screening`.

- [ ] **Step 3: Add the three new service functions**

After `sendTest` (or wherever fits), add:

```js
const sendCodingTest = async (id, { problemCount = 1, durationMinutes = 30, difficulty = 'medium' }, adminId) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.codingTest?.sentAt && !candidate.codingTest?.submittedAt) {
    const expired = candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now();
    if (!expired) {
      throw ApiError.conflict(
        'Coding test already sent — use regenerate to issue a new link',
        { code: 'E_CODING_TEST_ALREADY_SENT' },
      );
    }
  }
  const sampled = await codingProblemService.sampleForCandidate({
    techStacks: candidate.techStack,
    difficulty,
    problemCount,
    adminId,
  });
  const { token, expiresAt } = generateTestToken({ minutes: 60 * CODING_TEST_EXPIRY_HOURS });
  candidate.codingTest = {
    token,
    expiresAt,
    problems: sampled.map((p) => p.id),
    problemCount,
    durationMinutes,
    difficulty,
    sentAt: new Date(),
    firstOpenedAt: null,
    submittedAt: null,
    reviewedAt: null,
    outcome: null,
  };
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendCodingTestInvite({
        candidate: presented,
        codingTestUrl: presented.codingTest.codingTestUrl,
        problemCount,
        durationMinutes,
      });
    } catch (err) {
      logger.error('Coding test invite email failed', { candidateId: id, err: err.message });
    }
  });
  return presented;
};

const regenerateCodingTest = async (id, adminId) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.codingTest?.sentAt) {
    throw ApiError.conflict('No coding test to regenerate', { code: 'E_NO_CODING_TEST' });
  }
  const { token, expiresAt } = generateTestToken({ minutes: 60 * CODING_TEST_EXPIRY_HOURS });
  candidate.codingTest.token = token;
  candidate.codingTest.expiresAt = expiresAt;
  candidate.codingTest.firstOpenedAt = null;
  candidate.codingTest.submittedAt = null;
  candidate.codingTest.reviewedAt = null;
  candidate.codingTest.outcome = null;
  candidate.codingTest.sentAt = new Date();
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendCodingTestInvite({
        candidate: presented,
        codingTestUrl: presented.codingTest.codingTestUrl,
        problemCount: candidate.codingTest.problemCount,
        durationMinutes: candidate.codingTest.durationMinutes,
      });
    } catch (err) {
      logger.error('Coding test invite re-fire failed', { candidateId: id, err: err.message });
    }
  });
  return presented;
};

const resendCodingTest = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.codingTest?.sentAt) {
    throw ApiError.conflict('No coding test to resend', { code: 'E_NO_CODING_TEST' });
  }
  if (candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now()) {
    throw ApiError.conflict('Coding test link has expired — regenerate instead', { code: 'E_CODING_TEST_EXPIRED' });
  }
  const presented = presentCandidate(candidate);
  await emailService.sendCodingTestInvite({
    candidate: presented,
    codingTestUrl: presented.codingTest.codingTestUrl,
    problemCount: candidate.codingTest.problemCount,
    durationMinutes: candidate.codingTest.durationMinutes,
  });
  return { sentTo: presented.email };
};
```

- [ ] **Step 4: Export the new functions**

Add `sendCodingTest`, `regenerateCodingTest`, `resendCodingTest` to the `module.exports` block.

- [ ] **Step 5: Smoke-check + tests**

```bash
cd backend && node -e "const c=require('./src/services/candidateService'); console.log(typeof c.sendCodingTest, typeof c.regenerateCodingTest, typeof c.resendCodingTest)"
```
Expected: `function function function`.

```bash
cd backend && npm test --silent 2>&1 | tail -6
```
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git -C backend add src/services/candidateService.js
git -C backend commit -m "feat: send/regenerate/resend coding test actions on candidateService"
```

---

## Task B4: Wire candidate endpoints

**Files:**
- Modify: `backend/src/controllers/candidateController.js`
- Modify: `backend/src/validators/candidateValidator.js`
- Modify: `backend/src/routes/candidateRoutes.js`

- [ ] **Step 1: Add the body validator**

In `backend/src/validators/candidateValidator.js`, add this schema (alongside existing schemas):

```js
const objectId = Joi.string().hex().length(24);

const sendCodingTestSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    problemCount: Joi.number().integer().min(1).max(5).default(1),
    durationMinutes: Joi.number().integer().min(5).max(240).default(30),
    difficulty: Joi.string().valid('easy', 'medium', 'hard').default('medium'),
  }),
};
```

Add `sendCodingTestSchema` to `module.exports`.

- [ ] **Step 2: Add 3 controller handlers**

In `backend/src/controllers/candidateController.js`, near existing handlers:

```js
const sendCodingTest = asyncHandler(async (req, res) => {
  const c = await candidateService.sendCodingTest(req.params.id, req.body, req.admin.id);
  return ok(res, c, 'Coding test sent');
});

const regenerateCodingTest = asyncHandler(async (req, res) => {
  const c = await candidateService.regenerateCodingTest(req.params.id, req.admin.id);
  return ok(res, c, 'Coding test regenerated');
});

const resendCodingTest = asyncHandler(async (req, res) => {
  const result = await candidateService.resendCodingTest(req.params.id);
  return ok(res, result, 'Coding test invite re-sent');
});
```

Make sure these are exported (match the existing export style in the file — either `exports.x` or `module.exports = { x, ... }`).

- [ ] **Step 3: Wire routes**

In `backend/src/routes/candidateRoutes.js`, add (with the validator imports):

```js
const { sendCodingTestSchema } = require('../validators/candidateValidator');
```

(Or merge into existing destructure.)

Add the routes alongside other `/:id/...` routes:

```js
router.post('/:id/coding-test/send', validate(sendCodingTestSchema), candidateController.sendCodingTest);
router.post('/:id/coding-test/regenerate', validate(idParamSchema), candidateController.regenerateCodingTest);
router.post('/:id/coding-test/resend', validate(idParamSchema), candidateController.resendCodingTest);
```

- [ ] **Step 4: Smoke-check**

```bash
cd backend && node -e "require('./src/routes')" && echo OK
```
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git -C backend add src/controllers/candidateController.js src/validators/candidateValidator.js src/routes/candidateRoutes.js
git -C backend commit -m "feat: wire coding-test send/regenerate/resend endpoints"
```

---

# Phase C — Submission flow (backend)

## Task C1: Add `CodingSubmission` model + repository

**Files:**
- Create: `backend/src/models/CodingSubmission.js`
- Create: `backend/src/repositories/codingSubmissionRepository.js`

- [ ] **Step 1: Create the model**

```js
// backend/src/models/CodingSubmission.js
'use strict';

const mongoose = require('mongoose');

const runSchema = new mongoose.Schema(
  {
    stdin: { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    actualStdout: { type: String, default: '' },
    stderr: { type: String, default: '' },
    exitCode: { type: Number, default: null },
    runtimeMs: { type: Number, default: null },
    passed: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  { _id: false },
);

const codingSubmissionSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    codingTestToken: { type: String, required: true, index: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'CodingProblem', required: true },
    language: { type: String, enum: ['js', 'python', 'php'], required: true },
    code: { type: String, required: true, maxlength: 50000 },

    runs: { type: [runSchema], default: [] },
    passedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },

    rating: { type: Number, default: null, min: 1, max: 5 },
    reviewComment: { type: String, default: '', maxlength: 2000 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedAt: { type: Date, default: null },

    tabSwitches: { type: Number, default: 0, min: 0 },
    submittedAt: { type: Date, required: true },
    autoSubmitted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

codingSubmissionSchema.index({ candidate: 1, problem: 1 }, { unique: true });

module.exports = mongoose.model('CodingSubmission', codingSubmissionSchema);
```

- [ ] **Step 2: Create the repository**

```js
// backend/src/repositories/codingSubmissionRepository.js
'use strict';

const CodingSubmission = require('../models/CodingSubmission');

const create = (data) => CodingSubmission.create(data);

const findById = (id) =>
  CodingSubmission.findById(id).populate('problem');

const findByCandidate = (candidateId) =>
  CodingSubmission.find({ candidate: candidateId }).populate('problem').sort({ createdAt: 1 });

const findByCandidateAndProblem = (candidateId, problemId) =>
  CodingSubmission.findOne({ candidate: candidateId, problem: problemId });

const updateById = (id, update) =>
  CodingSubmission.findByIdAndUpdate(id, update, { new: true });

module.exports = { create, findById, findByCandidate, findByCandidateAndProblem, updateById };
```

- [ ] **Step 3: Commit**

```bash
git -C backend add src/models/CodingSubmission.js src/repositories/codingSubmissionRepository.js
git -C backend commit -m "feat: add CodingSubmission model + repository"
```

---

## Task C2: Add `codingExecutionService` (Piston client) with tests

**Files:**
- Create: `backend/src/services/codingExecutionService.js`
- Create: `backend/tests/unit/codingExecutionService.test.js`

- [ ] **Step 1: Write failing tests**

```js
// backend/tests/unit/codingExecutionService.test.js
'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const execService = require('../../src/services/codingExecutionService');

const okResponse = (run) => ({
  ok: true,
  json: jest.fn().mockResolvedValue({ language: 'python', version: '3.12', run }),
});

describe('codingExecutionService.runOne', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  test('returns stdout, stderr, exitCode from Piston', async () => {
    mockFetch.mockResolvedValue(okResponse({ stdout: 'hello\n', stderr: '', code: 0, signal: null, output: 'hello\n' }));
    const r = await execService.runOne({ language: 'python', code: 'print("hello")', stdin: '' });
    expect(r.stdout).toBe('hello\n');
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeNull();
  });

  test('returns error when Piston returns 5xx', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, text: jest.fn().mockResolvedValue('down') });
    const r = await execService.runOne({ language: 'python', code: 'x', stdin: '' });
    expect(r.error).toMatch(/piston/i);
    expect(r.stdout).toBe('');
  });

  test('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const r = await execService.runOne({ language: 'python', code: 'x', stdin: '' });
    expect(r.error).toMatch(/network/i);
  });
});

describe('codingExecutionService.runAllTestCases', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  test('aggregates results, marks pass/fail correctly', async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse({ stdout: '6\n', stderr: '', code: 0, signal: null, output: '6\n' }))
      .mockResolvedValueOnce(okResponse({ stdout: '5\n', stderr: '', code: 0, signal: null, output: '5\n' }));
    const runs = await execService.runAllTestCases({
      language: 'python',
      code: 'x',
      testCases: [
        { stdin: '1 2 3', expectedStdout: '6' },
        { stdin: '10 -5', expectedStdout: '99' },
      ],
    });
    expect(runs).toHaveLength(2);
    expect(runs[0].passed).toBe(true);
    expect(runs[1].passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

`cd backend && npx jest tests/unit/codingExecutionService.test.js`
Expected: FAIL.

- [ ] **Step 3: Create the service**

```js
// backend/src/services/codingExecutionService.js
'use strict';

const logger = require('../config/logger');

const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const LANG_MAP = { js: 'javascript', python: 'python', php: 'php' };
const FILE_NAMES = { js: 'main.js', python: 'main.py', php: 'main.php' };
const RUN_TIMEOUT_MS = 5000;
const COMPILE_TIMEOUT_MS = 10000;
const MEMORY_LIMIT = 256_000_000;
const FETCH_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

const runOne = async ({ language, code, stdin }) => {
  const pistonLang = LANG_MAP[language];
  const fileName = FILE_NAMES[language];
  if (!pistonLang || !fileName) {
    return { stdout: '', stderr: '', exitCode: null, runtimeMs: 0, error: `Unsupported language: ${language}` };
  }
  const body = {
    language: pistonLang,
    version: '*',
    files: [{ name: fileName, content: code }],
    stdin: stdin || '',
    run_timeout: RUN_TIMEOUT_MS,
    compile_timeout: COMPILE_TIMEOUT_MS,
    run_memory_limit: MEMORY_LIMIT,
  };
  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(
      PISTON_URL,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      FETCH_TIMEOUT_MS,
    );
    const runtimeMs = Date.now() - startedAt;
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      logger.warn('Piston returned non-OK', { status: res.status, body: txt.slice(0, 200) });
      return { stdout: '', stderr: '', exitCode: null, runtimeMs, error: `piston ${res.status}` };
    }
    const data = await res.json();
    const run = data?.run || {};
    return {
      stdout: run.stdout || '',
      stderr: run.stderr || '',
      exitCode: typeof run.code === 'number' ? run.code : null,
      runtimeMs,
      error: null,
    };
  } catch (err) {
    return {
      stdout: '', stderr: '',
      exitCode: null, runtimeMs: Date.now() - startedAt,
      error: err.message || 'fetch failed',
    };
  }
};

const runAllTestCases = async ({ language, code, testCases }) => {
  const runs = [];
  for (const tc of testCases) {
    const r = await runOne({ language, code, stdin: tc.stdin });
    runs.push({
      stdin: tc.stdin,
      expectedStdout: tc.expectedStdout,
      actualStdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode,
      runtimeMs: r.runtimeMs,
      passed: !r.error && r.exitCode === 0 && r.stdout.trim() === (tc.expectedStdout || '').trim(),
      error: r.error,
    });
  }
  return runs;
};

module.exports = { runOne, runAllTestCases, PISTON_URL };
```

- [ ] **Step 4: Run test, verify PASS**

`cd backend && npx jest tests/unit/codingExecutionService.test.js`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C backend add src/services/codingExecutionService.js tests/unit/codingExecutionService.test.js
git -C backend commit -m "feat: add codingExecutionService (Piston client)"
```

---

## Task C3: Add HR notification email template + register sender

**Files:**
- Create: `backend/src/templates/codingSubmissionReceivedEmail.js`
- Modify: `backend/src/services/emailService.js`

- [ ] **Step 1: Create the template**

```js
// backend/src/templates/codingSubmissionReceivedEmail.js
'use strict';

const buildCodingSubmissionReceivedHtml = ({ candidate, submissions, adminUrl }) => {
  const passedTotal = submissions.reduce((sum, s) => sum + (s.passedCount || 0), 0);
  const totalTotal = submissions.reduce((sum, s) => sum + (s.totalCount || 0), 0);
  const langs = [...new Set(submissions.map((s) => s.language))].join(', ');
  return `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#2563eb">Coding submission received — ${candidate.name}</h2>
  <p><strong>${candidate.name}</strong> submitted their coding test.</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Problems</td><td>${submissions.length}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Languages</td><td>${langs}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Test cases passed</td><td><strong>${passedTotal}/${totalTotal}</strong></td></tr>
  </table>
  <p><a href="${adminUrl}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">Review submission</a></p>
</body></html>`;
};

const buildCodingSubmissionReceivedText = ({ candidate, submissions, adminUrl }) => {
  const passedTotal = submissions.reduce((sum, s) => sum + (s.passedCount || 0), 0);
  const totalTotal = submissions.reduce((sum, s) => sum + (s.totalCount || 0), 0);
  const langs = [...new Set(submissions.map((s) => s.language))].join(', ');
  return `${candidate.name} submitted their coding test.

Problems:           ${submissions.length}
Languages used:     ${langs}
Test cases passed:  ${passedTotal}/${totalTotal}

Review: ${adminUrl}`;
};

module.exports = { buildCodingSubmissionReceivedHtml, buildCodingSubmissionReceivedText };
```

- [ ] **Step 2: Register in `emailService.js`**

Add import near the others:

```js
const { buildCodingSubmissionReceivedHtml, buildCodingSubmissionReceivedText } = require('../templates/codingSubmissionReceivedEmail');
```

Add send function:

```js
const sendCodingSubmissionReceived = async ({ candidate, submissions }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const hrTo = await resolveHrEmail();
  const adminUrl = `${env.frontendUrl.replace(/\/$/, '')}/candidates/${candidate.id}`;
  const subject = `Coding submission received — ${candidate.name}`;
  const html = buildCodingSubmissionReceivedHtml({ candidate, submissions, adminUrl });
  const text = buildCodingSubmissionReceivedText({ candidate, submissions, adminUrl });
  const info = await transporter.sendMail({
    from: env.smtp.from,
    to: hrTo,
    subject, text, html,
  });
  logger.info('Coding submission notification sent', { messageId: info.messageId, candidate: candidate.id });
  return info;
};
```

Add `sendCodingSubmissionReceived` to `module.exports`.

- [ ] **Step 3: Smoke-check**

```bash
cd backend && node -e "const e=require('./src/services/emailService'); console.log(typeof e.sendCodingSubmissionReceived)"
```
Expected: `function`.

- [ ] **Step 4: Commit**

```bash
git -C backend add src/templates/codingSubmissionReceivedEmail.js src/services/emailService.js
git -C backend commit -m "feat: add HR coding-submission notification email"
```

---

## Task C4: Add `codingSubmissionService` (submit + rate + re-run) with tests

**Files:**
- Create: `backend/src/services/codingSubmissionService.js`
- Create: `backend/tests/unit/codingSubmissionService.test.js`

- [ ] **Step 1: Write failing tests**

```js
// backend/tests/unit/codingSubmissionService.test.js
'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/repositories/codingSubmissionRepository');
jest.mock('../../src/repositories/codingProblemRepository');
jest.mock('../../src/services/codingExecutionService', () => ({
  runAllTestCases: jest.fn(),
}));
jest.mock('../../src/services/emailService', () => ({
  sendCodingSubmissionReceived: jest.fn(),
}));

const candidateRepo = require('../../src/repositories/candidateRepository');
const subRepo = require('../../src/repositories/codingSubmissionRepository');
const cpRepo = require('../../src/repositories/codingProblemRepository');
const exec = require('../../src/services/codingExecutionService');
const codingSubService = require('../../src/services/codingSubmissionService');

const makeCandidate = (overrides = {}) => ({
  id: 'c1',
  _id: 'c1',
  name: 'Alice',
  email: 'alice@example.com',
  techStack: ['react'],
  codingTest: {
    token: 'tok1',
    expiresAt: new Date(Date.now() + 3600_000),
    problems: ['p1'],
    problemCount: 1,
    durationMinutes: 30,
    submittedAt: null,
    outcome: null,
  },
  save: jest.fn().mockResolvedValue(),
  ...overrides,
});

const makeProblem = () => ({
  id: 'p1', _id: 'p1', title: 'Sum',
  supportedLanguages: ['js', 'python', 'php'],
  testCases: [{ stdin: '1 2', expectedStdout: '3' }],
});

describe('codingSubmissionService.submitByToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects when token not found', async () => {
    candidateRepo.findOne = jest.fn().mockResolvedValue(null);
    await expect(codingSubService.submitByToken({
      token: 'bad',
      submissions: [{ problemId: 'p1', language: 'js', code: 'x' }],
      tabSwitches: 0,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects when already submitted', async () => {
    const candidate = makeCandidate({ codingTest: { ...makeCandidate().codingTest, submittedAt: new Date() } });
    candidateRepo.findOne = jest.fn().mockResolvedValue(candidate);
    await expect(codingSubService.submitByToken({
      token: 'tok1',
      submissions: [{ problemId: 'p1', language: 'js', code: 'x' }],
      tabSwitches: 0,
    })).rejects.toMatchObject({ code: 'E_ALREADY_SUBMITTED' });
  });

  test('happy path: runs test cases, persists submissions, updates candidate, returns count', async () => {
    const candidate = makeCandidate();
    candidateRepo.findOne = jest.fn().mockResolvedValue(candidate);
    cpRepo.findById.mockResolvedValue(makeProblem());
    exec.runAllTestCases.mockResolvedValue([{ passed: true, stdin: '1 2', expectedStdout: '3', actualStdout: '3', stderr: '', exitCode: 0, runtimeMs: 100, error: null }]);
    subRepo.create.mockResolvedValue({ id: 's1', _id: 's1', problem: 'p1', language: 'js', passedCount: 1, totalCount: 1 });

    const result = await codingSubService.submitByToken({
      token: 'tok1',
      submissions: [{ problemId: 'p1', language: 'js', code: 'console.log(3)' }],
      tabSwitches: 2,
    });
    expect(result.submitted).toBe(1);
    expect(candidate.codingTest.submittedAt).toBeInstanceOf(Date);
    expect(candidate.codingTest.outcome).toBe('pending_review');
    expect(candidate.save).toHaveBeenCalled();
  });
});

describe('codingSubmissionService.rate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('updates rating + comment + reviewedBy', async () => {
    const sub = { id: 's1', _id: 's1', candidate: 'c1', save: jest.fn().mockResolvedValue() };
    subRepo.findById.mockResolvedValue(sub);
    subRepo.updateById.mockResolvedValue({ ...sub, rating: 4, reviewComment: 'good' });
    await codingSubService.rate('s1', { rating: 4, reviewComment: 'good' }, 'admin1');
    expect(subRepo.updateById).toHaveBeenCalledWith('s1', expect.objectContaining({
      rating: 4, reviewComment: 'good', reviewedBy: 'admin1',
    }));
  });

  test('rejects rating out of range', async () => {
    subRepo.findById.mockResolvedValue({ id: 's1' });
    await expect(codingSubService.rate('s1', { rating: 10 }, 'admin1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

`cd backend && npx jest tests/unit/codingSubmissionService.test.js`
Expected: FAIL.

- [ ] **Step 3: Add `findByCodingTestToken` to candidateRepository**

In `backend/src/repositories/candidateRepository.js`, add (alongside other find helpers):

```js
const findByCodingTestToken = (token) =>
  require('../models/Candidate').findOne({ 'codingTest.token': token });
```

Export it. Don't break existing exports.

- [ ] **Step 4: Create the service**

```js
// backend/src/services/codingSubmissionService.js
'use strict';

const candidateRepo = require('../repositories/candidateRepository');
const subRepo = require('../repositories/codingSubmissionRepository');
const cpRepo = require('../repositories/codingProblemRepository');
const exec = require('./codingExecutionService');
const emailService = require('./emailService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { verifyTestToken } = require('../utils/tokenGenerator');

const presentRun = (r) => ({
  stdin: r.stdin,
  expectedStdout: r.expectedStdout,
  actualStdout: r.actualStdout,
  stderr: r.stderr,
  exitCode: r.exitCode,
  runtimeMs: r.runtimeMs,
  passed: !!r.passed,
  error: r.error || null,
});

const presentSubmission = (s) => ({
  id: s.id || String(s._id),
  candidate: s.candidate,
  problem: s.problem,
  language: s.language,
  code: s.code,
  runs: (s.runs || []).map(presentRun),
  passedCount: s.passedCount || 0,
  totalCount: s.totalCount || 0,
  rating: s.rating,
  reviewComment: s.reviewComment || '',
  reviewedBy: s.reviewedBy || null,
  reviewedAt: s.reviewedAt || null,
  tabSwitches: s.tabSwitches || 0,
  submittedAt: s.submittedAt,
  autoSubmitted: !!s.autoSubmitted,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const findCandidateByToken = async (token) => {
  if (!verifyTestToken(token)) return null;
  return candidateRepo.findByCodingTestToken(token);
};

const submitByToken = async ({ token, submissions, tabSwitches = 0, autoSubmitted = false }) => {
  const candidate = await findCandidateByToken(token);
  if (!candidate) throw ApiError.notFound('Invalid coding test link');
  if (candidate.codingTest.submittedAt) {
    throw ApiError.conflict('Already submitted', { code: 'E_ALREADY_SUBMITTED' });
  }
  if (candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Coding test link has expired', { code: 'E_CODING_TEST_EXPIRED' });
  }

  const persisted = [];
  for (const sub of submissions) {
    const problem = await cpRepo.findById(sub.problemId);
    if (!problem) {
      logger.warn('Skipping unknown problem in submission', { problemId: sub.problemId });
      continue;
    }
    const runs = await exec.runAllTestCases({
      language: sub.language,
      code: sub.code,
      testCases: problem.testCases || [],
    });
    const passedCount = runs.filter((r) => r.passed).length;
    const totalCount = runs.length;
    const doc = await subRepo.create({
      candidate: candidate._id,
      codingTestToken: token,
      problem: problem._id,
      language: sub.language,
      code: sub.code,
      runs,
      passedCount,
      totalCount,
      tabSwitches,
      submittedAt: new Date(),
      autoSubmitted,
    });
    persisted.push(doc);
  }

  candidate.codingTest.submittedAt = new Date();
  candidate.codingTest.outcome = 'pending_review';
  await candidate.save();

  setImmediate(async () => {
    try {
      await emailService.sendCodingSubmissionReceived({
        candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
        submissions: persisted.map((p) => ({
          language: p.language,
          passedCount: p.passedCount,
          totalCount: p.totalCount,
        })),
      });
    } catch (err) {
      logger.error('Coding submission notification failed', { candidateId: candidate.id, err: err.message });
    }
  });

  return { submitted: persisted.length };
};

const markFirstOpened = async (token) => {
  const candidate = await findCandidateByToken(token);
  if (!candidate) return null;
  if (!candidate.codingTest.firstOpenedAt) {
    candidate.codingTest.firstOpenedAt = new Date();
    await candidate.save();
  }
  return candidate;
};

const loadTestByToken = async (token) => {
  const candidate = await findCandidateByToken(token);
  if (!candidate) throw ApiError.notFound('Invalid coding test link');
  if (candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Coding test link has expired', { code: 'E_CODING_TEST_EXPIRED' });
  }
  // Populate problems
  const problems = await Promise.all(
    (candidate.codingTest.problems || []).map((id) => cpRepo.findById(id)),
  );
  return {
    candidate: { name: candidate.name },
    problems: problems.filter(Boolean).map((p) => ({
      id: String(p._id),
      title: p.title,
      description: p.description,
      difficulty: p.difficulty,
      supportedLanguages: p.supportedLanguages,
      starterCode: p.starterCode,
      // Only return visible (non-hidden) test cases to the candidate
      sampleCases: (p.testCases || []).filter((tc) => !tc.isHidden),
    })),
    durationMinutes: candidate.codingTest.durationMinutes,
    firstOpenedAt: candidate.codingTest.firstOpenedAt,
    submittedAt: candidate.codingTest.submittedAt,
  };
};

const rate = async (submissionId, { rating, reviewComment }, adminId) => {
  const sub = await subRepo.findById(submissionId);
  if (!sub) throw ApiError.notFound('Submission not found');
  if (rating !== null && rating !== undefined && (rating < 1 || rating > 5)) {
    throw ApiError.badRequest('Rating must be 1-5');
  }
  const updated = await subRepo.updateById(submissionId, {
    rating: rating ?? null,
    reviewComment: reviewComment || '',
    reviewedBy: adminId,
    reviewedAt: new Date(),
  });
  return presentSubmission(updated);
};

const rerun = async (submissionId) => {
  const sub = await subRepo.findById(submissionId);
  if (!sub) throw ApiError.notFound('Submission not found');
  const problem = await cpRepo.findById(sub.problem);
  if (!problem) throw ApiError.notFound('Problem missing');
  const runs = await exec.runAllTestCases({
    language: sub.language,
    code: sub.code,
    testCases: problem.testCases || [],
  });
  const passedCount = runs.filter((r) => r.passed).length;
  const totalCount = runs.length;
  const updated = await subRepo.updateById(submissionId, { runs, passedCount, totalCount });
  return presentSubmission(updated);
};

const listForCandidate = async (candidateId) => {
  const subs = await subRepo.findByCandidate(candidateId);
  return subs.map(presentSubmission);
};

module.exports = {
  submitByToken, markFirstOpened, loadTestByToken,
  rate, rerun, listForCandidate, presentSubmission,
};
```

- [ ] **Step 5: Run test, verify PASS**

`cd backend && npx jest tests/unit/codingSubmissionService.test.js`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git -C backend add src/services/codingSubmissionService.js tests/unit/codingSubmissionService.test.js src/repositories/codingSubmissionRepository.js src/repositories/candidateRepository.js
git -C backend commit -m "feat: add codingSubmissionService with submit/rate/rerun"
```

---

## Task C5: Public + admin routes for coding submissions

**Files:**
- Create: `backend/src/controllers/codingTestPublicController.js`
- Create: `backend/src/controllers/codingSubmissionController.js`
- Create: `backend/src/routes/codingTestPublicRoutes.js`
- Create: `backend/src/routes/codingSubmissionRoutes.js`
- Create: `backend/src/validators/codingSubmissionValidator.js`
- Modify: `backend/src/routes/index.js`

- [ ] **Step 1: Create the submission validator**

```js
// backend/src/validators/codingSubmissionValidator.js
'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const submitSchema = {
  params: Joi.object({ token: Joi.string().required() }),
  body: Joi.object({
    submissions: Joi.array().items(Joi.object({
      problemId: objectId.required(),
      language: Joi.string().valid('js', 'python', 'php').required(),
      code: Joi.string().allow('').max(50000).required(),
    })).min(1).required(),
    tabSwitches: Joi.number().integer().min(0).default(0),
    autoSubmitted: Joi.boolean().default(false),
  }),
};

const tokenParamSchema = {
  params: Joi.object({ token: Joi.string().required() }),
};

const idParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

const rateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    reviewComment: Joi.string().allow('').max(2000).default(''),
  }),
};

module.exports = { submitSchema, tokenParamSchema, idParamSchema, rateSchema };
```

- [ ] **Step 2: Create the public controller**

```js
// backend/src/controllers/codingTestPublicController.js
'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const codingSubService = require('../services/codingSubmissionService');

const loadTest = asyncHandler(async (req, res) => {
  const data = await codingSubService.loadTestByToken(req.params.token);
  // Stamp first-open time on the side
  codingSubService.markFirstOpened(req.params.token).catch(() => {});
  return ok(res, data);
});

const submit = asyncHandler(async (req, res) => {
  const result = await codingSubService.submitByToken({
    token: req.params.token,
    submissions: req.body.submissions,
    tabSwitches: req.body.tabSwitches,
    autoSubmitted: req.body.autoSubmitted,
  });
  return ok(res, result, 'Coding test submitted');
});

module.exports = { loadTest, submit };
```

- [ ] **Step 3: Create the admin controller**

```js
// backend/src/controllers/codingSubmissionController.js
'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const codingSubService = require('../services/codingSubmissionService');

const listForCandidate = asyncHandler(async (req, res) => {
  const subs = await codingSubService.listForCandidate(req.query.candidateId);
  return ok(res, { items: subs });
});

const rate = asyncHandler(async (req, res) => {
  const sub = await codingSubService.rate(req.params.id, req.body, req.admin.id);
  return ok(res, sub, 'Rating saved');
});

const rerun = asyncHandler(async (req, res) => {
  const sub = await codingSubService.rerun(req.params.id);
  return ok(res, sub, 'Re-run complete');
});

module.exports = { listForCandidate, rate, rerun };
```

- [ ] **Step 4: Create the public routes**

```js
// backend/src/routes/codingTestPublicRoutes.js
'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const ctrl = require('../controllers/codingTestPublicController');
const { submitSchema, tokenParamSchema } = require('../validators/codingSubmissionValidator');

const router = express.Router();

router.get('/:token', validate(tokenParamSchema), ctrl.loadTest);
router.post('/:token/submit', validate(submitSchema), ctrl.submit);

module.exports = router;
```

- [ ] **Step 5: Create the admin routes**

```js
// backend/src/routes/codingSubmissionRoutes.js
'use strict';

const express = require('express');
const Joi = require('joi');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/codingSubmissionController');
const { idParamSchema, rateSchema } = require('../validators/codingSubmissionValidator');

const listQuerySchema = {
  query: Joi.object({
    candidateId: Joi.string().hex().length(24).required(),
  }),
};

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', validate(listQuerySchema), ctrl.listForCandidate);
router.post('/:id/rate', validate(rateSchema), ctrl.rate);
router.post('/:id/re-run', validate(idParamSchema), ctrl.rerun);

module.exports = router;
```

- [ ] **Step 6: Mount in `routes/index.js`**

```js
const codingTestPublicRoutes = require('./codingTestPublicRoutes');
const codingSubmissionRoutes = require('./codingSubmissionRoutes');
```

```js
router.use('/coding-test', codingTestPublicRoutes);
router.use('/coding-submissions', codingSubmissionRoutes);
```

- [ ] **Step 7: Smoke-check + commit**

```bash
cd backend && node -e "require('./src/routes')" && echo OK
```

```bash
git -C backend add src/controllers/codingTestPublicController.js src/controllers/codingSubmissionController.js src/routes/codingTestPublicRoutes.js src/routes/codingSubmissionRoutes.js src/validators/codingSubmissionValidator.js src/routes/index.js
git -C backend commit -m "feat: mount /coding-test (public) + /coding-submissions (admin) routes"
```

---

## Task C6: MCQ auto-shortlist suppression

**Files:**
- Modify: `backend/src/services/submissionService.js` (or wherever Round 1 outcome fires)

- [ ] **Step 1: Locate the auto-shortlist call**

```bash
grep -rn "ROUND1_OUTCOMES\|shortlistedCandidate\|shortlisted'\|sendRound1\|fireRound1Outcome" backend/src/services/ | head -20
```

Identify the function that computes the Round 1 outcome (shortlisted/rejected/disqualified) after MCQ submission. Read it. It will be in `submissionService.js` or similar.

- [ ] **Step 2: Add the suppression guard**

Right before the status flip and email-fire block, insert:

```js
// Suppress auto-outcome if a coding test is pending review.
const codingPending =
  candidate.codingTest?.sentAt &&
  candidate.codingTest?.outcome === 'pending_review';
if (codingPending) {
  logger.info('Round 1 auto-outcome suppressed — coding test pending review', {
    candidateId: candidate.id || candidate._id,
  });
  return; // skip the status flip + email
}
```

(Adjust the early-return to fit the function's control flow — if the outcome block is inline, wrap it in `if (!codingPending) { ... }` instead.)

- [ ] **Step 3: Run all tests**

```bash
cd backend && npm test --silent 2>&1 | tail -6
```
Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git -C backend add src/services/submissionService.js
git -C backend commit -m "fix: suppress MCQ auto-shortlist when coding test pending review"
```

---

# Phase D — HR shortlist/reject integration (backend)

## Task D1: Update Round 1 outcome handlers to set codingTest.outcome

**Files:**
- Modify: `backend/src/services/candidateService.js` (the existing `select`/`reject` or equivalent shortlist/reject functions)

- [ ] **Step 1: Locate the shortlist/reject functions**

```bash
grep -n "selectCandidate\|rejectCandidate\|shortlistCandidate\|status.*SHORTLISTED\|status.*REJECTED" backend/src/services/candidateService.js | head -10
```

There are existing handlers for HR-driven shortlist (Phase 2's `select`) and reject. For Round 1 shortlist/reject from the coding test, we need the same emails + status flip, plus update `candidate.codingTest.outcome`.

- [ ] **Step 2: Add two new wrapper functions**

After the existing `select` / `reject` functions (or near `sendTest`), add:

```js
const codingShortlist = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.codingTest?.submittedAt) {
    throw ApiError.conflict('Coding test not submitted', { code: 'E_NO_CODING_SUBMISSION' });
  }
  if (candidate.codingTest.outcome && candidate.codingTest.outcome !== 'pending_review') {
    throw ApiError.conflict('Coding test already decided', { code: 'E_ALREADY_DECIDED' });
  }
  candidate.status = CANDIDATE_STATUS.SHORTLISTED;
  candidate.codingTest.outcome = 'shortlisted';
  candidate.codingTest.reviewedAt = new Date();
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      // Reuse the existing Round 1 shortlisted email
      if (typeof emailService.sendRound1Shortlisted === 'function') {
        await emailService.sendRound1Shortlisted({ candidate: presented });
      } else if (typeof emailService.sendCandidateInvite === 'function') {
        // Fallback: log only — never fire wrong email
        logger.warn('No Round1 shortlist email registered — skipping send', { candidateId: id });
      }
    } catch (err) {
      logger.error('Coding shortlist email failed', { candidateId: id, err: err.message });
    }
  });
  return presented;
};

const codingReject = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.codingTest?.submittedAt) {
    throw ApiError.conflict('Coding test not submitted', { code: 'E_NO_CODING_SUBMISSION' });
  }
  if (candidate.codingTest.outcome && candidate.codingTest.outcome !== 'pending_review') {
    throw ApiError.conflict('Coding test already decided', { code: 'E_ALREADY_DECIDED' });
  }
  candidate.status = CANDIDATE_STATUS.REJECTED;
  candidate.codingTest.outcome = 'rejected';
  candidate.codingTest.reviewedAt = new Date();
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      if (typeof emailService.sendRound1Rejected === 'function') {
        await emailService.sendRound1Rejected({ candidate: presented });
      } else {
        logger.warn('No Round1 reject email registered — skipping send', { candidateId: id });
      }
    } catch (err) {
      logger.error('Coding reject email failed', { candidateId: id, err: err.message });
    }
  });
  return presented;
};
```

Export both: `codingShortlist`, `codingReject`.

- [ ] **Step 3: Add controller handlers + routes**

In `backend/src/controllers/candidateController.js`:

```js
const codingShortlist = asyncHandler(async (req, res) => {
  const c = await candidateService.codingShortlist(req.params.id);
  return ok(res, c, 'Candidate shortlisted');
});

const codingReject = asyncHandler(async (req, res) => {
  const c = await candidateService.codingReject(req.params.id);
  return ok(res, c, 'Candidate rejected');
});
```

Export both.

In `backend/src/routes/candidateRoutes.js`:

```js
router.post('/:id/coding-test/shortlist', validate(idParamSchema), candidateController.codingShortlist);
router.post('/:id/coding-test/reject', validate(idParamSchema), candidateController.codingReject);
```

- [ ] **Step 4: Smoke-check + commit**

```bash
cd backend && node -e "require('./src/routes')" && echo OK
cd backend && npm test --silent 2>&1 | tail -6
```

```bash
git -C backend add src/services/candidateService.js src/controllers/candidateController.js src/routes/candidateRoutes.js
git -C backend commit -m "feat: HR coding-test shortlist/reject actions on candidate"
```

---

# Phase E — Frontend admin (Coding Problems CRUD)

## Task E1: Install Monaco editor + add API client

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/api/codingProblemApi.js`

- [ ] **Step 1: Install Monaco**

```bash
cd frontend && npm install @monaco-editor/react
```

- [ ] **Step 2: Verify install**

```bash
cd frontend && node -e "require('@monaco-editor/react'); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 3: Create the API client**

```js
// frontend/src/api/codingProblemApi.js
import { apiClient } from './axios';

export const codingProblemApi = {
  list: (params) => apiClient.get('/coding-problems', { params }).then((r) => r.data.data),
  detail: (id) => apiClient.get(`/coding-problems/${id}`).then((r) => r.data.data),
  create: (payload) => apiClient.post('/coding-problems', payload).then((r) => r.data.data),
  update: (id, payload) => apiClient.patch(`/coding-problems/${id}`, payload).then((r) => r.data.data),
  deactivate: (id) => apiClient.delete(`/coding-problems/${id}`).then((r) => r.data),
  aiStarterCode: ({ description, language }) =>
    apiClient.post('/coding-problems/ai/starter-code', { description, language }).then((r) => r.data.data),
  aiFullProblem: ({ topic, difficulty, languages }) =>
    apiClient.post('/coding-problems/ai/full-problem', { topic, difficulty, languages }).then((r) => r.data.data),
};
```

- [ ] **Step 4: Commit**

```bash
git -C frontend add package.json package-lock.json src/api/codingProblemApi.js
git -C frontend commit -m "feat: install @monaco-editor/react + add codingProblemApi"
```

---

## Task E2: Add `codingProblems` Redux slice + register

**Files:**
- Create: `frontend/src/features/codingProblems/codingProblemsSlice.js`
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: Create the slice**

```js
// frontend/src/features/codingProblems/codingProblemsSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { codingProblemApi } from '@/api/codingProblemApi';
import { extractError } from '@/api/axios';

export const fetchProblems = createAsyncThunk('codingProblems/fetch', async (params, { rejectWithValue }) => {
  try { return await codingProblemApi.list(params); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

export const createProblem = createAsyncThunk('codingProblems/create', async (payload, { rejectWithValue }) => {
  try { return await codingProblemApi.create(payload); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

export const updateProblem = createAsyncThunk('codingProblems/update', async ({ id, payload }, { rejectWithValue }) => {
  try { return await codingProblemApi.update(id, payload); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

export const deactivateProblem = createAsyncThunk('codingProblems/deactivate', async (id, { rejectWithValue }) => {
  try { await codingProblemApi.deactivate(id); return id; }
  catch (err) { return rejectWithValue(extractError(err)); }
});

const slice = createSlice({
  name: 'codingProblems',
  initialState: { items: [], total: 0, page: 1, totalPages: 1, status: 'idle', error: null, busy: false },
  reducers: { clearError(s) { s.error = null; } },
  extraReducers: (b) => {
    b
      .addCase(fetchProblems.pending, (s) => { s.status = 'loading'; s.error = null; })
      .addCase(fetchProblems.fulfilled, (s, a) => {
        s.status = 'succeeded';
        s.items = a.payload.items;
        s.total = a.payload.total;
        s.page = a.payload.page;
        s.totalPages = a.payload.totalPages;
      })
      .addCase(fetchProblems.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed to load'; })
      .addCase(createProblem.pending, (s) => { s.busy = true; })
      .addCase(createProblem.fulfilled, (s) => { s.busy = false; })
      .addCase(createProblem.rejected, (s, a) => { s.busy = false; s.error = a.payload?.message; })
      .addCase(updateProblem.pending, (s) => { s.busy = true; })
      .addCase(updateProblem.fulfilled, (s) => { s.busy = false; })
      .addCase(updateProblem.rejected, (s, a) => { s.busy = false; s.error = a.payload?.message; })
      .addCase(deactivateProblem.fulfilled, (s, a) => {
        const item = s.items.find((x) => x.id === a.payload);
        if (item) item.isActive = false;
      });
  },
});

export const { clearError } = slice.actions;
export default slice.reducer;
```

- [ ] **Step 2: Register in store**

In `frontend/src/app/store.js`, add import alongside others:

```js
import codingProblemsReducer from '@/features/codingProblems/codingProblemsSlice';
```

Add to `reducer` map:

```js
codingProblems: codingProblemsReducer,
```

- [ ] **Step 3: Commit**

```bash
git -C frontend add src/features/codingProblems/codingProblemsSlice.js src/app/store.js
git -C frontend commit -m "feat: add codingProblems slice + register in store"
```

---

## Task E3: Add CodingProblemFormModal

**Files:**
- Create: `frontend/src/features/codingProblems/CodingProblemFormModal.jsx`
- Create: `frontend/src/features/codingProblems/CodingProblemFormModal.scss`

- [ ] **Step 1: Create the SCSS**

```scss
// frontend/src/features/codingProblems/CodingProblemFormModal.scss
.cp-form {
  display: grid; gap: 16px;

  &__row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
  &__chips { display: flex; flex-wrap: wrap; gap: 6px; }
  &__chip {
    padding: 4px 12px; border-radius: 999px; border: 1px solid #d1d5db;
    background: white; font-size: 12px; cursor: pointer;
    &.is-on { background: #eff6ff; border-color: #2563eb; color: #1d4ed8; }
  }
  &__editor {
    border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden;
    height: 200px;
  }
  &__tc {
    display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 8px;
    align-items: start; padding: 8px; background: #f9fafb; border-radius: 6px;
    textarea { font-family: monospace; font-size: 12px; padding: 6px; }
    label { display: flex; align-items: center; gap: 4px; font-size: 12px; }
    button { padding: 2px 8px; }
  }
  &__ai {
    background: #fef3c7; color: #92400e; padding: 12px; border-radius: 6px;
    display: flex; gap: 12px; align-items: center;
  }
}
```

- [ ] **Step 2: Create the modal component**

```jsx
// frontend/src/features/codingProblems/CodingProblemFormModal.jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Editor from '@monaco-editor/react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { codingProblemApi } from '@/api/codingProblemApi';
import { createProblem, updateProblem, fetchProblems } from './codingProblemsSlice';
import './CodingProblemFormModal.scss';

const LANGS = ['js', 'python', 'php'];
const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };
const MONACO_LANG = { js: 'javascript', python: 'python', php: 'php' };

const EMPTY = {
  title: '',
  description: '',
  difficulty: 'medium',
  techStack: '', // comma-separated input, parsed on submit
  supportedLanguages: ['js'],
  starterCode: { js: '', python: '', php: '' },
  testCases: [{ stdin: '', expectedStdout: '', isHidden: false }],
};

export default function CodingProblemFormModal({ open, initial, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { busy } = useSelector((s) => s.codingProblems);
  const [form, setForm] = useState(EMPTY);
  const [aiTopic, setAiTopic] = useState('');
  const [aiBusy, setAiBusy] = useState(null);
  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        ...EMPTY,
        ...initial,
        techStack: (initial.techStack || []).join(', '),
        starterCode: { js: '', python: '', php: '', ...(initial.starterCode || {}) },
        testCases: initial.testCases?.length ? initial.testCases : EMPTY.testCases,
      });
    } else {
      setForm(EMPTY);
    }
    setAiTopic('');
  }, [open, initial]);

  const toggleLang = (lang) => {
    setForm((f) => {
      const has = f.supportedLanguages.includes(lang);
      const next = has ? f.supportedLanguages.filter((x) => x !== lang) : [...f.supportedLanguages, lang];
      return { ...f, supportedLanguages: next.length > 0 ? next : f.supportedLanguages };
    });
  };

  const setStarter = (lang, code) =>
    setForm((f) => ({ ...f, starterCode: { ...f.starterCode, [lang]: code } }));

  const setTc = (i, field, value) =>
    setForm((f) => {
      const next = [...f.testCases];
      next[i] = { ...next[i], [field]: value };
      return { ...f, testCases: next };
    });

  const addTc = () =>
    setForm((f) => ({ ...f, testCases: [...f.testCases, { stdin: '', expectedStdout: '', isHidden: true }] }));

  const removeTc = (i) =>
    setForm((f) => ({ ...f, testCases: f.testCases.filter((_, idx) => idx !== i) }));

  const onAiStarter = async (lang) => {
    if (!form.description.trim()) {
      push({ type: 'warn', message: 'Write the description first' });
      return;
    }
    setAiBusy(`starter-${lang}`);
    try {
      const { code } = await codingProblemApi.aiStarterCode({ description: form.description, language: lang });
      setStarter(lang, code);
      push({ type: 'success', message: `Starter code generated for ${LANG_LABEL[lang]}` });
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'AI generation failed' });
    } finally {
      setAiBusy(null);
    }
  };

  const onAiFull = async () => {
    if (!aiTopic.trim()) {
      push({ type: 'warn', message: 'Enter a topic for AI generation' });
      return;
    }
    setAiBusy('full');
    try {
      const draft = await codingProblemApi.aiFullProblem({
        topic: aiTopic, difficulty: form.difficulty, languages: form.supportedLanguages,
      });
      setForm((f) => ({
        ...f,
        title: draft.title,
        description: draft.description,
        starterCode: { ...f.starterCode, ...draft.starterCode },
        testCases: draft.testCases,
      }));
      push({ type: 'success', message: 'Full problem drafted by AI' });
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'AI generation failed' });
    } finally {
      setAiBusy(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const techStack = form.techStack.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!form.title || !form.description || techStack.length === 0 || form.supportedLanguages.length === 0) {
      push({ type: 'warn', message: 'Fill in title, description, tech stack, and at least one language' });
      return;
    }
    const payload = {
      title: form.title,
      description: form.description,
      difficulty: form.difficulty,
      techStack,
      supportedLanguages: form.supportedLanguages,
      starterCode: form.starterCode,
      testCases: form.testCases.filter((tc) => tc.stdin !== '' || tc.expectedStdout !== ''),
    };
    const action = isEdit
      ? await dispatch(updateProblem({ id: initial.id, payload }))
      : await dispatch(createProblem(payload));
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: isEdit ? 'Problem updated' : 'Problem created' });
      dispatch(fetchProblems({ page: 1, limit: 20 }));
      onClose();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Coding Problem' : 'New Coding Problem'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{isEdit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="cp-form" noValidate>
        <div className="cp-form__ai">
          <div style={{ flex: 1 }}>
            <Input
              label="AI generate from topic"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="e.g. 'sum of n numbers'"
            />
          </div>
          <Button type="button" variant="secondary" onClick={onAiFull} loading={aiBusy === 'full'}>
            Generate entire problem
          </Button>
        </div>

        <Input
          label="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />

        <div className="cp-form__row">
          <Input
            label="Tech stack (comma-separated)"
            value={form.techStack}
            onChange={(e) => setForm({ ...form, techStack: e.target.value })}
            placeholder="react, frontend, javascript"
            required
          />
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Difficulty</label>
            <select
              value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
              style={{ width: '100%', padding: '8px 10px' }}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Languages</label>
            <div className="cp-form__chips">
              {LANGS.map((l) => (
                <button
                  type="button"
                  key={l}
                  className={`cp-form__chip ${form.supportedLanguages.includes(l) ? 'is-on' : ''}`}
                  onClick={() => toggleLang(l)}
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Description (markdown supported)</label>
          <textarea
            rows={6}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ width: '100%', resize: 'vertical', padding: 8, fontFamily: 'inherit' }}
          />
        </div>

        {form.supportedLanguages.map((lang) => (
          <div key={lang}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 13 }}>Starter code — {LANG_LABEL[lang]}</label>
              <Button type="button" size="sm" variant="ghost" onClick={() => onAiStarter(lang)} loading={aiBusy === `starter-${lang}`}>
                Generate with AI
              </Button>
            </div>
            <div className="cp-form__editor">
              <Editor
                height="200px"
                language={MONACO_LANG[lang]}
                value={form.starterCode[lang] || ''}
                onChange={(value) => setStarter(lang, value || '')}
                options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
              />
            </div>
          </div>
        ))}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ fontSize: 13 }}>Test cases ({form.testCases.length})</label>
            <Button type="button" size="sm" variant="secondary" onClick={addTc}>+ Add case</Button>
          </div>
          {form.testCases.map((tc, i) => (
            <div key={i} className="cp-form__tc">
              <textarea
                rows={3}
                placeholder="stdin"
                value={tc.stdin}
                onChange={(e) => setTc(i, 'stdin', e.target.value)}
              />
              <textarea
                rows={3}
                placeholder="expected stdout"
                value={tc.expectedStdout}
                onChange={(e) => setTc(i, 'expectedStdout', e.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={tc.isHidden}
                  onChange={(e) => setTc(i, 'isHidden', e.target.checked)}
                />
                hidden
              </label>
              <Button type="button" size="sm" variant="ghost" onClick={() => removeTc(i)}>×</Button>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git -C frontend add src/features/codingProblems/CodingProblemFormModal.jsx src/features/codingProblems/CodingProblemFormModal.scss
git -C frontend commit -m "feat: add CodingProblemFormModal with Monaco editors + AI buttons"
```

---

## Task E4: Add CodingProblemListPage + nav + route

**Files:**
- Create: `frontend/src/features/codingProblems/CodingProblemListPage.jsx`
- Create: `frontend/src/features/codingProblems/CodingProblemListPage.scss`
- Modify: `frontend/src/layouts/AdminLayout.jsx`
- Modify: `frontend/src/routes/AppRoutes.jsx`

- [ ] **Step 1: Create the SCSS**

```scss
// frontend/src/features/codingProblems/CodingProblemListPage.scss
.cp-list {
  padding: 24px;
  &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  &__filters { display: flex; gap: 12px; margin-bottom: 12px; }
  &__table {
    width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    th { background: #f9fafb; font-weight: 600; }
  }
  &__pill {
    display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px;
    &--active { background: #ecfdf5; color: #047857; }
    &--inactive { background: #f3f4f6; color: #6b7280; }
    &--ai { background: #fef3c7; color: #92400e; }
    &--manual { background: #dbeafe; color: #1d4ed8; }
  }
}
```

- [ ] **Step 2: Create the list page**

```jsx
// frontend/src/features/codingProblems/CodingProblemListPage.jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchProblems, deactivateProblem } from './codingProblemsSlice';
import CodingProblemFormModal from './CodingProblemFormModal';
import './CodingProblemListPage.scss';

export default function CodingProblemListPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { items, total, totalPages, page, status } = useSelector((s) => s.codingProblems);
  const [filters, setFilters] = useState({ search: '', difficulty: '', language: '', source: '', isActive: '' });
  const [modal, setModal] = useState({ open: false, initial: null });

  useEffect(() => {
    dispatch(fetchProblems({ page: 1, limit: 20, ...filters }));
  }, [dispatch, filters]);

  const onDeactivate = async (id) => {
    if (!confirm('Deactivate this problem? Existing candidates that used it keep their submissions.')) return;
    const action = await dispatch(deactivateProblem(id));
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: 'Problem deactivated' });
    }
  };

  return (
    <div className="cp-list">
      <div className="cp-list__head">
        <div>
          <h1 style={{ margin: 0 }}>Coding Problems</h1>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{total} total · page {page} / {totalPages}</div>
        </div>
        <Button onClick={() => setModal({ open: true, initial: null })}>+ New problem</Button>
      </div>

      <div className="cp-list__filters">
        <input
          placeholder="Search title or tech stack…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}
        />
        <select value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">All difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select value={filters.language} onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">All languages</option>
          <option value="js">JavaScript</option>
          <option value="python">Python</option>
          <option value="php">PHP</option>
        </select>
        <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">All sources</option>
          <option value="manual">Manual</option>
          <option value="ai">AI</option>
        </select>
        <select value={filters.isActive} onChange={(e) => setFilters((f) => ({ ...f, isActive: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">Active &amp; inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {status === 'loading' && <Loader message="Loading…" />}
      {status !== 'loading' && items.length === 0 && (
        <EmptyState title="No problems yet" description="Create one to start sending coding tests." />
      )}
      {items.length > 0 && (
        <table className="cp-list__table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Tech / Difficulty</th>
              <th>Languages</th>
              <th>Test cases</th>
              <th>Source</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{(p.techStack || []).join(', ')} / {p.difficulty}</td>
                <td>{(p.supportedLanguages || []).join(', ')}</td>
                <td>{p.testCases?.length || 0}</td>
                <td>
                  <span className={`cp-list__pill cp-list__pill--${p.source}`}>{p.source}</span>
                </td>
                <td>
                  <span className={`cp-list__pill ${p.isActive ? 'cp-list__pill--active' : 'cp-list__pill--inactive'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(p.updatedAt).toLocaleString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="secondary" onClick={() => setModal({ open: true, initial: p })}>Edit</Button>
                    {p.isActive && <Button size="sm" variant="ghost" onClick={() => onDeactivate(p.id)}>Deactivate</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CodingProblemFormModal
        open={modal.open}
        initial={modal.initial}
        onClose={() => setModal({ open: false, initial: null })}
      />
    </div>
  );
}
```

- [ ] **Step 3: Add nav entry**

In `frontend/src/layouts/AdminLayout.jsx`, in the `NAV` array, add this entry alongside the Job Descriptions entry (or wherever fits):

```js
{ to: '/coding-problems', label: 'Coding Problems', icon: '⌨' },
```

- [ ] **Step 4: Register route**

In `frontend/src/routes/AppRoutes.jsx`, add import alongside others:

```jsx
import CodingProblemListPage from '@/features/codingProblems/CodingProblemListPage';
```

Inside the existing protected admin block, add:

```jsx
<Route path="/coding-problems" element={<CodingProblemListPage />} />
```

- [ ] **Step 5: Build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```
Expected: clean build.

```bash
git -C frontend add src/features/codingProblems/CodingProblemListPage.jsx src/features/codingProblems/CodingProblemListPage.scss src/layouts/AdminLayout.jsx src/routes/AppRoutes.jsx
git -C frontend commit -m "feat: Coding Problems admin page + nav + route"
```

---

# Phase F — Frontend candidate (Coding Test page)

## Task F1: Add coding-test API + slice

**Files:**
- Create: `frontend/src/api/codingTestApi.js`
- Create: `frontend/src/features/codingTest/codingTestSlice.js`
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: API client**

```js
// frontend/src/api/codingTestApi.js
import { apiClient } from './axios';

export const codingTestApi = {
  loadTest: (token) => apiClient.get(`/coding-test/${token}`).then((r) => r.data.data),
  submit: (token, payload) => apiClient.post(`/coding-test/${token}/submit`, payload).then((r) => r.data.data),
};
```

- [ ] **Step 2: Slice**

```js
// frontend/src/features/codingTest/codingTestSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { codingTestApi } from '@/api/codingTestApi';
import { extractError } from '@/api/axios';

export const loadCodingTest = createAsyncThunk('codingTest/load', async (token, { rejectWithValue }) => {
  try { return await codingTestApi.loadTest(token); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

export const submitCodingTest = createAsyncThunk('codingTest/submit', async ({ token, submissions, tabSwitches, autoSubmitted }, { rejectWithValue }) => {
  try { return await codingTestApi.submit(token, { submissions, tabSwitches, autoSubmitted }); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

const slice = createSlice({
  name: 'codingTest',
  initialState: { data: null, status: 'idle', submitting: false, submitted: false, error: null },
  reducers: { clearState: () => ({ data: null, status: 'idle', submitting: false, submitted: false, error: null }) },
  extraReducers: (b) => {
    b
      .addCase(loadCodingTest.pending, (s) => { s.status = 'loading'; s.error = null; })
      .addCase(loadCodingTest.fulfilled, (s, a) => { s.status = 'succeeded'; s.data = a.payload; })
      .addCase(loadCodingTest.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed to load'; })
      .addCase(submitCodingTest.pending, (s) => { s.submitting = true; })
      .addCase(submitCodingTest.fulfilled, (s) => { s.submitting = false; s.submitted = true; })
      .addCase(submitCodingTest.rejected, (s, a) => { s.submitting = false; s.error = a.payload?.message || 'Submit failed'; });
  },
});

export const { clearState } = slice.actions;
export default slice.reducer;
```

- [ ] **Step 3: Register in store**

In `frontend/src/app/store.js`:

```js
import codingTestReducer from '@/features/codingTest/codingTestSlice';
```

```js
codingTest: codingTestReducer,
```

- [ ] **Step 4: Commit**

```bash
git -C frontend add src/api/codingTestApi.js src/features/codingTest/codingTestSlice.js src/app/store.js
git -C frontend commit -m "feat: add codingTestApi + slice"
```

---

## Task F2: Build `CodingTestPage` with Monaco + anti-cheat + timer

**Files:**
- Create: `frontend/src/features/codingTest/CodingTestPage.jsx`
- Create: `frontend/src/features/codingTest/CodingTestPage.scss`
- Create: `frontend/src/features/codingTest/CodingTestSuccessPage.jsx`
- Modify: `frontend/src/routes/AppRoutes.jsx`

- [ ] **Step 1: SCSS**

```scss
// frontend/src/features/codingTest/CodingTestPage.scss
.coding-test {
  max-width: 1100px; margin: 0 auto; padding: 24px;

  &__head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;
  }
  &__title { font-size: 18px; font-weight: 600; }
  &__timer { font-family: monospace; font-size: 16px; color: #2563eb; font-weight: 600; }
  &__timer--warn { color: #dc2626; }
  &__nav { display: flex; gap: 8px; align-items: center; }
  &__counter { font-size: 13px; color: #6b7280; }

  &__problem {
    background: white; border: 1px solid #e5e7eb; border-radius: 10px;
    padding: 20px; margin-bottom: 16px;
    h2 { margin: 0 0 4px; }
    &-meta { color: #6b7280; font-size: 13px; margin-bottom: 12px; }
    &-desc { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
    &-samples {
      background: #f9fafb; padding: 10px 12px; border-radius: 6px;
      margin-top: 12px; font-family: monospace; font-size: 12px;
    }
  }

  &__lang { margin-bottom: 8px; display: flex; gap: 12px; align-items: center; }
  &__editor {
    border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden;
    height: 380px;
  }

  &__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
}

.coding-test__warning-modal {
  background: white; border-radius: 8px; padding: 20px;
  max-width: 400px; text-align: center;
  h3 { color: #dc2626; margin: 0 0 8px; }
  p { font-size: 14px; color: #374151; margin: 8px 0; }
}
```

- [ ] **Step 2: Page component**

```jsx
// frontend/src/features/codingTest/CodingTestPage.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import Modal from '@/components/common/Modal';
import { useToast } from '@/components/common/Toast';
import { loadCodingTest, submitCodingTest, clearState } from './codingTestSlice';
import './CodingTestPage.scss';

const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };
const MONACO_LANG = { js: 'javascript', python: 'python', php: 'php' };

const formatMs = (ms) => {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function CodingTestPage() {
  const { token } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const { data, status, error, submitting, submitted } = useSelector((s) => s.codingTest);
  const [current, setCurrent] = useState(0);
  const [perProblem, setPerProblem] = useState({}); // { [problemId]: { language, code } }
  const [tabSwitches, setTabSwitches] = useState(0);
  const [warnOpen, setWarnOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    dispatch(loadCodingTest(token));
    return () => { dispatch(clearState()); };
  }, [dispatch, token]);

  // Initialize per-problem state once data loads
  useEffect(() => {
    if (!data?.problems) return;
    setPerProblem((prev) => {
      const next = { ...prev };
      for (const p of data.problems) {
        if (!next[p.id]) {
          const lang = p.supportedLanguages[0];
          next[p.id] = { language: lang, code: p.starterCode?.[lang] || '' };
        }
      }
      return next;
    });
  }, [data]);

  // Timer
  useEffect(() => {
    if (!data || submittedRef.current) return;
    const startedAt = data.firstOpenedAt ? new Date(data.firstOpenedAt).getTime() : Date.now();
    const endsAt = startedAt + data.durationMinutes * 60_000;
    const tick = () => {
      const ms = endsAt - Date.now();
      setRemainingMs(ms);
      if (ms <= 0 && !submittedRef.current) {
        submittedRef.current = true;
        doSubmit(true);
      }
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab-switch detection
  useEffect(() => {
    if (!data) return;
    const onVisibility = () => {
      if (document.hidden) {
        setTabSwitches((n) => n + 1);
      } else {
        setWarnOpen(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [data]);

  // Block paste / copy / context menu at the page level (extra safety net beyond Monaco config)
  useEffect(() => {
    const blockEvt = (e) => { e.preventDefault(); push({ type: 'warn', message: 'Disabled during the test.' }); };
    const onKey = (e) => {
      const isPaste = (e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V');
      const isCopy = (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C');
      if (isPaste || isCopy) blockEvt(e);
    };
    document.addEventListener('paste', blockEvt);
    document.addEventListener('copy', blockEvt);
    document.addEventListener('contextmenu', blockEvt);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('paste', blockEvt);
      document.removeEventListener('copy', blockEvt);
      document.removeEventListener('contextmenu', blockEvt);
      document.removeEventListener('keydown', onKey);
    };
  }, [push]);

  if (status === 'loading' && !data) return <Loader message="Loading coding test…" />;
  if (status === 'failed' || !data) {
    return <EmptyState title="Couldn't load the test" description={error || 'The link may be invalid or expired.'} />;
  }
  if (data.submittedAt || submitted) {
    return <EmptyState title="You've already submitted this test" description="Thanks — the hiring team will be in touch." />;
  }

  const problem = data.problems[current];
  const state = perProblem[problem.id] || { language: problem.supportedLanguages[0], code: '' };

  const setLang = (newLang) => {
    if (state.code.trim() && state.code !== (problem.starterCode?.[state.language] || '')) {
      if (!window.confirm(`Switching to ${LANG_LABEL[newLang]} will replace your current code with the starter code. Continue?`)) return;
    }
    setPerProblem((prev) => ({
      ...prev,
      [problem.id]: { language: newLang, code: problem.starterCode?.[newLang] || '' },
    }));
  };

  const setCode = (code) => {
    setPerProblem((prev) => ({ ...prev, [problem.id]: { ...prev[problem.id], code } }));
  };

  const doSubmit = async (autoSubmitted = false) => {
    if (submittedRef.current && !autoSubmitted) return;
    submittedRef.current = true;
    const submissions = data.problems.map((p) => ({
      problemId: p.id,
      language: perProblem[p.id]?.language || p.supportedLanguages[0],
      code: perProblem[p.id]?.code || '',
    }));
    const action = await dispatch(submitCodingTest({ token, submissions, tabSwitches, autoSubmitted }));
    if (submitCodingTest.fulfilled.match(action)) {
      push({ type: 'success', message: 'Submitted!' });
      navigate(`/coding-test/${token}/submitted`, { replace: true });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Submit failed' });
      submittedRef.current = false;
    }
  };

  const timerWarn = remainingMs !== null && remainingMs < 60_000;

  return (
    <div className="coding-test">
      <div className="coding-test__head">
        <div>
          <div className="coding-test__title">Coding Challenge — {data.candidate?.name || 'Candidate'}</div>
          <div className="coding-test__counter">
            Problem {current + 1} of {data.problems.length} · Tab-switches: {tabSwitches}
          </div>
        </div>
        <div className={`coding-test__timer ${timerWarn ? 'coding-test__timer--warn' : ''}`}>
          ⏱ {remainingMs !== null ? formatMs(remainingMs) : '…'}
        </div>
      </div>

      <div className="coding-test__problem">
        <h2>{problem.title} · {problem.difficulty}</h2>
        <div className="coding-test__problem-desc">{problem.description}</div>
        {problem.sampleCases?.length > 0 && (
          <div className="coding-test__problem-samples">
            {problem.sampleCases.map((tc, i) => (
              <div key={i}>
                <div>Sample input:  {JSON.stringify(tc.stdin)}</div>
                <div>Sample output: {JSON.stringify(tc.expectedStdout)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="coding-test__lang">
        <label>Language:</label>
        <select value={state.language} onChange={(e) => setLang(e.target.value)} style={{ padding: '6px 10px' }}>
          {problem.supportedLanguages.map((l) => (
            <option key={l} value={l}>{LANG_LABEL[l]}</option>
          ))}
        </select>
      </div>

      <div className="coding-test__editor">
        <Editor
          height="380px"
          language={MONACO_LANG[state.language]}
          value={state.code}
          onChange={(v) => setCode(v || '')}
          options={{
            minimap: { enabled: false },
            contextmenu: false,
            fontSize: 13,
            automaticLayout: true,
          }}
          onMount={(editor) => {
            // Block paste at the Monaco level
            editor.onDidPaste(() => {
              push({ type: 'warn', message: 'Pasting is disabled. Please type your code.' });
            });
          }}
        />
      </div>

      <div className="coding-test__actions">
        <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Previous</Button>
        {current < data.problems.length - 1 && (
          <Button onClick={() => setCurrent((c) => c + 1)}>Next</Button>
        )}
        {current === data.problems.length - 1 && (
          <Button onClick={() => doSubmit(false)} loading={submitting}>Submit and finish</Button>
        )}
      </div>

      <Modal
        open={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="Tab switch detected"
        footer={<Button onClick={() => setWarnOpen(false)}>OK</Button>}
      >
        <p>
          You left the test tab. Tab switching is monitored. This is switch <strong>#{tabSwitches}</strong>.
          Please stay focused on the test.
        </p>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 3: Success page**

```jsx
// frontend/src/features/codingTest/CodingTestSuccessPage.jsx
export default function CodingTestSuccessPage() {
  return (
    <div style={{ maxWidth: 600, margin: '60px auto', padding: 32, textAlign: 'center', background: 'white', borderRadius: 10 }}>
      <h2 style={{ color: '#047857' }}>Submitted successfully</h2>
      <p>Thanks for completing the coding challenge.</p>
      <p>The hiring team will review your code and reach out with next steps.</p>
    </div>
  );
}
```

- [ ] **Step 4: Register routes**

In `frontend/src/routes/AppRoutes.jsx`:

```jsx
import CodingTestPage from '@/features/codingTest/CodingTestPage';
import CodingTestSuccessPage from '@/features/codingTest/CodingTestSuccessPage';
```

Inside the **PublicLayout** route block (alongside `/test/:token`, `/interview/:token`):

```jsx
<Route path="/coding-test/:token" element={<CodingTestPage />} />
<Route path="/coding-test/:token/submitted" element={<CodingTestSuccessPage />} />
```

- [ ] **Step 5: Build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

```bash
git -C frontend add src/features/codingTest/ src/routes/AppRoutes.jsx
git -C frontend commit -m "feat: candidate-facing coding test page with Monaco + anti-cheat + timer"
```

---

# Phase G — Frontend HR review

## Task G1: Extend candidateApi + add codingSubmissionApi

**Files:**
- Modify: `frontend/src/api/candidateApi.js`
- Create: `frontend/src/api/codingSubmissionApi.js`

- [ ] **Step 1: Extend candidateApi**

Add to the existing `candidateApi` object:

```js
sendCodingTest: (id, payload) => apiClient.post(`/candidates/${id}/coding-test/send`, payload).then((r) => r.data.data),
regenerateCodingTest: (id) => apiClient.post(`/candidates/${id}/coding-test/regenerate`).then((r) => r.data.data),
resendCodingTest: (id) => apiClient.post(`/candidates/${id}/coding-test/resend`).then((r) => r.data.data),
codingShortlist: (id) => apiClient.post(`/candidates/${id}/coding-test/shortlist`).then((r) => r.data.data),
codingReject: (id) => apiClient.post(`/candidates/${id}/coding-test/reject`).then((r) => r.data.data),
```

- [ ] **Step 2: Create codingSubmissionApi**

```js
// frontend/src/api/codingSubmissionApi.js
import { apiClient } from './axios';

export const codingSubmissionApi = {
  listForCandidate: (candidateId) =>
    apiClient.get('/coding-submissions', { params: { candidateId } }).then((r) => r.data.data),
  rate: (id, payload) =>
    apiClient.post(`/coding-submissions/${id}/rate`, payload).then((r) => r.data.data),
  rerun: (id) =>
    apiClient.post(`/coding-submissions/${id}/re-run`).then((r) => r.data.data),
};
```

- [ ] **Step 3: Commit**

```bash
git -C frontend add src/api/candidateApi.js src/api/codingSubmissionApi.js
git -C frontend commit -m "feat: add coding-test + coding-submission API methods"
```

---

## Task G2: Build `CodingTestPanel` for the candidate detail page

**Files:**
- Create: `frontend/src/features/candidates/CodingTestPanel.jsx`
- Create: `frontend/src/features/candidates/CodingTestPanel.scss`

- [ ] **Step 1: SCSS**

```scss
// frontend/src/features/candidates/CodingTestPanel.scss
.ct-panel {
  background: white; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 16px;

  &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  &__title { font-weight: 600; font-size: 14px; color: #374151; }
  &__meta { font-size: 12px; color: #6b7280; margin-top: 4px; }

  &__tabsw {
    display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px;
    &--green { background: #ecfdf5; color: #047857; }
    &--amber { background: #fef3c7; color: #92400e; }
    &--red { background: #fef2f2; color: #b91c1c; }
  }

  &__sub {
    background: #f9fafb; border-radius: 8px; padding: 14px 16px; margin-top: 12px;
    h4 { margin: 0 0 4px; font-size: 14px; }
    &-meta { font-size: 12px; color: #6b7280; margin-bottom: 10px; }
  }

  &__cases {
    background: white; border: 1px solid #e5e7eb; border-radius: 6px;
    margin: 10px 0; font-family: monospace; font-size: 12px;
  }
  &__case {
    display: grid; grid-template-columns: 30px 1fr 1fr 1fr; gap: 8px;
    padding: 6px 10px; border-bottom: 1px solid #e5e7eb;
    &:last-child { border-bottom: 0; }
    &--passed { background: #f0fdf4; }
    &--failed { background: #fef2f2; }
  }

  &__code { border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; height: 280px; margin-top: 8px; }

  &__rate { display: flex; gap: 12px; align-items: center; margin-top: 12px; }
  &__stars { display: flex; gap: 2px; cursor: pointer; }
  &__star { font-size: 22px; color: #d1d5db; user-select: none; &.is-on { color: #f59e0b; } }
  &__comment { flex: 1; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px; font-family: inherit; }

  &__actions { display: flex; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
}
```

- [ ] **Step 2: Component**

```jsx
// frontend/src/features/candidates/CodingTestPanel.jsx
import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { codingSubmissionApi } from '@/api/codingSubmissionApi';
import { candidateApi } from '@/api/candidateApi';
import { formatDate } from '@/utils/formatters';
import './CodingTestPanel.scss';

const MONACO_LANG = { js: 'javascript', python: 'python', php: 'php' };
const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };

const tabSwitchClass = (n) => {
  if (n === 0) return 'ct-panel__tabsw--green';
  if (n <= 5) return 'ct-panel__tabsw--amber';
  return 'ct-panel__tabsw--red';
};

export default function CodingTestPanel({ candidate, onRefresh }) {
  const { push } = useToast();
  const [submissions, setSubmissions] = useState(null);
  const [busy, setBusy] = useState(null);
  const [drafts, setDrafts] = useState({}); // { [subId]: { rating, comment } }

  const ct = candidate.codingTest;

  useEffect(() => {
    if (!ct?.submittedAt) return;
    codingSubmissionApi.listForCandidate(candidate.id)
      .then((res) => {
        setSubmissions(res.items);
        const init = {};
        res.items.forEach((s) => { init[s.id] = { rating: s.rating || 0, comment: s.reviewComment || '' }; });
        setDrafts(init);
      })
      .catch((err) => push({ type: 'error', message: err.response?.data?.message || 'Failed to load submissions' }));
  }, [ct?.submittedAt, candidate.id, push]);

  if (!ct) return null;

  if (!ct.submittedAt) {
    return (
      <div className="ct-panel">
        <div className="ct-panel__head">
          <div>
            <div className="ct-panel__title">Coding Test</div>
            <div className="ct-panel__meta">
              Sent {formatDate(ct.sentAt)} · {ct.problemCount} problem(s) · {ct.durationMinutes} min · awaiting candidate
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submissions === null) return <Loader message="Loading submissions…" />;

  const allRated = submissions.every((s) => s.rating != null);

  const onRate = async (sub) => {
    const draft = drafts[sub.id];
    if (!draft?.rating) { push({ type: 'warn', message: 'Pick a star rating first' }); return; }
    setBusy(`rate-${sub.id}`);
    try {
      await codingSubmissionApi.rate(sub.id, { rating: draft.rating, reviewComment: draft.comment });
      push({ type: 'success', message: 'Rating saved' });
      const refreshed = await codingSubmissionApi.listForCandidate(candidate.id);
      setSubmissions(refreshed.items);
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Save failed' });
    } finally {
      setBusy(null);
    }
  };

  const onRerun = async (sub) => {
    setBusy(`rerun-${sub.id}`);
    try {
      await codingSubmissionApi.rerun(sub.id);
      push({ type: 'success', message: 'Re-ran tests' });
      const refreshed = await codingSubmissionApi.listForCandidate(candidate.id);
      setSubmissions(refreshed.items);
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Re-run failed' });
    } finally {
      setBusy(null);
    }
  };

  const onShortlist = async () => {
    if (!window.confirm('Shortlist this candidate? A shortlist email will be sent.')) return;
    setBusy('shortlist');
    try {
      await candidateApi.codingShortlist(candidate.id);
      push({ type: 'success', message: 'Shortlisted' });
      onRefresh?.();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Shortlist failed' });
    } finally { setBusy(null); }
  };

  const onReject = async () => {
    if (!window.confirm('Reject this candidate? A rejection email will be sent.')) return;
    setBusy('reject');
    try {
      await candidateApi.codingReject(candidate.id);
      push({ type: 'success', message: 'Rejected' });
      onRefresh?.();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Reject failed' });
    } finally { setBusy(null); }
  };

  return (
    <div className="ct-panel">
      <div className="ct-panel__head">
        <div>
          <div className="ct-panel__title">Coding Test</div>
          <div className="ct-panel__meta">
            Sent {formatDate(ct.sentAt)} · Submitted {formatDate(ct.submittedAt)} · {submissions.length} submission(s)
            {' · '}
            <span className={`ct-panel__tabsw ${tabSwitchClass(submissions[0]?.tabSwitches || 0)}`}>
              Tab-switches: {submissions[0]?.tabSwitches || 0}
            </span>
          </div>
        </div>
        {ct.outcome && (
          <div style={{ fontSize: 13, fontWeight: 600, color: ct.outcome === 'shortlisted' ? '#047857' : '#b91c1c' }}>
            {ct.outcome === 'shortlisted' ? 'Shortlisted' : ct.outcome === 'rejected' ? 'Rejected' : 'Pending review'}
          </div>
        )}
      </div>

      {submissions.map((sub) => (
        <div key={sub.id} className="ct-panel__sub">
          <h4>{sub.problem?.title || 'Problem'}</h4>
          <div className="ct-panel__sub-meta">
            Language: {LANG_LABEL[sub.language]} · Passed {sub.passedCount}/{sub.totalCount}
          </div>

          <div className="ct-panel__cases">
            {sub.runs.map((r, i) => (
              <div key={i} className={`ct-panel__case ${r.passed ? 'ct-panel__case--passed' : 'ct-panel__case--failed'}`}>
                <div>{r.passed ? '✓' : '✗'}</div>
                <div>stdin: {JSON.stringify(r.stdin)}</div>
                <div>expected: {JSON.stringify(r.expectedStdout)}</div>
                <div>got: {JSON.stringify(r.actualStdout)} {r.error ? ` [${r.error}]` : ''}</div>
              </div>
            ))}
          </div>

          <div className="ct-panel__code">
            <Editor
              height="280px"
              language={MONACO_LANG[sub.language]}
              value={sub.code}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
            />
          </div>

          <div className="ct-panel__rate">
            <div className="ct-panel__stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={`ct-panel__star ${n <= (drafts[sub.id]?.rating || 0) ? 'is-on' : ''}`}
                  onClick={() => setDrafts((d) => ({ ...d, [sub.id]: { ...d[sub.id], rating: n } }))}
                >★</span>
              ))}
            </div>
            <textarea
              rows={1}
              className="ct-panel__comment"
              placeholder="Comment (optional)"
              value={drafts[sub.id]?.comment || ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [sub.id]: { ...d[sub.id], comment: e.target.value } }))}
            />
            <Button size="sm" variant="secondary" onClick={() => onRerun(sub)} loading={busy === `rerun-${sub.id}`}>Re-run</Button>
            <Button size="sm" onClick={() => onRate(sub)} loading={busy === `rate-${sub.id}`}>Save rating</Button>
          </div>
        </div>
      ))}

      {!ct.outcome && ct.outcome !== 'shortlisted' && ct.outcome !== 'rejected' && (
        <div className="ct-panel__actions">
          <Button onClick={onShortlist} loading={busy === 'shortlist'} disabled={!allRated}>Shortlist candidate</Button>
          <Button variant="secondary" onClick={onReject} loading={busy === 'reject'} disabled={!allRated}>Reject candidate</Button>
          {!allRated && <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>Rate all problems first</span>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git -C frontend add src/features/candidates/CodingTestPanel.jsx src/features/candidates/CodingTestPanel.scss
git -C frontend commit -m "feat: add CodingTestPanel for candidate detail page"
```

---

## Task G3: Send Coding Test modal + wire into CandidateDetailPage

**Files:**
- Create: `frontend/src/features/candidates/SendCodingTestModal.jsx`
- Modify: `frontend/src/features/candidates/CandidateDetailPage.jsx`

- [ ] **Step 1: Create the send modal**

```jsx
// frontend/src/features/candidates/SendCodingTestModal.jsx
import { useState } from 'react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { candidateApi } from '@/api/candidateApi';

export default function SendCodingTestModal({ open, candidateId, onClose, onSent }) {
  const { push } = useToast();
  const [form, setForm] = useState({ problemCount: 1, durationMinutes: 30, difficulty: 'medium' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await candidateApi.sendCodingTest(candidateId, {
        problemCount: Number(form.problemCount),
        durationMinutes: Number(form.durationMinutes),
        difficulty: form.difficulty,
      });
      push({ type: 'success', message: 'Coding test sent — candidate will receive an email shortly' });
      onSent?.();
      onClose();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Failed to send coding test' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send coding test"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Send coding test</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <Input
          label="Number of problems (1–5)"
          type="number" min="1" max="5"
          value={form.problemCount}
          onChange={(e) => setForm({ ...form, problemCount: e.target.value })}
        />
        <Input
          label="Duration (minutes)"
          type="number" min="5" max="240"
          value={form.durationMinutes}
          onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
        />
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Difficulty</label>
          <select
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
            style={{ width: '100%', padding: '8px 10px' }}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Wire into CandidateDetailPage**

Open `frontend/src/features/candidates/CandidateDetailPage.jsx`.

Add imports near the existing ones:

```jsx
import CodingTestPanel from './CodingTestPanel';
import SendCodingTestModal from './SendCodingTestModal';
```

Inside the component, add state for the send-coding-test modal:

```jsx
const [codingTestOpen, setCodingTestOpen] = useState(false);
```

In the action bar (the `<div className="candidate-detail__actions">`), add a new button. Place it next to the existing "Send test" button (or wherever fits in the flow):

```jsx
{['resume_approved', 'pending', 'completed', 'shortlisted'].includes(c.status) && (
  <Button variant="secondary" onClick={() => setCodingTestOpen(true)}>
    {c.codingTest?.sentAt ? 'Re-send coding test' : 'Send coding test'}
  </Button>
)}
```

Place `<CodingTestPanel>` in the body of the page, right after `<ScreeningPanel>` (before `<ReviewPanel>`):

```jsx
<CodingTestPanel candidate={c} onRefresh={refresh} />
```

Add the modal near the bottom (alongside the existing override-confirmation Modal):

```jsx
<SendCodingTestModal
  open={codingTestOpen}
  candidateId={c.id}
  onClose={() => setCodingTestOpen(false)}
  onSent={refresh}
/>
```

- [ ] **Step 3: Build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

```bash
git -C frontend add src/features/candidates/SendCodingTestModal.jsx src/features/candidates/CandidateDetailPage.jsx
git -C frontend commit -m "feat: wire CodingTestPanel + Send coding test on candidate detail"
```

---

# Phase H — End-to-end verification

## Task H1: Full pass + manual E2E

**Files:** None (verification only)

- [ ] **Step 1: Full backend test suite**

```bash
cd backend && npm test --silent
```
Expected: all tests pass. Existing 87 + new ones from A4 (6) + A5 (6) + C2 (4) + C4 (5) = ~108 tests.

- [ ] **Step 2: Full frontend build**

```bash
cd frontend && npx vite build 2>&1 | tail -10
```
Expected: clean build, no errors.

- [ ] **Step 3: Manual E2E — happy path (only coding test, no MCQ)**

With backend (`npm run dev`) and frontend (`npm run dev`) running:

1. As HR, navigate to **Coding Problems** → create a problem manually with tech stack matching your test candidate (`react`, `mid`), supported langs `[js, python]`, 2 test cases (1 sample + 1 hidden).
2. Navigate to **Coding Problems** → create another problem via **"Generate entire problem"** with topic "string reversal" and difficulty `easy`. Confirm the AI draft renders. Save.
3. Create a candidate (no resume needed — Phase 4 resume_pending state works, just approve manually). Get to `resume_approved` state.
4. On the candidate detail page, click **Send coding test** → modal opens → pick 1 problem, 30 min, easy. Click Send.
5. Confirm the candidate's email contains the coding-test link. Open the link in an incognito window.
6. Verify: editor renders, language picker shows JS/Python, problem description shows. Try pasting — should be blocked with a toast. Try right-click — context menu blocked. Switch tabs and come back — warning modal appears.
7. Write code that passes both test cases. Submit.
8. Back on HR side, refresh the candidate detail page → **Coding Test panel** renders with the passed/failed per case, the read-only Monaco view of the code, tab-switch badge.
9. Rate 4 stars + write a comment. Click **Save rating**.
10. Click **Shortlist candidate** → confirm status flips to `shortlisted`, shortlist email is logged in backend stdout.

- [ ] **Step 4: Manual E2E — both MCQ + coding sent (MCQ suppression)**

1. Create another candidate, approve resume.
2. Send MCQ test (existing flow). Don't submit yet.
3. Send coding test. Both tests now pending.
4. Submit the MCQ test in incognito (candidate side). Check backend logs: should see `"Round 1 auto-outcome suppressed — coding test pending review"`. Status should NOT have flipped to shortlisted/rejected.
5. Submit the coding test. Rate it on HR side. Click **Shortlist** or **Reject**. Confirm only ONE outcome email fires.

- [ ] **Step 5: Manual E2E — AI fallback during sampling**

1. Pick a tech stack with NO existing problems (e.g. create a candidate with `rust`).
2. Send coding test. Confirm: backend logs the AI generation, the problem appears in the Coding Problems bank with `source: ai`, and the candidate receives the link normally.

- [ ] **Step 6: Manual E2E — Piston failure simulation**

This is optional and best done by temporarily editing `codingExecutionService.PISTON_URL` to a bad URL. Submit a test → confirm submissions are stored with `runs[].error` populated, HR sees the error in the panel, and **Re-run all** works after restoring the URL.

If everything passes, this task is done.

---

## Self-Review

Walking the plan against the spec:

1. **Spec §3 (CodingProblem entity)** — Tasks A1–A6 cover the model, repo, validators, service (with sampling + AI fallback), AI service, controller, and routes.
2. **Spec §4 (Sending the coding test)** — Tasks B1–B4 cover the Candidate sub-doc, candidate-side invite email, service actions (send/regenerate/resend), and HR endpoints. AI fallback in the sampling pipeline is in Task A5.
3. **Spec §5 (Candidate UI)** — Tasks F1–F2 cover the API/slice and the Monaco-based test page with anti-cheat, timer, multi-problem nav, and submit flow.
4. **Spec §6 (Submission storage + Piston)** — Tasks C1 (model+repo), C2 (codingExecutionService with tests), C4 (codingSubmissionService with submit/rate/rerun + tests), C5 (public + admin routes).
5. **Spec §7 (HR review UI)** — Task G2 (CodingTestPanel with rating, re-run, per-case results, read-only Monaco), G3 (send modal + wiring into detail page).
6. **Spec §8 (Status model + MCQ suppression)** — Task C6 (MCQ suppression check), B1 (codingTest sub-doc), D1 (shortlist/reject actions that update `codingTest.outcome` + status + email).
7. **Spec §9 (Emails)** — Task B2 (candidate invite), C3 (HR submission notification). Shortlist/reject emails reused from Phase 2 in D1.
8. **Spec §10 (Edge cases)** — Submit/rate/rerun guards in C4, C5; "already submitted" rejected in `submitByToken`; Piston failure handled in `runOne`; soft-delete behavior in A5; auto-submit on timer in F2; tab-switch counter persisted in C4.
9. **Spec §11 (Rollout)** — No data migration; only additive changes; one MCQ-flow tweak in C6; no env vars; `@monaco-editor/react` is the only new dep, added in E1.
10. **Spec §12 (Testing)** — Tests files in tasks A4, A5, C2, C4 mirror the test plan in §12.

**Type consistency:** `codingTest.outcome` values (`'pending_review' | 'shortlisted' | 'rejected'`) consistent across model (B1), service guards (D1), suppression (C6), UI (G2). `CodingSubmission.runs[].passed` boolean consistent across model (C1), service (C4), exec (C2), and UI (G2). Error codes (`E_NO_PROBLEMS`, `E_ALREADY_SUBMITTED`, `E_CODING_TEST_EXPIRED`, `E_CODING_TEST_ALREADY_SENT`, `E_NO_CODING_TEST`, `E_NO_CODING_SUBMISSION`, `E_ALREADY_DECIDED`, `E_AI_UNAVAILABLE`) uniquely defined.

**Placeholder scan:** No "TBD", no "implement later", no vague "handle edge cases". Each step contains the code or command to run.
