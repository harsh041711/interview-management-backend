# Phase 3D — Question Shuffling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Round 1 question selection vary across candidates with the same tech stack and experience by adding `experience` to Candidate + Question and biasing the sampler toward least-used questions via a new `timesUsed` counter.

**Architecture:** Filter the candidate question pool by tech stack + experience (`{ $in: [candidate.experience, 'any'] }`), sort by `timesUsed` ascending then take a head slice and `$sample` within it for randomness, atomically `$inc timesUsed` on the selected questions.

**Tech Stack:** Mongoose (backend), MongoDB aggregation, React + Redux Toolkit + SCSS (frontend).

**Reference spec:** [`docs/superpowers/specs/2026-05-07-phase-3d-question-shuffling-design.md`](../specs/2026-05-07-phase-3d-question-shuffling-design.md)

**Note:** The `experience` field on Candidate and the migration script are also covered in the Phase 3 main plan (Task 34 + Task 22). If 3D is built **before** the main Phase 3, this plan owns those tasks; if built **after**, skip the duplicates.

---

## File Structure

### Backend
- Modify: `backend/src/models/Question.js` — add `experience`, `timesUsed`, indexes
- Modify: `backend/src/models/Candidate.js` — add `experience` (skip if Phase 3 main already added)
- Modify: `backend/src/repositories/questionRepository.js` — new sampler logic
- Modify: `backend/src/services/testService.js` — pass candidate's `experience` to sampler
- Modify: `backend/src/validators/{candidateValidator,questionValidator}.js`
- Modify: `backend/src/scripts/migratePhase3.js` (or create one if 3D ships standalone)
- Test: `backend/tests/unit/questionSampler.test.js`

### Frontend
- Modify: `frontend/src/features/questions/QuestionForm.jsx` — add experience selector
- Modify: `frontend/src/features/questions/QuestionListPage.jsx` — show experience chip + `timesUsed` + filter
- Modify: `frontend/src/features/candidates/CreateCandidateModal.jsx` — experience radio (skip if Phase 3 added)
- Modify: `frontend/src/features/candidates/CandidateListPage.jsx` — experience filter (skip if Phase 3 added)

---

## Tasks

### Task 1: Question model — add experience + timesUsed + indexes

**Files:**
- Modify: `backend/src/models/Question.js`

- [ ] **Step 1: Add fields**

```js
// Inside schema:
experience: {
  type: String,
  enum: ['entry', 'mid', 'senior', 'any'],
  default: 'any',
  index: true,
},
timesUsed: { type: Number, default: 0 },

// After schema definition, add a compound index for the sampler's sort:
questionSchema.index({ techStack: 1, experience: 1, timesUsed: 1 });
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/models/Question.js
git commit -m "feat(question): add experience, timesUsed, and sampler-friendly compound index"
```

---

### Task 2: Candidate model — add experience (idempotent)

**Files:**
- Modify: `backend/src/models/Candidate.js`

> If the field is already present from Phase 3 main Task 34, skip this task.

- [ ] **Step 1: Add field**

```js
experience: {
  type: String,
  enum: ['entry', 'mid', 'senior'],
  default: 'mid',
  required: true,
},
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/models/Candidate.js
git commit -m "feat(candidate): add experience field"
```

---

### Task 3: Validators — accept experience

**Files:**
- Modify: `backend/src/validators/candidateValidator.js`
- Modify: `backend/src/validators/questionValidator.js`

- [ ] **Step 1: Candidate validator**

In `createCandidateSchema.body`:
```js
experience: Joi.string().valid('entry', 'mid', 'senior').required(),
```

In `listCandidatesSchema.query` (optional filter):
```js
experience: Joi.string().valid('entry', 'mid', 'senior').empty('').optional(),
```

- [ ] **Step 2: Question validator**

In `createQuestionSchema.body` and `updateQuestionSchema.body`:
```js
experience: Joi.string().valid('entry', 'mid', 'senior', 'any').default('any').optional(),
```

In `listQuestionsSchema.query`:
```js
experience: Joi.string().valid('entry', 'mid', 'senior', 'any').empty('').optional(),
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/validators/{candidateValidator,questionValidator}.js
git commit -m "feat(validators): experience on candidate + question (create/list)"
```

---

### Task 4: Sampler logic in question repository

