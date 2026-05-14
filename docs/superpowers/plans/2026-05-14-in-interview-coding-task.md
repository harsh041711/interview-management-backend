# In-Interview Coding Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Send coding task" button to the interviewer's live co-pilot page that AI-generates a coding problem, returns a public link to paste into Zoom/Meet chat, and shows the candidate's final submission (code + per-test-case pass/fail) on the same page.

**Architecture:** One new MongoDB collection `LiveCodingTask` embeds the AI-generated problem and the candidate's submission. The interviewer's side reuses existing middleware (`requireAuth`, `requireMyInterview`). The candidate's side uses a new token-gated public route. AI generation reuses `codingProblemAiService.generateFullProblem`. Code execution reuses `codingExecutionService.runAllTestCases` (Piston).

**Tech Stack:** Node.js + Express + Mongoose (backend); React + Redux Toolkit + react-router + Monaco editor (frontend); Jest for backend tests.

**Spec:** `docs/superpowers/specs/2026-05-14-in-interview-coding-task-design.md`

---

## File Map

### Backend — Created

| File | Responsibility |
|---|---|
| `backend/src/models/LiveCodingTask.js` | Mongoose model with embedded `problem` and `submission` sub-schemas. |
| `backend/src/repositories/liveCodingTaskRepository.js` | DB access — `create`, `findById`, `findByToken`, `listByInterview`, `updateById`. |
| `backend/src/validators/liveCodingTaskValidator.js` | Joi schemas — `createSchema`, `tokenParamSchema`, `runSchema`, `submitSchema`, `interviewIdParam`, `cancelParamsSchema`. |
| `backend/src/services/liveCodingTaskService.js` | Business logic — `create`, `getPublic`, `runPublic`, `submitPublic`, `listForInterview`, `cancel`. |
| `backend/src/controllers/liveCodingTaskController.js` | HTTP wrappers. |
| `backend/src/routes/liveCodingTaskPublicRoutes.js` | Token-gated public routes — `GET /:token`, `POST /:token/run`, `POST /:token/submit`. |
| `backend/tests/unit/liveCodingTaskService.test.js` | Jest tests for the service layer. |

### Backend — Modified

| File | Change |
|---|---|
| `backend/src/utils/constants.js` | Add `LIVE_CODING_TASK_STATUS` + `LIVE_CODING_TASK_STATUS_LIST`. |
| `backend/src/routes/myInterviewRoutes.js` | Add three interviewer-side routes (create / list / cancel). |
| `backend/src/routes/index.js` | Mount the new public router at `/coding-tasks`. |

### Frontend — Created

| File | Responsibility |
|---|---|
| `frontend/src/api/liveCodingTaskApi.js` | API client (interviewer-side + public-side). |
| `frontend/src/features/liveInterview/codingTasksSlice.js` | Redux slice for the co-pilot tasks panel. |
| `frontend/src/features/liveInterview/SendCodingTaskModal.jsx` | Two-step modal: configure → preview + copy link. |
| `frontend/src/features/liveInterview/SendCodingTaskModal.scss` | Local styles. |
| `frontend/src/features/liveInterview/CodingTasksPanel.jsx` | Polled list of tasks for this interview. |
| `frontend/src/features/liveInterview/CodingTasksPanel.scss` | Local styles. |
| `frontend/src/features/codingTask/CodingTaskPage.jsx` | Public candidate-facing runner page. |
| `frontend/src/features/codingTask/CodingTaskPage.scss` | Local styles. |

### Frontend — Modified

| File | Change |
|---|---|
| `frontend/src/app/store.js` | Register `codingTasks` reducer. |
| `frontend/src/features/liveInterview/LiveInterviewPage.jsx` | Add "Send coding task" topbar button + render `<CodingTasksPanel>` below questions. |
| `frontend/src/features/liveInterview/LiveInterviewPage.scss` | Button + panel spacing. |
| `frontend/src/routes/AppRoutes.jsx` | Add public route `/coding-task/:token` → `CodingTaskPage`. |

---

## Task 1: Constants + LiveCodingTask Model

**Files:**
- Modify: `backend/src/utils/constants.js`
- Create: `backend/src/models/LiveCodingTask.js`

- [ ] **Step 1: Add constants for the new status enum**

Edit `backend/src/utils/constants.js`. Find the block of `Object.freeze(...)` declarations and add this one right after `PROMPT_PROBLEM_SOURCE`:

```js
const LIVE_CODING_TASK_STATUS = Object.freeze({
  PENDING:   'pending',
  OPENED:    'opened',
  SUBMITTED: 'submitted',
  CANCELLED: 'cancelled',
});
const LIVE_CODING_TASK_STATUS_LIST = Object.values(LIVE_CODING_TASK_STATUS);
```

Then add both names to the `module.exports = { ... }` object at the bottom of the file (alongside the existing exports).

- [ ] **Step 2: Create the model file**

Create `backend/src/models/LiveCodingTask.js`:

```js
'use strict';

const mongoose = require('mongoose');
const { DIFFICULTY_LIST, LIVE_CODING_TASK_STATUS, LIVE_CODING_TASK_STATUS_LIST } = require('../utils/constants');

const LANGUAGES = ['js', 'python', 'php'];

const testCaseSchema = new mongoose.Schema(
  {
    stdin:          { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    isHidden:       { type: Boolean, default: true },
  },
  { _id: false },
);

const problemSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 10000 },
    difficulty:  { type: String, enum: DIFFICULTY_LIST, required: true },
    language:    { type: String, enum: LANGUAGES, required: true },
    starterCode: { type: String, default: '' },
    testCases:   { type: [testCaseSchema], default: [] },
  },
  { _id: false },
);

const runResultSchema = new mongoose.Schema(
  {
    stdin:          { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    actualStdout:   { type: String, default: '' },
    stderr:         { type: String, default: '' },
    passed:         { type: Boolean, default: false },
    runtimeMs:      { type: Number, default: 0 },
    error:          { type: String, default: null },
  },
  { _id: false },
);

const submissionSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true },
    submittedAt: { type: Date, required: true },
    results:     { type: [runResultSchema], default: [] },
    summary: {
      passed: { type: Number, default: 0 },
      total:  { type: Number, default: 0 },
    },
  },
  { _id: false },
);

const taskSchema = new mongoose.Schema(
  {
    interview:    { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true, index: true },
    candidate:    { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    interviewer:  { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true },
    liveSession:  { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', default: null },

    token:        { type: String, required: true, unique: true },

    problem:      { type: problemSchema, required: true },
    submission:   { type: submissionSchema, default: null },

    status: {
      type: String,
      enum: LIVE_CODING_TASK_STATUS_LIST,
      default: LIVE_CODING_TASK_STATUS.PENDING,
      index: true,
    },
    openedAt:    { type: Date, default: null },
    submittedAt: { type: Date, default: null },
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

taskSchema.index({ interview: 1, createdAt: -1 });

module.exports = mongoose.model('LiveCodingTask', taskSchema);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/constants.js backend/src/models/LiveCodingTask.js
git commit -m "feat(live-coding-task): add status enum + Mongoose model"
```

---

## Task 2: Repository

**Files:**
- Create: `backend/src/repositories/liveCodingTaskRepository.js`

- [ ] **Step 1: Create the repository file**

Create `backend/src/repositories/liveCodingTaskRepository.js`:

```js
'use strict';
const LiveCodingTask = require('../models/LiveCodingTask');

const create = (data) => LiveCodingTask.create(data);

const findById = (id) => LiveCodingTask.findById(id);

const findByToken = (token) => LiveCodingTask.findOne({ token });

const listByInterview = (interviewId) =>
  LiveCodingTask.find({ interview: interviewId }).sort({ createdAt: -1 });

const updateById = (id, patch) =>
  LiveCodingTask.findByIdAndUpdate(id, patch, { new: true });

module.exports = { create, findById, findByToken, listByInterview, updateById };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/liveCodingTaskRepository.js
git commit -m "feat(live-coding-task): add repository"
```