**Files:**
- Modify: `backend/src/repositories/questionRepository.js`
- Test: `backend/tests/unit/questionSampler.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/unit/questionSampler.test.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Question = require('../../src/models/Question');
const repo = require('../../src/repositories/questionRepository');

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => { await Question.deleteMany({}); });

const makeQuestion = (text, exp = 'mid', stack = 'React', timesUsed = 0) => ({
  text,
  techStack: stack,
  experience: exp,
  timesUsed,
  type: 'mcq',
  options: ['a', 'b', 'c', 'd'],
  correctAnswer: 'a',
  isActive: true,
});

describe('sampleForTest', () => {
  test('filters by tech stack (case-insensitive) and experience', async () => {
    await Question.insertMany([
      makeQuestion('R1', 'mid', 'React'),
      makeQuestion('R2', 'mid', 'react'),
      makeQuestion('R3', 'senior', 'React'),
      makeQuestion('N1', 'mid', 'Node'),
    ]);
    const result = await repo.sampleForTest({ techStack: 'React', experience: 'mid', count: 2 });
    expect(result).toHaveLength(2);
    result.forEach((q) => expect(['R1', 'R2']).toContain(q.text));
  });

  test('includes "any" experience questions', async () => {
    await Question.insertMany([
      makeQuestion('R1', 'mid'),
      makeQuestion('RA', 'any'),
    ]);
    const result = await repo.sampleForTest({ techStack: 'React', experience: 'mid', count: 2 });
    expect(result.map((q) => q.text).sort()).toEqual(['R1', 'RA']);
  });

  test('prefers least-used questions', async () => {
    // 6 mid+react questions, three with timesUsed=10, three with 0. Sample 3.
    await Question.insertMany([
      makeQuestion('A', 'mid', 'React', 10),
      makeQuestion('B', 'mid', 'React', 10),
      makeQuestion('C', 'mid', 'React', 10),
      makeQuestion('D', 'mid', 'React', 0),
      makeQuestion('E', 'mid', 'React', 0),
      makeQuestion('F', 'mid', 'React', 0),
    ]);
    // Repeat to reduce flake; head slice picks the three timesUsed=0
    const result = await repo.sampleForTest({ techStack: 'React', experience: 'mid', count: 3 });
    const texts = result.map((q) => q.text).sort();
    expect(texts).toEqual(['D', 'E', 'F']);
  });

  test('atomically increments timesUsed on sampled questions', async () => {
    await Question.insertMany([makeQuestion('A'), makeQuestion('B')]);
    await repo.sampleForTest({ techStack: 'React', experience: 'mid', count: 2 });
    const all = await Question.find({}).sort({ text: 1 });
    expect(all[0].timesUsed).toBe(1);
    expect(all[1].timesUsed).toBe(1);
  });

  test('throws when pool too small', async () => {
    await Question.insertMany([makeQuestion('A')]);
    await expect(
      repo.sampleForTest({ techStack: 'React', experience: 'mid', count: 5 }),
    ).rejects.toMatchObject({ code: 'E_NOT_ENOUGH_QUESTIONS' });
  });
});
```

- [ ] **Step 2: Run test — should fail**

```bash
cd backend && npx jest tests/unit/questionSampler.test.js
```

- [ ] **Step 3: Implement sampler**

```js
// In questionRepository.js — replace existing sampleForTest

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sampleForTest = async ({ techStack, experience, count }) => {
  const techRegex = new RegExp(`^${escapeRegex(techStack)}$`, 'i');
  const filter = {
    techStack: techRegex,
    experience: { $in: [experience || 'mid', 'any'] },
    isActive: true,
  };

  const headSize = Math.max(count * 3, count + 5);

  const pool = await Question.aggregate([
    { $match: filter },
    { $sort: { timesUsed: 1, _id: 1 } },
    { $limit: headSize },
    { $sample: { size: count } },
  ]);

  if (pool.length < count) {
    const err = new Error('Not enough questions');
    err.code = 'E_NOT_ENOUGH_QUESTIONS';
    err.details = { techStack, experience, requested: count, available: pool.length };
    throw err;
  }

  const ids = pool.map((q) => q._id);
  await Question.updateMany({ _id: { $in: ids } }, { $inc: { timesUsed: 1 } });
  return pool;
};
```

- [ ] **Step 4: Run test — should pass**

```bash
cd backend && npx jest tests/unit/questionSampler.test.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/questionRepository.js backend/tests/unit/questionSampler.test.js
git commit -m "feat(question): least-used-first weighted sampler with experience filter"
```

---

### Task 5: testService — pass candidate experience to sampler

**Files:**
- Modify: `backend/src/services/testService.js`

- [ ] **Step 1: Modify the start-test path**

Find where `questionRepository.sampleForTest` (or equivalent) is called. Update the call site:

```js
const questions = await questionRepository.sampleForTest({
  techStack: candidate.techStack[0],
  experience: candidate.experience || 'mid',
  count: candidate.questionCount,
});
```

If sampling iterates per stack, pass the same `experience` to each. Map `E_NOT_ENOUGH_QUESTIONS` to a 422 ApiError surfaced to the candidate UI ("Test cannot start — please contact HR").

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/testService.js
git commit -m "feat(test): forward candidate.experience to question sampler"
```

---

### Task 6: Migration script

**Files:**
- Create or modify: `backend/src/scripts/migratePhase3.js`

> If migration script already exists from Phase 3 main Task 22, this is a no-op for 3D. Otherwise create a minimal version.

- [ ] **Step 1: Verify or create**

```js
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../config/env');

async function run() {
  await mongoose.connect(env.mongoUri);
  const Candidate = require('../models/Candidate');
  const Question = require('../models/Question');

  const c = await Candidate.updateMany(
    { experience: { $in: [null, undefined] } },
    { $set: { experience: 'mid' } },
  );
  const q = await Question.updateMany(
    { experience: { $in: [null, undefined] } },
    { $set: { experience: 'any' } },
  );
  const t = await Question.updateMany(
    { timesUsed: { $in: [null, undefined] } },
    { $set: { timesUsed: 0 } },
  );
  console.log(`Backfilled ${c.modifiedCount} candidates, ${q.modifiedCount} questions (experience), ${t.modifiedCount} questions (timesUsed)`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
```

Add npm script: `"migrate:phase3": "node src/scripts/migratePhase3.js"`.

- [ ] **Step 2: Commit (skip if no changes)**

```bash
git add backend/src/scripts/migratePhase3.js backend/package.json
git commit -m "feat(migration): backfill experience + timesUsed defaults"
```

---

### Task 7: Question form UI — experience selector

**Files:**
- Modify: `frontend/src/features/questions/QuestionForm.jsx` (or wherever the create/edit form lives)

- [ ] **Step 1: Add experience selector**

```jsx
<div className="field">
  <label className="field__label">Experience</label>
  <select
    value={form.experience}
    onChange={(e) => setForm({ ...form, experience: e.target.value })}
  >
    <option value="any">Any</option>
    <option value="entry">Entry</option>
    <option value="mid">Mid</option>
    <option value="senior">Senior</option>
  </select>
  <span className="field__hint">"Any" matches every candidate.</span>
</div>
```

Default `experience: 'any'` in form initial state. Pass to create/update payload.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/questions/QuestionForm.jsx
git commit -m "feat(question): experience selector in question form"
```

---

### Task 8: Question list — experience chip + filter + timesUsed stat

**Files:**
- Modify: `frontend/src/features/questions/QuestionListPage.jsx` + `.scss`

- [ ] **Step 1: Add experience filter dropdown to filters bar**

(Mirrors existing tech-stack filter behavior.)

- [ ] **Step 2: Show experience chip per row**

Inside the row, after the tech-stack chips, render `<span className="chip chip--exp">{q.experience}</span>`.

- [ ] **Step 3: Show `timesUsed` stat**

Either as a small subdued column or inline next to the chip: `<span className="muted">used {q.timesUsed}×</span>`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/questions/QuestionListPage.{jsx,scss}
git commit -m "feat(question): experience filter + chip + timesUsed stat in list"
```

---

### Task 9: Candidate modal + list — experience UI (idempotent)

> If Phase 3 main Task 34 already added these, skip this task.

**Files:**
- Modify: `frontend/src/features/candidates/CreateCandidateModal.jsx`
- Modify: `frontend/src/features/candidates/CandidateListPage.jsx`

- [ ] **Step 1: Modal experience radio**

```jsx
<div className="field">
  <span className="field__label">Experience</span>
  <div className="exp-toggle">
    {['entry', 'mid', 'senior'].map((e) => (
      <button type="button" key={e}
        className={`chip-toggle ${form.experience === e ? 'is-on' : ''}`}
        onClick={() => setForm({ ...form, experience: e })}>
        {e}
      </button>
    ))}
  </div>
</div>
```

Initial: `experience: 'mid'`. Pass to payload.

- [ ] **Step 2: List filter + per-row chip**

Add experience filter dropdown to the filters bar. Per row, show a chip near the existing tech stack chips.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/candidates/{CreateCandidateModal,CandidateListPage}.jsx
git commit -m "feat(candidate): experience radio in modal + chip + filter in list"
```

---

### Task 10: Final smoke test

**Files:** *(none — test only)*

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm test
```
All green.

- [ ] **Step 2: Frontend build**

```bash
cd frontend && npm run build
```
Clean build.

- [ ] **Step 3: End-to-end check**

1. Run migration: `npm run migrate:phase3`.
2. As HR, create 3 questions for `React` / `mid`, all with `timesUsed=0` (just-created).
3. Create 3 candidates: same `React` stack and `mid` experience.
4. Start each test in turn (use the existing test flow).
5. Inspect `Question.timesUsed` in the DB — sampled questions should have `timesUsed=1`. Across the 3 candidates, the question pool should rotate (check at least two candidates got non-identical sets).
6. Add 1 more `React`/`mid` question with `timesUsed=99`. Start a 4th candidate test. The high-usage question should NOT appear in the sample (head-slice excludes it).
7. Try creating a candidate with experience `senior` when no `senior`+`any` React questions exist beyond what we have — confirm friendly error surfaces.

- [ ] **Step 4: Commit if anything was tweaked during smoke**

```bash
git status  # if clean, no commit needed
```

---

## Definition of Done

- All 10 tasks committed (with idempotent skips noted)
- New unit tests under `tests/unit/questionSampler.test.js` pass
- All backend tests green; frontend build clean
- Migration script run successfully (no errors)
- Manual smoke confirms variation across candidates and least-used preference