---

## Task 3: Validators

**Files:**
- Create: `backend/src/validators/liveCodingTaskValidator.js`

- [ ] **Step 1: Create the validator file**

Create `backend/src/validators/liveCodingTaskValidator.js`:

```js
'use strict';
const Joi = require('joi');
const { DIFFICULTY_LIST } = require('../utils/constants');

const objectId = Joi.string().hex().length(24);
const LANGUAGES = ['js', 'python', 'php'];

const interviewIdParam = { params: Joi.object({ id: objectId.required() }) };

const createSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    difficulty: Joi.string().valid(...DIFFICULTY_LIST).required(),
    language:   Joi.string().valid(...LANGUAGES).required(),
  }),
};

const cancelParamsSchema = {
  params: Joi.object({
    id:     objectId.required(),
    taskId: objectId.required(),
  }),
};

const tokenParamSchema = {
  params: Joi.object({ token: Joi.string().min(8).max(128).required() }),
};

const runSchema = {
  params: Joi.object({ token: Joi.string().min(8).max(128).required() }),
  body:   Joi.object({ code: Joi.string().allow('').max(50000).required() }),
};

const submitSchema = runSchema;

module.exports = {
  interviewIdParam,
  createSchema,
  cancelParamsSchema,
  tokenParamSchema,
  runSchema,
  submitSchema,
};
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/validators/liveCodingTaskValidator.js
git commit -m "feat(live-coding-task): add Joi validators"
```

---

## Task 4: Service — `create` (with tests)

**Files:**
- Create: `backend/src/services/liveCodingTaskService.js`
- Create: `backend/tests/unit/liveCodingTaskService.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/liveCodingTaskService.test.js`:

```js
'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';

jest.mock('../../src/repositories/liveCodingTaskRepository');
jest.mock('../../src/repositories/interviewRepository');
jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/repositories/liveSessionRepository');
jest.mock('../../src/services/codingProblemAiService', () => ({
  generateFullProblem: jest.fn(),
}));
jest.mock('../../src/services/codingExecutionService', () => ({
  runAllTestCases: jest.fn(),
}));

const taskRepo = require('../../src/repositories/liveCodingTaskRepository');
const interviewRepo = require('../../src/repositories/interviewRepository');
const candidateRepo = require('../../src/repositories/candidateRepository');
const liveSessionRepo = require('../../src/repositories/liveSessionRepository');
const aiService = require('../../src/services/codingProblemAiService');
const execService = require('../../src/services/codingExecutionService');
const svc = require('../../src/services/liveCodingTaskService');

const INTERVIEWER = 'i1';
const INTERVIEW_ID = 'iv1';
const CANDIDATE_ID = 'c1';

const baseInterview = (overrides = {}) => ({
  _id: INTERVIEW_ID, id: INTERVIEW_ID,
  candidate: { _id: CANDIDATE_ID, id: CANDIDATE_ID },
  interviewer: INTERVIEWER,
  status: 'scheduled',
  role: 'Backend Engineer',
  ...overrides,
});

const baseAiProblem = () => ({
  title: 'Sum two numbers',
  description: 'Read two ints from stdin, print their sum.',
  difficulty: 'easy',
  supportedLanguages: ['js'],
  starterCode: { js: '// starter', python: '', php: '' },
  testCases: [
    { stdin: '1 2', expectedStdout: '3', isHidden: false },
    { stdin: '4 5', expectedStdout: '9', isHidden: true },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  interviewRepo.findByIdPopulated = jest.fn().mockResolvedValue(baseInterview());
  candidateRepo.findById = jest.fn().mockResolvedValue({
    _id: CANDIDATE_ID,
    screening: { jdSnapshot: { title: 'Backend Eng', jobRole: 'API engineer' } },
  });
  liveSessionRepo.findActiveByInterview = jest.fn().mockResolvedValue(null);
  aiService.generateFullProblem.mockResolvedValue(baseAiProblem());
  taskRepo.create = jest.fn().mockImplementation((doc) => Promise.resolve({
    ...doc, _id: 't1', id: 't1', toObject() { return { ...this }; },
  }));
});

describe('liveCodingTaskService.create', () => {
  test('generates problem via AI and persists task with token + starter code', async () => {
    const task = await svc.create({
      interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER,
      difficulty: 'easy', language: 'js',
    });

    expect(aiService.generateFullProblem).toHaveBeenCalledWith({
      topic: 'API engineer', difficulty: 'easy', languages: ['js'],
    });
    expect(taskRepo.create).toHaveBeenCalled();
    const created = taskRepo.create.mock.calls[0][0];
    expect(created.interview).toBe(INTERVIEW_ID);
    expect(created.interviewer).toBe(INTERVIEWER);
    expect(created.candidate).toBe(CANDIDATE_ID);
    expect(typeof created.token).toBe('string');
    expect(created.token.length).toBeGreaterThanOrEqual(32);
    expect(created.problem.language).toBe('js');
    expect(created.problem.starterCode).toBe('// starter');
    expect(created.problem.testCases).toHaveLength(2);
    expect(task.id).toBe('t1');
  });

  test('links liveSession when one is active for the interview', async () => {
    liveSessionRepo.findActiveByInterview = jest.fn().mockResolvedValue({ _id: 's1', id: 's1' });
    await svc.create({ interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER, difficulty: 'easy', language: 'js' });
    expect(taskRepo.create.mock.calls[0][0].liveSession).toBe('s1');
  });

  test('rejects if interview status is not scheduled', async () => {
    interviewRepo.findByIdPopulated = jest.fn().mockResolvedValue(baseInterview({ status: 'cancelled' }));
    await expect(svc.create({
      interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER, difficulty: 'easy', language: 'js',
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('rejects if AI returns null', async () => {
    aiService.generateFullProblem.mockResolvedValue(null);
    await expect(svc.create({
      interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER, difficulty: 'easy', language: 'js',
    })).rejects.toMatchObject({ statusCode: 503 });
  });

  test('rejects if interview is not found', async () => {
    interviewRepo.findByIdPopulated = jest.fn().mockResolvedValue(null);
    await expect(svc.create({
      interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER, difficulty: 'easy', language: 'js',
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && npm test -- liveCodingTaskService
```
Expected: FAIL — `Cannot find module '../../src/services/liveCodingTaskService'`.

- [ ] **Step 3: Create the service file**

Create `backend/src/services/liveCodingTaskService.js`:

```js
'use strict';

const crypto = require('crypto');
const taskRepo = require('../repositories/liveCodingTaskRepository');
const interviewRepo = require('../repositories/interviewRepository');
const candidateRepo = require('../repositories/candidateRepository');
const liveSessionRepo = require('../repositories/liveSessionRepository');
const aiService = require('./codingProblemAiService');
const execService = require('./codingExecutionService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { LIVE_CODING_TASK_STATUS } = require('../utils/constants');

const toObj = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const generateToken = () => crypto.randomBytes(24).toString('hex');

const buildTopic = (candidate, interview) => {
  const snap = candidate?.screening?.jdSnapshot;
  return (
    snap?.jobRole
    || snap?.title
    || interview?.role
    || 'general programming'
  );
};

const create = async ({ interviewId, interviewerId, difficulty, language }) => {
  const interview = await interviewRepo.findByIdPopulated(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');
  if (interview.status !== 'scheduled') {
    throw ApiError.conflict(`Cannot send a coding task while the interview is ${interview.status}`, { code: 'E_BAD_STATUS' });
  }

  const candidateId = (interview.candidate && (interview.candidate._id || interview.candidate.id)) || null;
  if (!candidateId) throw ApiError.badRequest('Interview has no candidate');

  const candidate = await candidateRepo.findById(candidateId);
  const topic = buildTopic(candidate, interview);

  const aiProblem = await aiService.generateFullProblem({ topic, difficulty, languages: [language] });
  if (!aiProblem) {
    throw ApiError.serviceUnavailable('AI could not generate a problem — try again', { code: 'E_AI_FAILED' });
  }

  const starterCode = String(aiProblem.starterCode?.[language] || '');
  const testCases = (aiProblem.testCases || []).map((tc, idx) => ({
    stdin: String(tc.stdin || ''),
    expectedStdout: String(tc.expectedStdout || ''),
    isHidden: idx === 0 ? false : tc.isHidden !== false,
  }));

  const active = await liveSessionRepo.findActiveByInterview(interviewId);

  const created = await taskRepo.create({
    interview: interviewId,
    candidate: candidateId,
    interviewer: interviewerId,
    liveSession: active ? (active._id || active.id) : null,
    token: generateToken(),
    problem: {
      title: aiProblem.title,
      description: aiProblem.description,
      difficulty,
      language,
      starterCode,
      testCases,
    },
    status: LIVE_CODING_TASK_STATUS.PENDING,
  });

  logger.info('LiveCodingTask created', { interviewId, taskId: created._id || created.id });
  return toObj(created);
};

module.exports = { create };
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && npm test -- liveCodingTaskService
```
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/liveCodingTaskService.js backend/tests/unit/liveCodingTaskService.test.js
git commit -m "feat(live-coding-task): service.create with AI generation"
```

---

## Task 5: Service — `getPublic` and `runPublic` (with tests)

**Files:**
- Modify: `backend/src/services/liveCodingTaskService.js`
- Modify: `backend/tests/unit/liveCodingTaskService.test.js`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/unit/liveCodingTaskService.test.js`:

```js
const baseStoredTask = (overrides = {}) => ({
  _id: 't1', id: 't1',
  token: 'tok-123',
  status: 'pending',
  problem: {
    language: 'js',
    starterCode: '// starter',
    testCases: [
      { stdin: '1 2', expectedStdout: '3', isHidden: false },
      { stdin: '4 5', expectedStdout: '9', isHidden: true },
    ],
  },
  submission: null,
  toObject() { return { ...this }; },
  ...overrides,
});

describe('liveCodingTaskService.getPublic', () => {
  test('returns 404 when token is unknown', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(null);
    await expect(svc.getPublic({ token: 'bad' })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('returns 410 when task is cancelled', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'cancelled' }));
    await expect(svc.getPublic({ token: 'tok-123' })).rejects.toMatchObject({ statusCode: 410 });
  });

  test('flips pending → opened on first GET and sets openedAt', async () => {
    const stored = baseStoredTask();
    taskRepo.findByToken = jest.fn().mockResolvedValue(stored);
    taskRepo.updateById = jest.fn().mockImplementation((id, patch) => Promise.resolve({
      ...stored, ...patch, toObject() { return { ...this }; },
    }));
    const out = await svc.getPublic({ token: 'tok-123' });
    expect(taskRepo.updateById).toHaveBeenCalledWith('t1', expect.objectContaining({
      status: 'opened',
      openedAt: expect.any(Date),
    }));
    expect(out.status).toBe('opened');
  });

  test('does not flip status if already opened', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'opened' }));
    taskRepo.updateById = jest.fn();
    await svc.getPublic({ token: 'tok-123' });
    expect(taskRepo.updateById).not.toHaveBeenCalled();
  });

  test('strips expectedStdout from hidden test cases but keeps visible ones', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'opened' }));
    const out = await svc.getPublic({ token: 'tok-123' });
    expect(out.problem.testCases[0].expectedStdout).toBe('3'); // visible kept
    expect(out.problem.testCases[1].expectedStdout).toBeUndefined(); // hidden stripped
  });

  test('strips internal fields (token, interviewer, liveSession) from response', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'opened', interviewer: 'i1', liveSession: 's1' }));
    const out = await svc.getPublic({ token: 'tok-123' });
    expect(out.token).toBeUndefined();
    expect(out.interviewer).toBeUndefined();
    expect(out.liveSession).toBeUndefined();
  });
});

describe('liveCodingTaskService.runPublic', () => {
  test('returns 404 for unknown token', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(null);
    await expect(svc.runPublic({ token: 'bad', code: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects if already submitted', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'submitted' }));
    await expect(svc.runPublic({ token: 'tok-123', code: 'x' })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('rejects if cancelled', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'cancelled' }));
    await expect(svc.runPublic({ token: 'tok-123', code: 'x' })).rejects.toMatchObject({ statusCode: 410 });
  });

  test('runs visible test cases only and does not persist', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'opened' }));
    taskRepo.updateById = jest.fn();
    execService.runAllTestCases.mockResolvedValue([
      { stdin: '1 2', expectedStdout: '3', actualStdout: '3', stderr: '', passed: true, runtimeMs: 10, error: null },
    ]);
    const out = await svc.runPublic({ token: 'tok-123', code: 'console.log(3)' });
    expect(execService.runAllTestCases).toHaveBeenCalledWith({
      language: 'js',
      code: 'console.log(3)',
      testCases: [{ stdin: '1 2', expectedStdout: '3', isHidden: false }],
    });
    expect(taskRepo.updateById).not.toHaveBeenCalled();
    expect(out.results).toHaveLength(1);
    expect(out.results[0].passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && npm test -- liveCodingTaskService
```
Expected: FAIL — `svc.getPublic is not a function`, `svc.runPublic is not a function`.

- [ ] **Step 3: Add `getPublic` and `runPublic` to the service**

Edit `backend/src/services/liveCodingTaskService.js`. After the `create` function and before `module.exports`, add:

```js
const stripPublicFields = (task) => {
  const out = toObj(task);
  delete out.token;
  delete out.interviewer;
  delete out.liveSession;
  delete out.submission; // candidate doesn't need to see their submission echoed back here
  // Hide expected output of hidden test cases — candidate can see visible samples only.
  if (out.problem && Array.isArray(out.problem.testCases)) {
    out.problem.testCases = out.problem.testCases.map((tc) => {
      if (tc.isHidden) {
        const { expectedStdout, ...rest } = tc;
        return rest;
      }
      return tc;
    });
  }
  return out;
};

const loadByTokenOrThrow = async (token) => {
  const t = await taskRepo.findByToken(token);
  if (!t) throw ApiError.notFound('Coding task not found', { code: 'E_NOT_FOUND' });
  if (t.status === LIVE_CODING_TASK_STATUS.CANCELLED) {
    throw ApiError.gone('Your interviewer cancelled this task', { code: 'E_CANCELLED' });
  }
  return t;
};

const getPublic = async ({ token }) => {
  const task = await loadByTokenOrThrow(token);
  let current = task;
  if (task.status === LIVE_CODING_TASK_STATUS.PENDING) {
    current = await taskRepo.updateById(task._id || task.id, {
      status: LIVE_CODING_TASK_STATUS.OPENED,
      openedAt: new Date(),
    });
  }
  return stripPublicFields(current);
};

const runPublic = async ({ token, code }) => {
  const task = await loadByTokenOrThrow(token);
  if (task.status === LIVE_CODING_TASK_STATUS.SUBMITTED) {
    throw ApiError.conflict('Task already submitted', { code: 'E_ALREADY_SUBMITTED' });
  }
  const visibleCases = (task.problem.testCases || []).filter((tc) => !tc.isHidden);
  const results = await execService.runAllTestCases({
    language: task.problem.language,
    code,
    testCases: visibleCases,
  });
  return { results };
};
```

Also update `module.exports` to include the new methods:

```js
module.exports = { create, getPublic, runPublic };
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && npm test -- liveCodingTaskService
```
Expected: PASS — all tests green (including 6 new for getPublic + 4 for runPublic).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/liveCodingTaskService.js backend/tests/unit/liveCodingTaskService.test.js
git commit -m "feat(live-coding-task): service.getPublic + runPublic"
```

---

## Task 6: Service — `submitPublic`, `listForInterview`, `cancel` (with tests)

**Files:**
- Modify: `backend/src/services/liveCodingTaskService.js`
- Modify: `backend/tests/unit/liveCodingTaskService.test.js`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/unit/liveCodingTaskService.test.js`:

```js
describe('liveCodingTaskService.submitPublic', () => {
  test('rejects if already submitted', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'submitted' }));
    await expect(svc.submitPublic({ token: 'tok-123', code: 'x' })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('runs ALL test cases, persists submission, flips status to submitted', async () => {
    const stored = baseStoredTask({ status: 'opened' });
    taskRepo.findByToken = jest.fn().mockResolvedValue(stored);
    taskRepo.updateById = jest.fn().mockImplementation((id, patch) => Promise.resolve({
      ...stored, ...patch, toObject() { return { ...this }; },
    }));
    execService.runAllTestCases.mockResolvedValue([
      { stdin: '1 2', expectedStdout: '3', actualStdout: '3', passed: true,  stderr: '', runtimeMs: 1, error: null },
      { stdin: '4 5', expectedStdout: '9', actualStdout: '8', passed: false, stderr: '', runtimeMs: 1, error: null },
    ]);
    const out = await svc.submitPublic({ token: 'tok-123', code: 'foo' });
    expect(execService.runAllTestCases).toHaveBeenCalledWith({
      language: 'js',
      code: 'foo',
      testCases: stored.problem.testCases,
    });
    const patch = taskRepo.updateById.mock.calls[0][1];
    expect(patch.status).toBe('submitted');
    expect(patch.submission.code).toBe('foo');
    expect(patch.submission.summary).toEqual({ passed: 1, total: 2 });
    expect(out.summary).toEqual({ passed: 1, total: 2 });
  });
});

describe('liveCodingTaskService.listForInterview', () => {
  test('returns all tasks for the interview, newest first', async () => {
    taskRepo.listByInterview = jest.fn().mockResolvedValue([
      { _id: 't2', id: 't2', toObject() { return { ...this }; } },
      { _id: 't1', id: 't1', toObject() { return { ...this }; } },
    ]);
    const out = await svc.listForInterview({ interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER });
    expect(taskRepo.listByInterview).toHaveBeenCalledWith(INTERVIEW_ID);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('t2');
  });
});

describe('liveCodingTaskService.cancel', () => {
  test('cancels a pending task', async () => {
    const stored = baseStoredTask({ status: 'pending', interviewer: INTERVIEWER });
    taskRepo.findById = jest.fn().mockResolvedValue(stored);
    taskRepo.updateById = jest.fn().mockImplementation((id, patch) => Promise.resolve({ ...stored, ...patch, toObject() { return { ...this }; } }));
    const out = await svc.cancel({ taskId: 't1', interviewerId: INTERVIEWER });
    expect(taskRepo.updateById).toHaveBeenCalledWith('t1', { status: 'cancelled' });
    expect(out.status).toBe('cancelled');
  });

  test('rejects if not the owning interviewer', async () => {
    taskRepo.findById = jest.fn().mockResolvedValue(baseStoredTask({ status: 'pending', interviewer: 'someone-else' }));
    await expect(svc.cancel({ taskId: 't1', interviewerId: INTERVIEWER })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('rejects if task is already submitted', async () => {
    taskRepo.findById = jest.fn().mockResolvedValue(baseStoredTask({ status: 'submitted', interviewer: INTERVIEWER }));
    await expect(svc.cancel({ taskId: 't1', interviewerId: INTERVIEWER })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('rejects if task not found', async () => {
    taskRepo.findById = jest.fn().mockResolvedValue(null);
    await expect(svc.cancel({ taskId: 't1', interviewerId: INTERVIEWER })).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && npm test -- liveCodingTaskService
```
Expected: FAIL — `svc.submitPublic is not a function`, etc.

- [ ] **Step 3: Implement the three new service methods**

Edit `backend/src/services/liveCodingTaskService.js`. Add these functions before `module.exports`:

```js
const submitPublic = async ({ token, code }) => {
  const task = await loadByTokenOrThrow(token);
  if (task.status === LIVE_CODING_TASK_STATUS.SUBMITTED) {
    throw ApiError.conflict('Task already submitted', { code: 'E_ALREADY_SUBMITTED' });
  }
  const results = await execService.runAllTestCases({
    language: task.problem.language,
    code,
    testCases: task.problem.testCases || [],
  });
  const passed = results.filter((r) => r.passed).length;
  const summary = { passed, total: results.length };
  const now = new Date();
  await taskRepo.updateById(task._id || task.id, {
    status: LIVE_CODING_TASK_STATUS.SUBMITTED,
    submittedAt: now,
    submission: { code, submittedAt: now, results, summary },
  });
  return { summary };
};

const listForInterview = async ({ interviewId }) => {
  const tasks = await taskRepo.listByInterview(interviewId);
  return tasks.map(toObj);
};

const cancel = async ({ taskId, interviewerId }) => {
  const task = await taskRepo.findById(taskId);
  if (!task) throw ApiError.notFound('Coding task not found');
  if (String(task.interviewer) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your task', { code: 'E_FORBIDDEN' });
  }
  if (
    task.status === LIVE_CODING_TASK_STATUS.SUBMITTED
    || task.status === LIVE_CODING_TASK_STATUS.CANCELLED
  ) {
    throw ApiError.conflict(`Cannot cancel a task that is ${task.status}`, { code: 'E_BAD_STATUS' });
  }
  const updated = await taskRepo.updateById(taskId, { status: LIVE_CODING_TASK_STATUS.CANCELLED });
  return toObj(updated);
};
```

Update `module.exports`:

```js
module.exports = { create, getPublic, runPublic, submitPublic, listForInterview, cancel };
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && npm test -- liveCodingTaskService
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/liveCodingTaskService.js backend/tests/unit/liveCodingTaskService.test.js
git commit -m "feat(live-coding-task): service.submitPublic, list, cancel"
```

---

## Task 7: Controller + Interviewer Routes

**Files:**
- Create: `backend/src/controllers/liveCodingTaskController.js`
- Modify: `backend/src/routes/myInterviewRoutes.js`

- [ ] **Step 1: Create the controller**

Create `backend/src/controllers/liveCodingTaskController.js`:

```js
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const svc = require('../services/liveCodingTaskService');

const create = asyncHandler(async (req, res) => {
  const task = await svc.create({
    interviewId: req.params.id,
    interviewerId: req.user.id,
    difficulty: req.body.difficulty,
    language: req.body.language,
  });
  return created(res, { task }, 'Coding task sent');
});

const list = asyncHandler(async (req, res) => {
  const tasks = await svc.listForInterview({ interviewId: req.params.id });
  return ok(res, { tasks }, 'OK');
});

const cancel = asyncHandler(async (req, res) => {
  const task = await svc.cancel({ taskId: req.params.taskId, interviewerId: req.user.id });
  return ok(res, { task }, 'Cancelled');
});

const getPublic = asyncHandler(async (req, res) => {
  const task = await svc.getPublic({ token: req.params.token });
  return ok(res, { task }, 'OK');
});

const run = asyncHandler(async (req, res) => {
  const out = await svc.runPublic({ token: req.params.token, code: req.body.code });
  return ok(res, out, 'OK');
});

const submit = asyncHandler(async (req, res) => {
  const out = await svc.submitPublic({ token: req.params.token, code: req.body.code });
  return ok(res, out, 'Submitted');
});

module.exports = { create, list, cancel, getPublic, run, submit };
```

- [ ] **Step 2: Wire interviewer routes**

Edit `backend/src/routes/myInterviewRoutes.js`. At the top, after the existing imports, add:

```js
const codingTaskCtrl = require('../controllers/liveCodingTaskController');
const codingTaskValidator = require('../validators/liveCodingTaskValidator');
const { aiLimiter } = require('../middlewares/rateLimiter');
```

Below the existing review routes (before `module.exports`), add:

```js
router.post(
  '/interviews/:id/coding-tasks',
  aiLimiter,
  validate(codingTaskValidator.createSchema),
  requireMyInterview,
  codingTaskCtrl.create,
);
router.get(
  '/interviews/:id/coding-tasks',
  validate(codingTaskValidator.interviewIdParam),
  requireMyInterview,
  codingTaskCtrl.list,
);
router.post(
  '/interviews/:id/coding-tasks/:taskId/cancel',
  validate(codingTaskValidator.cancelParamsSchema),
  requireMyInterview,
  codingTaskCtrl.cancel,
);
```

- [ ] **Step 3: Smoke-test the routes load**

```
cd backend && node -e "require('./src/routes/myInterviewRoutes')"
```
Expected: no output, exit 0. (Any module/require error fails loudly.)

- [ ] **Step 4: Run the full backend test suite**

```
cd backend && npm test
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/liveCodingTaskController.js backend/src/routes/myInterviewRoutes.js
git commit -m "feat(live-coding-task): controller + interviewer routes"
```

---

## Task 8: Public Routes + Mount

**Files:**
- Create: `backend/src/routes/liveCodingTaskPublicRoutes.js`
- Modify: `backend/src/routes/index.js`

- [ ] **Step 1: Create the public routes file**

Create `backend/src/routes/liveCodingTaskPublicRoutes.js`:

```js
'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { codingRunLimiter } = require('../middlewares/rateLimiter');
const ctrl = require('../controllers/liveCodingTaskController');
const v = require('../validators/liveCodingTaskValidator');

const router = express.Router();

router.get('/:token',         validate(v.tokenParamSchema), ctrl.getPublic);
router.post('/:token/run',    codingRunLimiter, validate(v.runSchema), ctrl.run);
router.post('/:token/submit', validate(v.submitSchema), ctrl.submit);

module.exports = router;
```

- [ ] **Step 2: Mount the router**

Edit `backend/src/routes/index.js`. Add the require near the other route requires:

```js
const liveCodingTaskPublicRoutes = require('./liveCodingTaskPublicRoutes');
```

Add the `router.use(...)` line near the other public coding-test mount (right after `router.use('/coding-test', codingTestPublicRoutes);`):

```js
router.use('/coding-tasks', liveCodingTaskPublicRoutes);
```

- [ ] **Step 3: Smoke-test mounting**

```
cd backend && node -e "require('./src/routes')"
```
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/liveCodingTaskPublicRoutes.js backend/src/routes/index.js
git commit -m "feat(live-coding-task): public routes for candidate"
```

---

## Task 9: Frontend API Client

**Files:**
- Create: `frontend/src/api/liveCodingTaskApi.js`

- [ ] **Step 1: Create the API client**

Create `frontend/src/api/liveCodingTaskApi.js`:

```js
import { apiClient } from './axios';

export const liveCodingTaskApi = {
  // Interviewer-side (authenticated)
  create: (interviewId, { difficulty, language }) =>
    apiClient
      .post(`/me/interviews/${interviewId}/coding-tasks`, { difficulty, language })
      .then((r) => r.data.data.task),
  list: (interviewId) =>
    apiClient
      .get(`/me/interviews/${interviewId}/coding-tasks`)
      .then((r) => r.data.data.tasks),
  cancel: (interviewId, taskId) =>
    apiClient
      .post(`/me/interviews/${interviewId}/coding-tasks/${taskId}/cancel`)
      .then((r) => r.data.data.task),

  // Public-side (no auth — token in URL)
  getPublic: (token) =>
    apiClient.get(`/coding-tasks/${token}`).then((r) => r.data.data.task),
  run: (token, code) =>
    apiClient.post(`/coding-tasks/${token}/run`, { code }).then((r) => r.data.data),
  submit: (token, code) =>
    apiClient.post(`/coding-tasks/${token}/submit`, { code }).then((r) => r.data.data),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/liveCodingTaskApi.js
git commit -m "feat(live-coding-task): frontend API client"
```

---

## Task 10: Redux Slice + Store Registration

**Files:**
- Create: `frontend/src/features/liveInterview/codingTasksSlice.js`
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: Create the slice**

Create `frontend/src/features/liveInterview/codingTasksSlice.js`:

```js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { liveCodingTaskApi } from '@/api/liveCodingTaskApi';
import { extractError } from '@/api/axios';

export const fetchCodingTasks = createAsyncThunk(
  'codingTasks/fetch',
  async (interviewId, { rejectWithValue }) => {
    try { return await liveCodingTaskApi.list(interviewId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const createCodingTask = createAsyncThunk(
  'codingTasks/create',
  async ({ interviewId, difficulty, language }, { rejectWithValue }) => {
    try { return await liveCodingTaskApi.create(interviewId, { difficulty, language }); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const cancelCodingTask = createAsyncThunk(
  'codingTasks/cancel',
  async ({ interviewId, taskId }, { rejectWithValue }) => {
    try { return await liveCodingTaskApi.cancel(interviewId, taskId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const initial = {
  list: [],
  status: 'idle',     // 'idle' | 'loading' | 'ready' | 'failed'
  busy: false,        // true during create / cancel
  error: null,
};

const upsert = (list, task) => {
  const idx = list.findIndex((t) => (t._id || t.id) === (task._id || task.id));
  if (idx === -1) return [task, ...list];
  const next = list.slice();
  next[idx] = task;
  return next;
};

const slice = createSlice({
  name: 'codingTasks',
  initialState: initial,
  reducers: {
    clearCodingTasks(state) { state.list = []; state.status = 'idle'; state.error = null; },
  },
  extraReducers: (b) => {
    b.addCase(fetchCodingTasks.pending,  (s) => { s.status = 'loading'; s.error = null; });
    b.addCase(fetchCodingTasks.fulfilled,(s, a) => { s.status = 'ready'; s.list = a.payload || []; });
    b.addCase(fetchCodingTasks.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload; });

    b.addCase(createCodingTask.pending,  (s) => { s.busy = true; s.error = null; });
    b.addCase(createCodingTask.fulfilled,(s, a) => { s.busy = false; s.list = upsert(s.list, a.payload); });
    b.addCase(createCodingTask.rejected, (s, a) => { s.busy = false; s.error = a.payload; });

    b.addCase(cancelCodingTask.pending,  (s) => { s.busy = true; });
    b.addCase(cancelCodingTask.fulfilled,(s, a) => { s.busy = false; s.list = upsert(s.list, a.payload); });
    b.addCase(cancelCodingTask.rejected, (s, a) => { s.busy = false; s.error = a.payload; });
  },
});

export const { clearCodingTasks } = slice.actions;
export default slice.reducer;
```

- [ ] **Step 2: Register the reducer**

Edit `frontend/src/app/store.js`. After the existing `liveInterviewReducer` import, add:

```js
import codingTasksReducer from '@/features/liveInterview/codingTasksSlice';
```

Then in the `reducer:` object, add `codingTasks: codingTasksReducer,` near `liveInterview:`.

- [ ] **Step 3: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds. (Vite will surface import / syntax errors.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/liveInterview/codingTasksSlice.js frontend/src/app/store.js
git commit -m "feat(live-coding-task): Redux slice for co-pilot tasks"
```

---

## Task 11: SendCodingTaskModal Component

**Files:**
- Create: `frontend/src/features/liveInterview/SendCodingTaskModal.jsx`
- Create: `frontend/src/features/liveInterview/SendCodingTaskModal.scss`

- [ ] **Step 1: Create the component**

Create `frontend/src/features/liveInterview/SendCodingTaskModal.jsx`:

```jsx
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { createCodingTask } from './codingTasksSlice';
import './SendCodingTaskModal.scss';

const DIFFICULTIES = [
  { value: 'easy',   label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard',   label: 'Hard' },
];

const LANGUAGES = [
  { value: 'js',     label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'php',    label: 'PHP' },
];

const buildPublicUrl = (token) => `${window.location.origin}/coding-task/${token}`;

export default function SendCodingTaskModal({ open, onClose, interviewId }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { busy } = useSelector((s) => s.codingTasks);
  const [difficulty, setDifficulty] = useState('easy');
  const [language, setLanguage] = useState('js');
  const [task, setTask] = useState(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setTask(null); setCopied(false); setDifficulty('easy'); setLanguage('js');
  };

  const handleClose = () => { reset(); onClose?.(); };

  const onGenerate = async () => {
    const a = await dispatch(createCodingTask({ interviewId, difficulty, language }));
    if (createCodingTask.fulfilled.match(a)) {
      setTask(a.payload);
    } else {
      push({ type: 'error', message: a.payload?.message || 'Could not generate problem' });
    }
  };

  const onCopy = async () => {
    if (!task?.token) return;
    try {
      await navigator.clipboard.writeText(buildPublicUrl(task.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      push({ type: 'error', message: 'Copy failed — select the link manually' });
    }
  };

  const sample = task?.problem?.testCases?.find((tc) => !tc.isHidden);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Send coding task"
      size="lg"
      footer={
        task
          ? (
            <>
              <Button variant="secondary" onClick={reset}>Send another</Button>
              <Button onClick={handleClose}>Done</Button>
            </>
          )
          : (
            <>
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button onClick={onGenerate} loading={busy}>Generate</Button>
            </>
          )
      }
    >
      {!task && (
        <div className="send-task__form">
          <p className="send-task__hint">
            AI will generate a fresh problem based on the candidate's JD. You'll get a link to paste into the call chat.
          </p>
          <div className="send-task__row">
            <label className="send-task__field">
              <span>Difficulty</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={busy}>
                {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label className="send-task__field">
              <span>Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {task && (
        <div className="send-task__preview">
          <div className="send-task__pillrow">
            <span className={`send-task__pill send-task__pill--${task.problem.difficulty}`}>{task.problem.difficulty}</span>
            <span className="send-task__pill send-task__pill--lang">{task.problem.language}</span>
          </div>
          <h3 className="send-task__title">{task.problem.title}</h3>
          <pre className="send-task__desc">{task.problem.description}</pre>
          {sample && (
            <div className="send-task__sample">
              <div className="send-task__sample-label">Sample input</div>
              <pre>{sample.stdin}</pre>
              <div className="send-task__sample-label">Sample output</div>
              <pre>{sample.expectedStdout}</pre>
            </div>
          )}
          <div className="send-task__linkrow">
            <input className="send-task__link" readOnly value={buildPublicUrl(task.token)} onFocus={(e) => e.target.select()} />
            <Button onClick={onCopy} variant={copied ? 'success' : 'primary'}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
          </div>
          <p className="send-task__hint">Paste this link in your video call chat. The candidate opens it in their browser.</p>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Create the styles**

Create `frontend/src/features/liveInterview/SendCodingTaskModal.scss`:

```scss
.send-task {
  &__form { display: flex; flex-direction: column; gap: $space-3; }
  &__hint { color: $color-text-muted; font-size: 13px; margin: 0; }
  &__row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: $space-3;
  }
  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: $color-text-muted;
    select {
      padding: 8px 10px;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      background: $color-surface;
      font-size: 14px;
      color: $color-text;
    }
  }

  &__preview { display: flex; flex-direction: column; gap: $space-3; }
  &__pillrow { display: flex; gap: 8px; }
  &__pill {
    padding: 2px 10px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    &--easy   { background: #dcfce7; color: #166534; }
    &--medium { background: #fef3c7; color: #92400e; }
    &--hard   { background: #fee2e2; color: #991b1b; }
    &--lang   { background: #e0e7ff; color: #3730a3; }
  }
  &__title { margin: 0; font-size: 18px; }
  &__desc {
    background: #f9fafb;
    padding: $space-3;
    border-radius: $radius-md;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    max-height: 240px;
    overflow-y: auto;
    margin: 0;
  }
  &__sample { font-size: 12px; }
  &__sample-label {
    color: $color-text-muted;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    margin-bottom: 4px;
  }
  &__sample pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 8px 10px;
    border-radius: $radius-md;
    margin: 0 0 8px;
    overflow-x: auto;
  }

  &__linkrow {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  &__link {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    background: $color-surface-2;
    font-family: monospace;
    font-size: 12px;
    color: $color-text;
  }
}
```

- [ ] **Step 3: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/liveInterview/SendCodingTaskModal.jsx frontend/src/features/liveInterview/SendCodingTaskModal.scss
git commit -m "feat(live-coding-task): SendCodingTaskModal component"
```

---

## Task 12: CodingTasksPanel Component (Polled)

**Files:**
- Create: `frontend/src/features/liveInterview/CodingTasksPanel.jsx`
- Create: `frontend/src/features/liveInterview/CodingTasksPanel.scss`

- [ ] **Step 1: Create the component**

Create `frontend/src/features/liveInterview/CodingTasksPanel.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { fetchCodingTasks, cancelCodingTask, clearCodingTasks } from './codingTasksSlice';
import './CodingTasksPanel.scss';

const POLL_MS = 5000;
const STATUS_LABEL = { pending: 'Sent · waiting', opened: 'Candidate viewing', submitted: 'Submitted', cancelled: 'Cancelled' };

const buildPublicUrl = (token) => `${window.location.origin}/coding-task/${token}`;

function TaskRow({ task, interviewId }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOpen = task.status === 'submitted' && open;
  const canCancel = task.status === 'pending' || task.status === 'opened';

  const onCopy = async () => {
    if (!task.token) return;
    try {
      await navigator.clipboard.writeText(buildPublicUrl(task.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      push({ type: 'error', message: 'Copy failed' });
    }
  };

  const onCancel = async () => {
    const a = await dispatch(cancelCodingTask({ interviewId, taskId: task._id || task.id }));
    if (!cancelCodingTask.fulfilled.match(a)) {
      push({ type: 'error', message: a.payload?.message || 'Could not cancel' });
    }
  };

  return (
    <li className={`coding-tasks__item coding-tasks__item--${task.status}`}>
      <div className="coding-tasks__head">
        <span className="coding-tasks__title">{task.problem?.title || 'Coding task'}</span>
        <span className={`coding-tasks__status coding-tasks__status--${task.status}`}>
          {STATUS_LABEL[task.status] || task.status}
        </span>
      </div>
      <div className="coding-tasks__meta">
        <span className="coding-tasks__pill">{task.problem?.difficulty}</span>
        <span className="coding-tasks__pill coding-tasks__pill--lang">{task.problem?.language}</span>
        {task.submittedAt && (
          <span className="coding-tasks__time">
            Submitted {new Date(task.submittedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="coding-tasks__actions">
        {task.token && task.status !== 'cancelled' && task.status !== 'submitted' && (
          <Button size="sm" variant={copied ? 'success' : 'secondary'} onClick={onCopy}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
        {task.status === 'submitted' && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide submission' : 'View submission'}
          </Button>
        )}
      </div>
      {isOpen && task.submission && (
        <div className="coding-tasks__submission">
          <div className="coding-tasks__summary">
            <strong>{task.submission.summary?.passed ?? 0}</strong> of {task.submission.summary?.total ?? 0} test cases passed
          </div>
          <pre className="coding-tasks__code">{task.submission.code}</pre>
          <ul className="coding-tasks__cases">
            {(task.submission.results || []).map((r, i) => (
              <li key={i} className={r.passed ? 'pass' : 'fail'}>
                <span>Case {i + 1}: {r.passed ? '✓ passed' : '✗ failed'}</span>
                {!r.passed && (
                  <div className="coding-tasks__diff">
                    <div><span>Input:</span><pre>{r.stdin}</pre></div>
                    <div><span>Expected:</span><pre>{r.expectedStdout}</pre></div>
                    <div><span>Got:</span><pre>{r.actualStdout || r.stderr || '(empty)'}</pre></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default function CodingTasksPanel({ interviewId }) {
  const dispatch = useDispatch();
  const { list } = useSelector((s) => s.codingTasks);

  useEffect(() => {
    dispatch(fetchCodingTasks(interviewId));
    const t = setInterval(() => dispatch(fetchCodingTasks(interviewId)), POLL_MS);
    return () => {
      clearInterval(t);
      dispatch(clearCodingTasks());
    };
  }, [interviewId, dispatch]);

  if (!list.length) {
    return (
      <div className="coding-tasks coding-tasks--empty">
        <p>No coding tasks sent yet. Use "Send coding task" up top to share a problem with the candidate.</p>
      </div>
    );
  }

  return (
    <div className="coding-tasks">
      <h3 className="coding-tasks__title-h">Coding tasks</h3>
      <ul className="coding-tasks__list">
        {list.map((t) => (
          <TaskRow key={t._id || t.id} task={t} interviewId={interviewId} />
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Create the styles**

Create `frontend/src/features/liveInterview/CodingTasksPanel.scss`:

```scss
.coding-tasks {
  background: $color-surface;
  border: 1px solid $color-border;
  border-radius: $radius-lg;
  padding: $space-3;

  &--empty {
    color: $color-text-muted;
    font-size: 13px;
    text-align: center;
    padding: $space-4;
    p { margin: 0; }
  }

  &__title-h {
    margin: 0 0 $space-3;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: $color-text-muted;
  }

  &__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: $space-3;
  }

  &__item {
    border: 1px solid $color-border;
    border-radius: $radius-md;
    padding: $space-3;
    background: $color-surface-2;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: $space-2;
  }

  &__title { font-weight: 600; font-size: 14px; }

  &__status {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 10px;
    border-radius: 9999px;
    &--pending   { background: #fef3c7; color: #92400e; }
    &--opened    { background: #dbeafe; color: #1e40af; }
    &--submitted { background: #dcfce7; color: #166534; }
    &--cancelled { background: #e5e7eb; color: #4b5563; }
  }

  &__meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  &__pill {
    background: #f1f5f9;
    color: #475569;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    &--lang { background: #e0e7ff; color: #3730a3; }
  }
  &__time { color: $color-text-muted; font-size: 12px; }

  &__actions { display: flex; gap: 8px; flex-wrap: wrap; }

  &__submission {
    margin-top: $space-2;
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    padding: $space-3;
  }
  &__summary { font-size: 13px; margin-bottom: $space-2; }
  &__code {
    background: #0f172a;
    color: #e2e8f0;
    padding: $space-3;
    border-radius: $radius-md;
    overflow-x: auto;
    font-size: 12px;
    margin: 0 0 $space-2;
  }
  &__cases {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    li {
      font-size: 13px;
      &.pass { color: #166534; }
      &.fail { color: #991b1b; }
    }
  }
  &__diff {
    margin-top: 4px;
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: $color-text;
    span { display: block; font-weight: 600; color: $color-text-muted; }
    pre { margin: 0; background: #f9fafb; padding: 6px 8px; border-radius: $radius-md; }
  }
}
```

- [ ] **Step 3: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/liveInterview/CodingTasksPanel.jsx frontend/src/features/liveInterview/CodingTasksPanel.scss
git commit -m "feat(live-coding-task): CodingTasksPanel with polling"
```

---

## Task 13: Wire Button + Panel Into LiveInterviewPage

**Files:**
- Modify: `frontend/src/features/liveInterview/LiveInterviewPage.jsx`
- Modify: `frontend/src/features/liveInterview/LiveInterviewPage.scss`

- [ ] **Step 1: Update LiveInterviewPage**

Edit `frontend/src/features/liveInterview/LiveInterviewPage.jsx`. Imports section — add:

```jsx
import SendCodingTaskModal from './SendCodingTaskModal';
import CodingTasksPanel from './CodingTasksPanel';
```

Inside the `LiveInterviewPage` component, after the existing `useState` declarations (e.g. `const [now, setNow] = useState(...)`), add:

```jsx
const [codingTaskOpen, setCodingTaskOpen] = useState(false);
```

In the topbar JSX, find the existing `<Button onClick={onEnd} loading={status === 'ending'}>End interview</Button>` line. Insert immediately before it:

```jsx
<Button variant="secondary" onClick={() => setCodingTaskOpen(true)}>
  Send coding task
</Button>
```

In the `live__queue` section (where `QuestionCard`s render), after the closing `)` of the questions `.map(...)` block, insert:

```jsx
<CodingTasksPanel interviewId={id} />
```

At the very end of the returned JSX (just before the closing `</div>` of `.live`), add:

```jsx
<SendCodingTaskModal
  open={codingTaskOpen}
  onClose={() => setCodingTaskOpen(false)}
  interviewId={id}
/>
```

- [ ] **Step 2: Adjust styles if needed**

Edit `frontend/src/features/liveInterview/LiveInterviewPage.scss`. At the bottom (or near `.live__queue`), ensure the queue column has spacing between items. If a `gap` already exists, no change needed. Otherwise add:

```scss
.live__queue {
  display: flex;
  flex-direction: column;
  gap: $space-3;
}
```

(Apply only if the rule isn't already there.)

- [ ] **Step 3: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/liveInterview/LiveInterviewPage.jsx frontend/src/features/liveInterview/LiveInterviewPage.scss
git commit -m "feat(live-coding-task): wire Send button + panel into co-pilot"
```

---

## Task 14: Public CodingTaskPage + Route

**Files:**
- Create: `frontend/src/features/codingTask/CodingTaskPage.jsx`
- Create: `frontend/src/features/codingTask/CodingTaskPage.scss`
- Modify: `frontend/src/routes/AppRoutes.jsx`

- [ ] **Step 1: Create the candidate page**

Create `frontend/src/features/codingTask/CodingTaskPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { liveCodingTaskApi } from '@/api/liveCodingTaskApi';
import './CodingTaskPage.scss';

const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };
const MONACO_LANG = { js: 'javascript', python: 'python', php: 'php' };

export default function CodingTaskPage() {
  const { token } = useParams();
  const { push } = useToast();

  const [task, setTask] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading'); // 'loading' | 'ready' | 'failed' | 'gone'
  const [loadError, setLoadError] = useState('');

  const [code, setCode] = useState('');
  const [runResults, setRunResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // summary after submit

  useEffect(() => {
    let cancelled = false;
    liveCodingTaskApi.getPublic(token)
      .then((t) => {
        if (cancelled) return;
        setTask(t);
        setCode(t.problem?.starterCode || '');
        setLoadStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        setLoadStatus(status === 410 ? 'gone' : 'failed');
        setLoadError(err?.response?.data?.message || 'Could not load this task.');
      });
    return () => { cancelled = true; };
  }, [token]);

  const onRun = async () => {
    setRunning(true);
    try {
      const out = await liveCodingTaskApi.run(token, code);
      setRunResults(out.results || []);
    } catch (err) {
      push({ type: 'error', message: err?.response?.data?.message || 'Run failed' });
    } finally {
      setRunning(false);
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const out = await liveCodingTaskApi.submit(token, code);
      setSubmitted(out.summary || { passed: 0, total: 0 });
    } catch (err) {
      push({ type: 'error', message: err?.response?.data?.message || 'Submit failed' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadStatus === 'loading') return <Loader message="Loading task…" />;
  if (loadStatus === 'failed' || loadStatus === 'gone') {
    return <EmptyState title="This task isn't available" description={loadError} />;
  }

  if (submitted) {
    return (
      <div className="coding-task__done">
        <h1>Submitted!</h1>
        <p><strong>{submitted.passed}</strong> of {submitted.total} test cases passed.</p>
        <p>Your interviewer has been notified. You can close this tab.</p>
      </div>
    );
  }

  const sampleCases = (task.problem.testCases || []).filter((tc) => !tc.isHidden);

  return (
    <div className="coding-task">
      <header className="coding-task__head">
        <h1>{task.problem.title}</h1>
        <div className="coding-task__pills">
          <span className={`coding-task__pill coding-task__pill--${task.problem.difficulty}`}>{task.problem.difficulty}</span>
          <span className="coding-task__pill coding-task__pill--lang">{LANG_LABEL[task.problem.language] || task.problem.language}</span>
        </div>
      </header>

      <div className="coding-task__body">
        <section className="coding-task__problem">
          <div className="coding-task__desc">
            <ReactMarkdown>{task.problem.description}</ReactMarkdown>
          </div>
          {sampleCases.length > 0 && (
            <div className="coding-task__samples">
              <h3>Sample cases</h3>
              {sampleCases.map((c, i) => (
                <div key={i} className="coding-task__sample">
                  <div><span>Input</span><pre>{c.stdin}</pre></div>
                  <div><span>Output</span><pre>{c.expectedStdout}</pre></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="coding-task__editor">
          <Editor
            height="60vh"
            language={MONACO_LANG[task.problem.language] || 'javascript'}
            value={code}
            onChange={(v) => setCode(v ?? '')}
            options={{ minimap: { enabled: false }, fontSize: 14 }}
          />
          <div className="coding-task__actions">
            <Button onClick={onRun} loading={running} variant="secondary">Run</Button>
            <Button onClick={onSubmit} loading={submitting}>Submit</Button>
          </div>
          {runResults && (
            <div className="coding-task__output">
              <h3>Run output</h3>
              <ul>
                {runResults.map((r, i) => (
                  <li key={i} className={r.passed ? 'pass' : 'fail'}>
                    <strong>Case {i + 1}:</strong> {r.passed ? '✓ passed' : '✗ failed'}
                    {!r.passed && (
                      <pre>{r.actualStdout || r.stderr || r.error || '(empty)'}</pre>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the styles**

Create `frontend/src/features/codingTask/CodingTaskPage.scss`:

```scss
.coding-task {
  max-width: 1400px;
  margin: 0 auto;
  padding: $space-4;
  display: flex;
  flex-direction: column;
  gap: $space-3;

  &__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: $space-3;
    h1 { margin: 0; font-size: 22px; }
  }
  &__pills { display: flex; gap: 8px; }
  &__pill {
    padding: 2px 10px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    &--easy   { background: #dcfce7; color: #166534; }
    &--medium { background: #fef3c7; color: #92400e; }
    &--hard   { background: #fee2e2; color: #991b1b; }
    &--lang   { background: #e0e7ff; color: #3730a3; }
  }

  &__body {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: $space-3;
    @media (max-width: $bp-lg) { grid-template-columns: 1fr; }
  }

  &__problem {
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-lg;
    padding: $space-4;
    display: flex;
    flex-direction: column;
    gap: $space-3;
  }
  &__desc { line-height: 1.6; }
  &__samples h3 { font-size: 14px; margin: 0 0 8px; }
  &__sample {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
    span { display: block; font-size: 11px; color: $color-text-muted; text-transform: uppercase; }
    pre { background: #0f172a; color: #e2e8f0; padding: 6px 8px; border-radius: $radius-md; margin: 4px 0 0; overflow-x: auto; font-size: 12px; }
  }

  &__editor {
    display: flex;
    flex-direction: column;
    gap: $space-3;
  }
  &__actions { display: flex; gap: $space-3; justify-content: flex-end; }
  &__output {
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-lg;
    padding: $space-3;
    h3 { font-size: 14px; margin: 0 0 8px; }
    ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
    li.pass { color: #166534; }
    li.fail { color: #991b1b; }
    pre { background: #f9fafb; padding: 6px 8px; border-radius: $radius-md; margin: 4px 0 0; font-size: 12px; }
  }

  &__done {
    max-width: 600px;
    margin: 80px auto;
    padding: $space-4;
    text-align: center;
    h1 { margin: 0 0 $space-3; }
    p { color: $color-text-muted; }
  }
}
```

- [ ] **Step 3: Add the route**

Edit `frontend/src/routes/AppRoutes.jsx`. Add the import near the other `coding-test` imports:

```jsx
import CodingTaskPage from '@/features/codingTask/CodingTaskPage';
```

Inside the `<Route element={<PublicLayout />}>` block, near the `coding-test` route, add:

```jsx
<Route path="/coding-task/:token" element={<CodingTaskPage />} />
```

- [ ] **Step 4: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/codingTask frontend/src/routes/AppRoutes.jsx
git commit -m "feat(live-coding-task): public candidate runner page + route"
```

---

## Task 15: End-to-End Manual Verification

**Files:** none (manual test pass)

- [ ] **Step 1: Start both servers**

```
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Log in as an interviewer and open a scheduled interview's co-pilot**

Navigate to `/interviewer/dashboard` → pick a scheduled interview → click "Open co-pilot". The co-pilot page must render.

- [ ] **Step 3: Send a task — happy path**

Click "Send coding task" → modal opens. Pick Easy + JavaScript → click Generate. Within ~5s, the preview should appear with a problem title, description, sample case, and a copy-link input.

Click "Copy link" → button briefly shows "Copied ✓".

- [ ] **Step 4: Candidate opens the link**

Paste the copied URL into an incognito window. The candidate page must render with the problem statement on the left and an editor pre-filled with starter code on the right.

- [ ] **Step 5: Run + Submit on the candidate side**

Type a working solution. Click Run — output panel renders per-case pass/fail for the visible sample. Click Submit — page flips to "Submitted! X of Y test cases passed."

- [ ] **Step 6: Verify co-pilot shows the submission**

Switch back to the co-pilot tab. Within ~5 seconds (next poll), the task row in the "Coding tasks" panel should flip from "Candidate viewing" to "Submitted". Click "View submission" — the candidate's code + per-case results render inline.

- [ ] **Step 7: Cancel flow**

Click "Send coding task" again, generate a new one (don't open it). On the panel, click "Cancel" on the new task. The status should flip to "Cancelled" within ~5s. Open the copied link in incognito — it should show "This task isn't available — Your interviewer cancelled this task."

- [ ] **Step 8: Error paths to confirm**

- Open an invalid token (`/coding-task/garbage`): page shows "This task isn't available" with a 404-style message.
- Force AI failure: temporarily set both AI providers' keys to empty in `backend/.env` and restart the backend. Click Generate — modal stays open with an error toast. Restore keys after.

- [ ] **Step 9: Commit any incidental fixes**

If you needed to tweak anything during manual testing, commit each fix as its own small change:

```bash
git add <file>
git commit -m "fix(live-coding-task): <one-line description>"
```

---

## Self-Review Notes

Cross-checked against the spec:

| Spec section | Covered by |
|---|---|
| `LiveCodingTask` model | Task 1 |
| Repository | Task 2 |
| Validators | Task 3 |
| `service.create` (+ JD topic, status guard, token, AI integration) | Task 4 |
| `service.getPublic` (token-gate, status flip, strip hidden, strip token) | Task 5 |
| `service.runPublic` (visible-only, ephemeral) | Task 5 |
| `service.submitPublic` (all cases, persists submission) | Task 6 |
| `service.listForInterview` (keeps token for re-copy) | Task 6 |
| `service.cancel` (status guard, owner check) | Task 6 |
| Controller + interviewer routes (`requireAuth + requireMyInterview`) | Task 7 |
| Public routes (`/coding-tasks/:token` get/run/submit) | Task 8 |
| Frontend API client (interviewer + public) | Task 9 |
| Redux slice | Task 10 |
| SendCodingTaskModal (2 steps, copy-link UX) | Task 11 |
| CodingTasksPanel (polled every 5s, status pills, re-copy, cancel, expand submission) | Task 12 |
| Topbar button + panel placement | Task 13 |
| CodingTaskPage (Monaco editor, Run + Submit, success screen) | Task 14 |
| End-to-end manual verification | Task 15 |
