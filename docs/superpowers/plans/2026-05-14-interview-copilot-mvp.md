# Interview Co-pilot MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI co-pilot page the interviewer opens alongside their Zoom/Meet call: auto-loads context (JD + candidate + prior rounds), suggests 12 AI questions tiered easy → hard, captures per-question notes + 1-5 ratings, and on "End interview" auto-drafts a review the interviewer just edits and submits.

**Architecture:** New backend module under `/me/...` (interviewer-scoped). One Mongoose collection `LiveSession` (interview → 12 questions with note/rating). Two AI calls (Gemini → Groq fallback via existing `aiService`): question generation on start, draft review on end. Frontend: a new `liveInterview` feature with a dedicated `/interviewer/interviews/:id/live` route. No sockets in MVP — debounced HTTP saves on every change.

**Tech Stack:**
- Backend: Node.js + Express + Mongoose + Jest. Existing patterns: `asyncHandler`, `ApiResponse.ok`, `validator` middleware, `requireAuth`/`requireRole`, `requireMyInterview` ownership guard, `aiService.askWithFallback` + `aiService.extractJson`.
- Frontend: React + Vite + Redux Toolkit + SCSS. Existing patterns: feature folder with `*Page.jsx`/`*.scss`/`*Slice.js`, API wrapper in `src/api/`, slice in `src/features/<name>/`, route in `AppRoutes.jsx`, slice mounted in `src/app/store.js`. SCSS variables auto-imported by Vite (`$color-primary`, `$shadow-md`, `$radius-lg`, `$space-*`, `$bp-lg`).
- AI: existing `aiService.askWithFallback(prompt)` returns `{ text, provider, model }`. `aiService.extractJson(text)` returns the first parsed JSON object/array or `null`.

---

## File Structure

**Backend new files:**
- `backend/src/models/LiveSession.js` — Mongoose schema
- `backend/src/repositories/liveSessionRepository.js` — DB access
- `backend/src/services/liveInterviewAiService.js` — `generateQuestions()` + `generateDraftReview()`
- `backend/src/services/liveInterviewService.js` — `start`, `getActive`, `updateQuestions`, `end`
- `backend/src/validators/liveInterviewValidator.js` — Joi schemas for the 4 endpoints
- `backend/src/controllers/liveInterviewController.js` — thin HTTP wrappers
- `backend/src/routes/liveInterviewRoutes.js` — interviewer-scoped router
- `backend/tests/unit/liveInterviewAiService.test.js`
- `backend/tests/unit/liveInterviewService.test.js`

**Backend modified files:**
- `backend/src/routes/index.js` — mount the new router under `/me`

**Frontend new files:**
- `frontend/src/api/liveInterviewApi.js`
- `frontend/src/features/liveInterview/liveInterviewSlice.js`
- `frontend/src/features/liveInterview/LiveInterviewPage.jsx`
- `frontend/src/features/liveInterview/LiveInterviewPage.scss`
- `frontend/src/features/liveInterview/ContextPanel.jsx`
- `frontend/src/features/liveInterview/ContextPanel.scss`
- `frontend/src/features/liveInterview/QuestionCard.jsx`
- `frontend/src/features/liveInterview/QuestionCard.scss`
- `frontend/src/features/liveInterview/CoverageBar.jsx`
- `frontend/src/features/liveInterview/CoverageBar.scss`

**Frontend modified files:**
- `frontend/src/routes/AppRoutes.jsx` — add `/interviewer/interviews/:id/live` route
- `frontend/src/features/myInterviews/MyInterviewDetailPage.jsx` — add "Open co-pilot" button, accept `?draft=…` to pre-fill the review form
- `frontend/src/features/myInterviews/ReviewForm.jsx` — make sure `initial` prop drives default state (already does — verify)
- `frontend/src/app/store.js` — register the new slice

---

### Task 1: LiveSession Mongoose model

**Files:**
- Create: `backend/src/models/LiveSession.js`

- [ ] **Step 1: Create the model**

Create `backend/src/models/LiveSession.js` with this exact content:

```js
'use strict';
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    text:       { type: String, required: true, maxlength: 600 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    topic:      { type: String, maxlength: 80, default: '' },
    askedAt:    { type: Date, default: null },
    note:       { type: String, maxlength: 500, default: '' },
    rating:     { type: Number, min: 1, max: 5, default: null },
  },
  { _id: false },
);

const draftReviewSchema = new mongoose.Schema(
  {
    knowledge:      { type: Number, min: 1, max: 5, default: null },
    communication:  { type: Number, min: 1, max: 5, default: null },
    confidence:     { type: Number, min: 1, max: 5, default: null },
    comments:       { type: String, maxlength: 4000, default: '' },
    recommendation: { type: String, enum: ['hire', 'no_hire', 'next_round', null], default: null },
    generatedBy:    { type: String, default: '' },
  },
  { _id: false },
);

const liveSessionSchema = new mongoose.Schema(
  {
    interview:    { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true, index: true },
    interviewer:  { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true, index: true },
    candidate:    { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    startedAt:    { type: Date, required: true, default: Date.now },
    endedAt:      { type: Date, default: null },
    questions:    { type: [questionSchema], default: [] },
    draftReview:  { type: draftReviewSchema, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret) => { delete ret.__v; return ret; } },
  },
);

liveSessionSchema.index({ interview: 1, endedAt: 1 });
liveSessionSchema.index({ interviewer: 1, createdAt: -1 });

module.exports = mongoose.model('LiveSession', liveSessionSchema);
```

- [ ] **Step 2: Smoke check the model loads**

Run: `cd backend && node -e "require('./src/models/LiveSession'); console.log('ok')"`
Expected: `ok` printed, no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/LiveSession.js
git commit -m "feat(live-interview): LiveSession mongoose model"
```

---

### Task 2: LiveSession repository

**Files:**
- Create: `backend/src/repositories/liveSessionRepository.js`

- [ ] **Step 1: Create the repository**

Create `backend/src/repositories/liveSessionRepository.js` with this exact content:

```js
'use strict';
const LiveSession = require('../models/LiveSession');

const create = (data) => LiveSession.create(data);

const findActiveByInterview = (interviewId) =>
  LiveSession.findOne({ interview: interviewId, endedAt: null }).sort({ createdAt: -1 });

const findById = (id) => LiveSession.findById(id);

const updateById = (id, patch) =>
  LiveSession.findByIdAndUpdate(id, patch, { new: true });

const applyQuestionUpdates = async (id, updates) => {
  // updates: [{ index, askedAt?, note?, rating? }]
  const setOps = {};
  for (const u of updates) {
    const i = Number(u.index);
    if (!Number.isInteger(i) || i < 0) continue;
    if (Object.prototype.hasOwnProperty.call(u, 'askedAt')) setOps[`questions.${i}.askedAt`] = u.askedAt;
    if (Object.prototype.hasOwnProperty.call(u, 'note')) setOps[`questions.${i}.note`] = u.note;
    if (Object.prototype.hasOwnProperty.call(u, 'rating')) setOps[`questions.${i}.rating`] = u.rating;
  }
  if (!Object.keys(setOps).length) return LiveSession.findById(id);
  return LiveSession.findByIdAndUpdate(id, { $set: setOps }, { new: true });
};

module.exports = { create, findActiveByInterview, findById, updateById, applyQuestionUpdates };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/liveSessionRepository.js
git commit -m "feat(live-interview): liveSession repository"
```

---

### Task 3: liveInterviewAiService — question generation

**Files:**
- Create: `backend/src/services/liveInterviewAiService.js`
- Create: `backend/tests/unit/liveInterviewAiService.test.js`

The existing pattern (see `promptProblemAiService.js`) is:
- `buildXxxPrompt({ ... })` returns a string
- The exported async fn calls `aiService.askWithFallback(prompt)`, then `aiService.extractJson(text)`, validates, returns parsed (or `null` on failure)
- Logs warnings on failure paths

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/liveInterviewAiService.test.js`:

```js
jest.mock('../../src/services/aiService', () => {
  const actual = jest.requireActual('../../src/services/aiService');
  return { ...actual, askWithFallback: jest.fn() };
});

const aiService = require('../../src/services/aiService');
const svc = require('../../src/services/liveInterviewAiService');

describe('liveInterviewAiService.generateQuestions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed questions when AI succeeds', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify([
        { text: 'Q1', difficulty: 'easy',   topic: 'Python' },
        { text: 'Q2', difficulty: 'medium', topic: 'Async'  },
        { text: 'Q3', difficulty: 'hard',   topic: 'Design' },
      ]),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.generateQuestions({
      candidate: { name: 'A', techStack: ['Python'], experience: 1, screening: {} },
      jdText: 'Python role',
      durationMinutes: 30,
      priorReviews: [],
    });
    expect(out.questions).toHaveLength(3);
    expect(out.questions[0].text).toBe('Q1');
    expect(out.provider).toBe('gemini');
  });

  test('returns empty list when AI returns nothing', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const out = await svc.generateQuestions({
      candidate: { techStack: [], experience: 0, screening: {} },
      jdText: '', durationMinutes: 30, priorReviews: [],
    });
    expect(out.questions).toEqual([]);
  });

  test('returns empty list when AI returns invalid JSON', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: 'sorry I cannot do that',
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.generateQuestions({
      candidate: { techStack: [], experience: 0, screening: {} },
      jdText: '', durationMinutes: 30, priorReviews: [],
    });
    expect(out.questions).toEqual([]);
  });

  test('filters out questions missing required fields', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify([
        { text: 'Good Q', difficulty: 'easy', topic: 'X' },
        { text: 'No diff', topic: 'Y' },
        { difficulty: 'medium' },
      ]),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.generateQuestions({
      candidate: { techStack: [], experience: 0, screening: {} },
      jdText: '', durationMinutes: 30, priorReviews: [],
    });
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0].text).toBe('Good Q');
  });

  test('passes JD + candidate + prior reviews into the prompt', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    await svc.generateQuestions({
      candidate: {
        name: 'Riya', techStack: ['Python', 'React'], experience: 2,
        screening: { summary: 'strong frontend', greenFlags: ['ts'], redFlags: ['backend'] },
      },
      jdText: 'Python backend role',
      durationMinutes: 45,
      priorReviews: [{ ratings: { knowledge: 3 }, comments: 'shaky on async' }],
    });
    const promptArg = aiService.askWithFallback.mock.calls[0][0];
    expect(promptArg).toContain('Python, React');
    expect(promptArg).toContain('Python backend role');
    expect(promptArg).toContain('shaky on async');
    expect(promptArg).toContain('45-minute');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- --testPathPattern=liveInterviewAiService`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement the service**

Create `backend/src/services/liveInterviewAiService.js`:

```js
'use strict';
const aiService = require('./aiService');
const logger = require('../config/logger');

const RESUME_EXCERPT_LIMIT = 1500;

const buildQuestionsPrompt = ({ candidate, jdText, durationMinutes, priorReviews }) => {
  const sc = candidate.screening || {};
  const resumeExcerpt = (sc.resumeText || '').slice(0, RESUME_EXCERPT_LIMIT);
  const priorSummary = (priorReviews || []).map((r, i) => {
    const rt = r.ratings || {};
    const avg = [rt.knowledge, rt.communication, rt.confidence].filter((x) => typeof x === 'number');
    const avgStr = avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : 'n/a';
    return `- Round ${i + 1}: avg ${avgStr}/5. ${r.comments || ''}`;
  }).join('\n');

  const lines = [
    'You are designing an interview for a candidate. Generate 12 questions a non-domain-expert interviewer can ask comfortably.',
    '',
    `Job description:\n${jdText || 'unspecified'}`,
    '',
    'Candidate snapshot:',
    `- Name: ${candidate.name || 'unspecified'}`,
    `- Experience: ${candidate.experience || 0} years`,
    `- Stack: ${(candidate.techStack || []).join(', ') || 'unspecified'}`,
    `- Screening summary: ${sc.summary || 'n/a'}`,
    `- Green flags: ${(sc.greenFlags || []).join('; ') || 'n/a'}`,
    `- Red flags: ${(sc.redFlags || []).join('; ') || 'n/a'}`,
    `- Resume excerpt: ${resumeExcerpt || 'n/a'}`,
    '',
    priorSummary ? `Prior round feedback (avoid repeating, focus on weak areas):\n${priorSummary}` : 'No prior rounds.',
    '',
    `Generate 12 questions for a ${durationMinutes}-minute interview.`,
    'Distribute: 4 easy, 5 medium, 3 hard.',
    'Each item must include: text (1-3 sentences), difficulty (easy|medium|hard), topic (short tag from the JD).',
    '',
    'Return ONLY a JSON array. No prose, no markdown fences.',
  ];
  return lines.join('\n');
};

const sanitizeQuestion = (q) => {
  if (!q || typeof q.text !== 'string') return null;
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) return null;
  return {
    text: q.text.slice(0, 600),
    difficulty: q.difficulty,
    topic: (typeof q.topic === 'string' ? q.topic : '').slice(0, 80),
  };
};

const generateQuestions = async ({ candidate, jdText, durationMinutes, priorReviews }) => {
  const prompt = buildQuestionsPrompt({ candidate, jdText, durationMinutes, priorReviews });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('live-interview AI returned nothing for questions');
    return { questions: [], provider: null, model: null };
  }
  const parsed = aiService.extractJson(text);
  if (!Array.isArray(parsed)) {
    logger.warn('live-interview AI: questions JSON not an array');
    return { questions: [], provider, model };
  }
  const questions = parsed.map(sanitizeQuestion).filter(Boolean);
  logger.info('live-interview AI questions', { provider, model, count: questions.length });
  return { questions, provider, model };
};

module.exports = { generateQuestions, buildQuestionsPrompt };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- --testPathPattern=liveInterviewAiService`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/liveInterviewAiService.js backend/tests/unit/liveInterviewAiService.test.js
git commit -m "feat(live-interview): AI service - generateQuestions"
```

---

### Task 4: liveInterviewAiService — draft review generation

**Files:**
- Modify: `backend/src/services/liveInterviewAiService.js`
- Modify: `backend/tests/unit/liveInterviewAiService.test.js`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/unit/liveInterviewAiService.test.js` (after the existing `describe` block):

```js
describe('liveInterviewAiService.generateDraftReview', () => {
  beforeEach(() => jest.clearAllMocks());

  const askedQuestions = [
    { text: 'Q1', difficulty: 'easy',   topic: 'A', askedAt: new Date(), note: 'confident', rating: 4 },
    { text: 'Q2', difficulty: 'medium', topic: 'B', askedAt: new Date(), note: 'hesitant',  rating: 3 },
    { text: 'Q3', difficulty: 'hard',   topic: 'C', askedAt: null,       note: '',          rating: null },
  ];

  test('returns parsed draft when AI succeeds', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({
        knowledge: 4, communication: 3, confidence: 4,
        comments: 'Strong on basics, hesitant on hard. Recommend next round.',
        recommendation: 'next_round',
      }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.generateDraftReview({ questions: askedQuestions });
    expect(out.draft.knowledge).toBe(4);
    expect(out.draft.recommendation).toBe('next_round');
    expect(out.provider).toBe('gemini');
  });

  test('returns fallback draft when AI fails', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const out = await svc.generateDraftReview({ questions: askedQuestions });
    expect(out.draft.knowledge).toBeNull();
    expect(out.draft.communication).toBeNull();
    expect(out.draft.confidence).toBeNull();
    expect(out.draft.comments).toContain('confident');
    expect(out.draft.comments).toContain('hesitant');
    expect(out.draft.recommendation).toBeNull();
  });

  test('clamps ratings to 1-5 and rejects invalid recommendation', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({
        knowledge: 7, communication: 0, confidence: 3,
        comments: 'ok', recommendation: 'maybe',
      }),
      provider: 'gemini', model: 'g',
    });
    const out = await svc.generateDraftReview({ questions: askedQuestions });
    expect(out.draft.knowledge).toBe(5);
    expect(out.draft.communication).toBe(1);
    expect(out.draft.confidence).toBe(3);
    expect(out.draft.recommendation).toBeNull();
  });

  test('only sends asked questions to the AI', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    await svc.generateDraftReview({ questions: askedQuestions });
    const promptArg = aiService.askWithFallback.mock.calls[0][0];
    expect(promptArg).toContain('Q1');
    expect(promptArg).toContain('Q2');
    expect(promptArg).not.toContain('Q3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- --testPathPattern=liveInterviewAiService`
Expected: FAIL — `svc.generateDraftReview` is undefined.

- [ ] **Step 3: Implement generateDraftReview**

Edit `backend/src/services/liveInterviewAiService.js`. Add these at the bottom, before `module.exports`:

```js
const VALID_RECS = new Set(['hire', 'no_hire', 'next_round']);

const clampRating = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 1) return 1;
  if (n > 5) return 5;
  return Math.round(n);
};

const buildDraftPrompt = ({ asked }) => {
  const items = asked.map((q, i) =>
    `${i + 1}. [${q.difficulty}] ${q.text}\n   Note: ${q.note || '(none)'}\n   Rating: ${q.rating != null ? q.rating : '(none)'}`,
  ).join('\n');
  return [
    'You are an interview reviewer. Below are the questions asked, the interviewer\'s notes, and per-question ratings.',
    '',
    items,
    '',
    'Produce a balanced, concise review:',
    '- knowledge: integer 1-5 (weight hard questions 1.5x in your judgement)',
    '- communication: integer 1-5 (infer from how notes describe clarity of expression)',
    '- confidence: integer 1-5 (infer from notes — hesitation, certainty)',
    '- comments: 2-4 sentences. First: strengths. Second: weaknesses. Third: hiring rationale.',
    '- recommendation: one of "hire", "no_hire", "next_round"',
    '',
    'Return ONLY a JSON object with those 5 fields. No prose, no markdown fences.',
  ].join('\n');
};

const fallbackDraft = (asked) => ({
  knowledge: null, communication: null, confidence: null,
  comments: asked.map((q) => `${q.text}\n  Note: ${q.note || '—'} (rating ${q.rating ?? '—'})`).join('\n\n'),
  recommendation: null,
});

const generateDraftReview = async ({ questions }) => {
  const asked = (questions || []).filter((q) => q.askedAt);
  if (asked.length === 0) {
    return { draft: { knowledge: null, communication: null, confidence: null, comments: '', recommendation: null }, provider: null, model: null };
  }
  const prompt = buildDraftPrompt({ asked });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('live-interview AI returned nothing for draft review');
    return { draft: fallbackDraft(asked), provider: null, model: null };
  }
  const parsed = aiService.extractJson(text);
  if (!parsed || typeof parsed !== 'object') {
    logger.warn('live-interview AI: draft JSON invalid');
    return { draft: fallbackDraft(asked), provider, model };
  }
  const draft = {
    knowledge:     clampRating(parsed.knowledge),
    communication: clampRating(parsed.communication),
    confidence:    clampRating(parsed.confidence),
    comments:      (typeof parsed.comments === 'string' ? parsed.comments : '').slice(0, 4000),
    recommendation: VALID_RECS.has(parsed.recommendation) ? parsed.recommendation : null,
  };
  return { draft, provider, model };
};
```

Update the exports line at the bottom of the file:

```js
module.exports = { generateQuestions, generateDraftReview, buildQuestionsPrompt };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- --testPathPattern=liveInterviewAiService`
Expected: PASS — all 9 tests pass (5 from Task 3 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/liveInterviewAiService.js backend/tests/unit/liveInterviewAiService.test.js
git commit -m "feat(live-interview): AI service - generateDraftReview"
```

---

### Task 5: liveInterviewService — start (idempotent)

**Files:**
- Create: `backend/src/services/liveInterviewService.js`
- Create: `backend/tests/unit/liveInterviewService.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/liveInterviewService.test.js`:

```js
jest.mock('../../src/repositories/liveSessionRepository');
jest.mock('../../src/repositories/interviewRepository');
jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/repositories/reviewRepository');
jest.mock('../../src/repositories/jobDescriptionRepository');
jest.mock('../../src/services/liveInterviewAiService');

const repo = require('../../src/repositories/liveSessionRepository');
const interviewRepo = require('../../src/repositories/interviewRepository');
const candidateRepo = require('../../src/repositories/candidateRepository');
const reviewRepo = require('../../src/repositories/reviewRepository');
const jdRepo = require('../../src/repositories/jobDescriptionRepository');
const ai = require('../../src/services/liveInterviewAiService');
const svc = require('../../src/services/liveInterviewService');

describe('liveInterviewService.start', () => {
  beforeEach(() => jest.clearAllMocks());

  const interview = {
    id: 'i1', _id: 'i1', durationMinutes: 30,
    candidate: { _id: 'c1', id: 'c1' },
    interviewer: 'iv1',
    jobDescription: 'jd1',
  };

  test('returns existing session if active', async () => {
    repo.findActiveByInterview.mockResolvedValue({ id: 's1', toObject: () => ({ id: 's1', questions: [] }) });
    const out = await svc.start({ interviewId: 'i1', interviewerId: 'iv1' });
    expect(out.id).toBe('s1');
    expect(ai.generateQuestions).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  test('creates a new session with AI-generated questions if none active', async () => {
    repo.findActiveByInterview.mockResolvedValue(null);
    interviewRepo.findByIdPopulated.mockResolvedValue(interview);
    candidateRepo.findById.mockResolvedValue({ id: 'c1', name: 'A', techStack: ['Python'], experience: 1, screening: {} });
    jdRepo.findById.mockResolvedValue({ id: 'jd1', text: 'Python role' });
    reviewRepo.findByCandidate.mockResolvedValue([]);
    ai.generateQuestions.mockResolvedValue({
      questions: [{ text: 'Q1', difficulty: 'easy', topic: 't' }],
      provider: 'gemini', model: 'g',
    });
    repo.create.mockImplementation((d) => ({ ...d, id: 's2', toObject: () => ({ id: 's2', ...d }) }));

    const out = await svc.start({ interviewId: 'i1', interviewerId: 'iv1' });
    expect(out.id).toBe('s2');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      interview: 'i1', interviewer: 'iv1', candidate: 'c1',
      questions: [{ text: 'Q1', difficulty: 'easy', topic: 't' }],
    }));
  });

  test('creates a session with empty questions if AI fails', async () => {
    repo.findActiveByInterview.mockResolvedValue(null);
    interviewRepo.findByIdPopulated.mockResolvedValue(interview);
    candidateRepo.findById.mockResolvedValue({ id: 'c1', techStack: [], experience: 0, screening: {} });
    jdRepo.findById.mockResolvedValue(null);
    reviewRepo.findByCandidate.mockResolvedValue([]);
    ai.generateQuestions.mockResolvedValue({ questions: [], provider: null, model: null });
    repo.create.mockImplementation((d) => ({ ...d, id: 's3', toObject: () => ({ id: 's3', ...d }) }));

    const out = await svc.start({ interviewId: 'i1', interviewerId: 'iv1' });
    expect(out.id).toBe('s3');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ questions: [] }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- --testPathPattern=liveInterviewService`
Expected: FAIL — service doesn't exist.

- [ ] **Step 3: Implement start()**

Create `backend/src/services/liveInterviewService.js`:

```js
'use strict';
const liveSessionRepository = require('../repositories/liveSessionRepository');
const interviewRepository = require('../repositories/interviewRepository');
const candidateRepository = require('../repositories/candidateRepository');
const reviewRepository = require('../repositories/reviewRepository');
const jdRepository = require('../repositories/jobDescriptionRepository');
const aiService = require('./liveInterviewAiService');
const ApiError = require('../utils/ApiError');

const toObj = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const start = async ({ interviewId, interviewerId }) => {
  const existing = await liveSessionRepository.findActiveByInterview(interviewId);
  if (existing) return toObj(existing);

  const interview = await interviewRepository.findByIdPopulated(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');

  const candidateId = (interview.candidate && (interview.candidate._id || interview.candidate.id)) || null;
  if (!candidateId) throw ApiError.badRequest('Interview has no candidate');

  const candidate = await candidateRepository.findById(candidateId);
  const jdId = (interview.jobDescription && (interview.jobDescription._id || interview.jobDescription)) || null;
  const jd = jdId ? await jdRepository.findById(jdId) : null;
  const priorReviews = await reviewRepository.findByCandidate(candidateId) || [];

  const { questions } = await aiService.generateQuestions({
    candidate: candidate || {},
    jdText: jd ? (jd.text || jd.description || '') : '',
    durationMinutes: interview.durationMinutes || 30,
    priorReviews,
  });

  const session = await liveSessionRepository.create({
    interview: interviewId,
    interviewer: interviewerId,
    candidate: candidateId,
    questions,
  });
  return toObj(session);
};

module.exports = { start };
```

- [ ] **Step 4: Add `findByCandidate` to reviewRepository**

`Review` model has a `candidate` field already (verified). Edit `backend/src/repositories/reviewRepository.js`. Add this function:

```js
const findByCandidate = async (candidateId) =>
  Review.find({ candidate: candidateId }).sort({ createdAt: 1 }).lean();
```

(`Review` is already required at the top of the file.) Add `findByCandidate` to the existing `module.exports = { ... }` so it's exported.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npm test -- --testPathPattern=liveInterviewService`
Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/liveInterviewService.js backend/src/repositories/reviewRepository.js backend/tests/unit/liveInterviewService.test.js
git commit -m "feat(live-interview): service.start - idempotent session creation"
```

---

### Task 6: liveInterviewService — getActive, updateQuestions, end

**Files:**
- Modify: `backend/src/services/liveInterviewService.js`
- Modify: `backend/tests/unit/liveInterviewService.test.js`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/unit/liveInterviewService.test.js`:

```js
describe('liveInterviewService.getActive', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns active session', async () => {
    repo.findActiveByInterview.mockResolvedValue({ id: 's1', toObject: () => ({ id: 's1' }) });
    const out = await svc.getActive({ interviewId: 'i1' });
    expect(out.id).toBe('s1');
  });

  test('returns null when none', async () => {
    repo.findActiveByInterview.mockResolvedValue(null);
    const out = await svc.getActive({ interviewId: 'i1' });
    expect(out).toBeNull();
  });
});

describe('liveInterviewService.updateQuestions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects if session not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.updateQuestions({ sessionId: 's1', interviewerId: 'iv1', updates: [] }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects if interviewer does not own session', async () => {
    repo.findById.mockResolvedValue({ id: 's1', interviewer: 'other' });
    await expect(svc.updateQuestions({ sessionId: 's1', interviewerId: 'iv1', updates: [] }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test('rejects if session already ended', async () => {
    repo.findById.mockResolvedValue({ id: 's1', interviewer: 'iv1', endedAt: new Date() });
    await expect(svc.updateQuestions({ sessionId: 's1', interviewerId: 'iv1', updates: [] }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('applies updates when owner and active', async () => {
    repo.findById.mockResolvedValue({ id: 's1', interviewer: 'iv1', endedAt: null });
    repo.applyQuestionUpdates.mockResolvedValue({ id: 's1', toObject: () => ({ id: 's1', applied: true }) });
    const out = await svc.updateQuestions({
      sessionId: 's1', interviewerId: 'iv1',
      updates: [{ index: 0, rating: 4, note: 'good' }],
    });
    expect(repo.applyQuestionUpdates).toHaveBeenCalledWith('s1', [{ index: 0, rating: 4, note: 'good' }]);
    expect(out.applied).toBe(true);
  });
});

describe('liveInterviewService.end', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects if not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.end({ sessionId: 's1', interviewerId: 'iv1' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('returns existing draft when already ended (idempotent)', async () => {
    repo.findById.mockResolvedValue({
      id: 's1', interviewer: 'iv1', endedAt: new Date(),
      draftReview: { knowledge: 4, comments: 'x' },
      toObject() { return { id: 's1', endedAt: this.endedAt, draftReview: this.draftReview }; },
    });
    const out = await svc.end({ sessionId: 's1', interviewerId: 'iv1' });
    expect(out.draftReview.knowledge).toBe(4);
    expect(ai.generateDraftReview).not.toHaveBeenCalled();
  });

  test('generates draft, persists endedAt, returns session', async () => {
    repo.findById.mockResolvedValue({
      id: 's1', interviewer: 'iv1', endedAt: null,
      questions: [{ text: 'Q', difficulty: 'easy', askedAt: new Date(), note: 'ok', rating: 4 }],
    });
    ai.generateDraftReview.mockResolvedValue({
      draft: { knowledge: 4, communication: 4, confidence: 4, comments: 'ok', recommendation: 'hire' },
      provider: 'gemini', model: 'g',
    });
    repo.updateById.mockImplementation((id, patch) => ({
      id, ...patch, toObject() { return { id, ...patch }; },
    }));

    const out = await svc.end({ sessionId: 's1', interviewerId: 'iv1' });
    expect(repo.updateById).toHaveBeenCalledWith('s1', expect.objectContaining({
      endedAt: expect.any(Date),
      draftReview: expect.objectContaining({
        knowledge: 4, recommendation: 'hire', generatedBy: 'gemini:g',
      }),
    }));
    expect(out.draftReview.knowledge).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- --testPathPattern=liveInterviewService`
Expected: FAIL — `svc.getActive`, `svc.updateQuestions`, `svc.end` undefined.

- [ ] **Step 3: Implement the three methods**

Edit `backend/src/services/liveInterviewService.js`. Add these functions before `module.exports`:

```js
const getActive = async ({ interviewId }) => {
  const s = await liveSessionRepository.findActiveByInterview(interviewId);
  return s ? toObj(s) : null;
};

const ensureOwnerActive = (session, interviewerId, { allowEnded = false } = {}) => {
  if (!session) throw ApiError.notFound('Session not found');
  if (String(session.interviewer) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your session', { code: 'E_FORBIDDEN' });
  }
  if (!allowEnded && session.endedAt) {
    throw ApiError.conflict('Session already ended', { code: 'E_ALREADY_ENDED' });
  }
};

const updateQuestions = async ({ sessionId, interviewerId, updates }) => {
  const session = await liveSessionRepository.findById(sessionId);
  ensureOwnerActive(session, interviewerId);
  const updated = await liveSessionRepository.applyQuestionUpdates(sessionId, updates || []);
  return toObj(updated);
};

const end = async ({ sessionId, interviewerId }) => {
  const session = await liveSessionRepository.findById(sessionId);
  ensureOwnerActive(session, interviewerId, { allowEnded: true });
  if (session.endedAt) return toObj(session);

  const { draft, provider, model } = await aiService.generateDraftReview({ questions: session.questions || [] });
  const draftReview = {
    knowledge: draft.knowledge,
    communication: draft.communication,
    confidence: draft.confidence,
    comments: draft.comments,
    recommendation: draft.recommendation,
    generatedBy: provider && model ? `${provider}:${model}` : '',
  };
  const updated = await liveSessionRepository.updateById(sessionId, {
    endedAt: new Date(),
    draftReview,
  });
  return toObj(updated);
};
```

Update the exports line at the bottom:

```js
module.exports = { start, getActive, updateQuestions, end };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- --testPathPattern=liveInterviewService`
Expected: PASS — 10 tests pass (3 from Task 5 + 7 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/liveInterviewService.js backend/tests/unit/liveInterviewService.test.js
git commit -m "feat(live-interview): service - getActive/update/end"
```

---

### Task 7: Validators

**Files:**
- Create: `backend/src/validators/liveInterviewValidator.js`

- [ ] **Step 1: Create the validator file**

Create `backend/src/validators/liveInterviewValidator.js`:

```js
'use strict';
const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const interviewIdParam = { params: Joi.object({ id: objectId.required() }) };
const sessionIdParam   = { params: Joi.object({ id: objectId.required() }) };

const updateBody = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    questionUpdates: Joi.array().items(
      Joi.object({
        index:   Joi.number().integer().min(0).required(),
        askedAt: Joi.date().allow(null).optional(),
        note:    Joi.string().allow('').max(500).optional(),
        rating:  Joi.number().integer().min(1).max(5).allow(null).optional(),
      }),
    ).min(1).max(20).required(),
  }),
};

module.exports = { interviewIdParam, sessionIdParam, updateBody };
```

- [ ] **Step 2: Smoke check it loads**

Run: `cd backend && node -e "require('./src/validators/liveInterviewValidator'); console.log('ok')"`
Expected: `ok` printed.

- [ ] **Step 3: Commit**

```bash
git add backend/src/validators/liveInterviewValidator.js
git commit -m "feat(live-interview): joi validators"
```

---

### Task 8: Controller

**Files:**
- Create: `backend/src/controllers/liveInterviewController.js`

- [ ] **Step 1: Create the controller**

Create `backend/src/controllers/liveInterviewController.js`:

```js
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const svc = require('../services/liveInterviewService');

const start = asyncHandler(async (req, res) => {
  const session = await svc.start({ interviewId: req.params.id, interviewerId: req.user.id });
  return created(res, { session }, 'Live session ready');
});

const getActive = asyncHandler(async (req, res) => {
  const session = await svc.getActive({ interviewId: req.params.id });
  return ok(res, { session }, 'OK');
});

const updateQuestions = asyncHandler(async (req, res) => {
  const session = await svc.updateQuestions({
    sessionId: req.params.id,
    interviewerId: req.user.id,
    updates: req.body.questionUpdates,
  });
  return ok(res, { session }, 'Updated');
});

const end = asyncHandler(async (req, res) => {
  const session = await svc.end({ sessionId: req.params.id, interviewerId: req.user.id });
  return ok(res, { session }, 'Ended');
});

module.exports = { start, getActive, updateQuestions, end };
```

- [ ] **Step 2: Smoke check it loads**

Run: `cd backend && node -e "require('./src/controllers/liveInterviewController'); console.log('ok')"`
Expected: `ok` printed.

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/liveInterviewController.js
git commit -m "feat(live-interview): controller"
```

---

### Task 9: Routes + mount under /me

**Files:**
- Create: `backend/src/routes/liveInterviewRoutes.js`
- Modify: `backend/src/routes/index.js`

- [ ] **Step 1: Create the route file**

Create `backend/src/routes/liveInterviewRoutes.js`:

```js
'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { requireMyInterview } = require('../middlewares/myInterviewMiddleware');
const ctrl = require('../controllers/liveInterviewController');
const v = require('../validators/liveInterviewValidator');

const router = express.Router();
router.use(requireAuth, requireRole('interviewer'));

// Scoped under /me — interview-side endpoints use requireMyInterview for ownership.
router.post('/interviews/:id/live/start', validate(v.interviewIdParam), requireMyInterview, ctrl.start);
router.get( '/interviews/:id/live',       validate(v.interviewIdParam), requireMyInterview, ctrl.getActive);

// Session-side endpoints — ownership enforced inside the service (interviewer field on session).
router.patch('/live-sessions/:id',     validate(v.updateBody),     ctrl.updateQuestions);
router.post( '/live-sessions/:id/end', validate(v.sessionIdParam), ctrl.end);

module.exports = router;
```

- [ ] **Step 2: Mount in routes/index.js**

Edit `backend/src/routes/index.js`. Just under the existing `const promptTestPublicRoutes = require('./promptTestPublicRoutes');` line, add:

```js
const liveInterviewRoutes = require('./liveInterviewRoutes');
```

And in the `router.use(...)` section, at the END (after all other `router.use` calls), add:

```js
router.use('/me', liveInterviewRoutes);
```

(Note: this mounts in addition to the existing `router.use('/me', myInterviewRoutes)`. Express routers chain — both routers handle requests under `/me`.)

- [ ] **Step 3: Smoke check the server starts**

Run: `cd backend && node -e "require('./src/app'); console.log('ok')"`
Expected: `ok` printed, no module-load errors.

- [ ] **Step 4: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all tests pass (146 existing + 13 new = 159).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/liveInterviewRoutes.js backend/src/routes/index.js
git commit -m "feat(live-interview): routes mounted under /me"
```

---

### Task 10: Frontend API wrapper

**Files:**
- Create: `frontend/src/api/liveInterviewApi.js`

- [ ] **Step 1: Create the API wrapper**

Create `frontend/src/api/liveInterviewApi.js`:

```js
import { apiClient } from './axios';

export const liveInterviewApi = {
  start: (interviewId) =>
    apiClient.post(`/me/interviews/${interviewId}/live/start`).then((r) => r.data.data.session),
  getActive: (interviewId) =>
    apiClient.get(`/me/interviews/${interviewId}/live`).then((r) => r.data.data.session),
  updateQuestions: (sessionId, questionUpdates) =>
    apiClient.patch(`/me/live-sessions/${sessionId}`, { questionUpdates }).then((r) => r.data.data.session),
  end: (sessionId) =>
    apiClient.post(`/me/live-sessions/${sessionId}/end`).then((r) => r.data.data.session),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/liveInterviewApi.js
git commit -m "feat(live-interview): frontend api wrapper"
```

---

### Task 11: Redux slice + store registration

**Files:**
- Create: `frontend/src/features/liveInterview/liveInterviewSlice.js`
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: Create the slice**

Create `frontend/src/features/liveInterview/liveInterviewSlice.js`:

```js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { liveInterviewApi } from '@/api/liveInterviewApi';
import { extractError } from '@/api/axios';

export const startLiveSession = createAsyncThunk(
  'liveInterview/start',
  async (interviewId, { rejectWithValue }) => {
    try { return await liveInterviewApi.start(interviewId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchActiveLiveSession = createAsyncThunk(
  'liveInterview/getActive',
  async (interviewId, { rejectWithValue }) => {
    try { return await liveInterviewApi.getActive(interviewId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const patchLiveSession = createAsyncThunk(
  'liveInterview/patch',
  async ({ sessionId, questionUpdates }, { rejectWithValue }) => {
    try { return await liveInterviewApi.updateQuestions(sessionId, questionUpdates); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const endLiveSession = createAsyncThunk(
  'liveInterview/end',
  async (sessionId, { rejectWithValue }) => {
    try { return await liveInterviewApi.end(sessionId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const initial = {
  session: null,
  status: 'idle',         // 'idle' | 'loading' | 'ready' | 'ending' | 'ended' | 'failed'
  error: null,
};

const slice = createSlice({
  name: 'liveInterview',
  initialState: initial,
  reducers: {
    clearSession(state) { state.session = null; state.status = 'idle'; state.error = null; },
    // Optimistic local update; backend reconciles on the next debounced PATCH.
    setQuestionField(state, action) {
      const { index, field, value } = action.payload;
      if (!state.session?.questions?.[index]) return;
      state.session.questions[index][field] = value;
    },
  },
  extraReducers: (b) => {
    b.addCase(startLiveSession.pending, (s) => { s.status = 'loading'; s.error = null; });
    b.addCase(startLiveSession.fulfilled, (s, a) => { s.session = a.payload; s.status = 'ready'; });
    b.addCase(startLiveSession.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed'; });

    b.addCase(fetchActiveLiveSession.pending, (s) => { s.status = 'loading'; });
    b.addCase(fetchActiveLiveSession.fulfilled, (s, a) => { s.session = a.payload; s.status = a.payload ? 'ready' : 'idle'; });
    b.addCase(fetchActiveLiveSession.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed'; });

    b.addCase(patchLiveSession.fulfilled, (s, a) => { if (a.payload) s.session = a.payload; });

    b.addCase(endLiveSession.pending, (s) => { s.status = 'ending'; });
    b.addCase(endLiveSession.fulfilled, (s, a) => { s.session = a.payload; s.status = 'ended'; });
    b.addCase(endLiveSession.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed'; });
  },
});

export const { clearSession, setQuestionField } = slice.actions;
export default slice.reducer;
```

- [ ] **Step 2: Register slice in the store**

Edit `frontend/src/app/store.js`. Add an import near the other `*Reducer` imports:

```js
import liveInterviewReducer from '@/features/liveInterview/liveInterviewSlice';
```

In the `reducer: { ... }` object (after `promptTest: promptTestReducer,`), add:

```js
    liveInterview: liveInterviewReducer,
```

- [ ] **Step 3: Smoke check the frontend builds**

Run: `cd frontend && npm run build`
Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/liveInterview/liveInterviewSlice.js frontend/src/app/store.js
git commit -m "feat(live-interview): redux slice + store registration"
```

---

### Task 12: ContextPanel component

**Files:**
- Create: `frontend/src/features/liveInterview/ContextPanel.jsx`
- Create: `frontend/src/features/liveInterview/ContextPanel.scss`

- [ ] **Step 1: Create the component**

Create `frontend/src/features/liveInterview/ContextPanel.jsx`:

```jsx
import { useState } from 'react';
import './ContextPanel.scss';

function Card({ title, summary, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`co-card ${open ? 'co-card--open' : ''}`}>
      <button type="button" className="co-card__head" onClick={() => setOpen((v) => !v)}>
        <span className="co-card__title">{title}</span>
        <span className="co-card__chev" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {!open && summary && <div className="co-card__summary">{summary}</div>}
      {open && <div className="co-card__body">{children}</div>}
    </div>
  );
}

export default function ContextPanel({ interview, candidate, jd, priorReviews }) {
  const c = candidate || {};
  const i = interview || {};
  const sc = c.screening || {};
  return (
    <aside className="co-context">
      <Card
        title="Job description"
        summary={i.role || (jd && jd.title) || 'Role'}
        defaultOpen
      >
        <div className="co-context__jd">{(jd && (jd.text || jd.description)) || 'No JD attached.'}</div>
      </Card>

      <Card
        title="Candidate"
        summary={`${c.name || '—'} · ${c.experience ?? '—'}y`}
        defaultOpen
      >
        <div className="co-context__row"><span>Email</span><strong>{c.email || '—'}</strong></div>
        <div className="co-context__row"><span>Experience</span><strong>{c.experience ?? '—'} yrs</strong></div>
        <div className="co-context__row"><span>Stack</span><strong>{(c.techStack || []).join(', ') || '—'}</strong></div>
        {c.resumeUrl && (
          <div className="co-context__row">
            <span>Resume</span><a href={c.resumeUrl} target="_blank" rel="noopener noreferrer">Download</a>
          </div>
        )}
      </Card>

      {sc.status && (
        <Card
          title={`Screening · ${sc.matchPercent ?? '—'}%`}
          summary={`Greens ${(sc.greenFlags || []).length} · Reds ${(sc.redFlags || []).length}`}
        >
          {sc.summary && <p className="co-context__sum">{sc.summary}</p>}
          {(sc.greenFlags || []).length > 0 && (
            <div className="co-context__flags">
              <h5>Green</h5>
              <ul>{sc.greenFlags.map((f, i2) => <li key={`g${i2}`}>{f}</li>)}</ul>
            </div>
          )}
          {(sc.redFlags || []).length > 0 && (
            <div className="co-context__flags">
              <h5>Red</h5>
              <ul>{sc.redFlags.map((f, i2) => <li key={`r${i2}`}>{f}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      {(priorReviews || []).map((r, i2) => (
        <Card
          key={`pr${i2}`}
          title={`Prior round ${i2 + 1}`}
          summary={`Knowledge ${r.ratings?.knowledge ?? '—'}/5`}
        >
          <div className="co-context__row"><span>Knowledge</span><strong>{r.ratings?.knowledge ?? '—'}/5</strong></div>
          <div className="co-context__row"><span>Communication</span><strong>{r.ratings?.communication ?? '—'}/5</strong></div>
          <div className="co-context__row"><span>Confidence</span><strong>{r.ratings?.confidence ?? '—'}/5</strong></div>
          {r.comments && <p className="co-context__sum">{r.comments}</p>}
        </Card>
      ))}
    </aside>
  );
}
```

- [ ] **Step 2: Create the SCSS**

Create `frontend/src/features/liveInterview/ContextPanel.scss`:

```scss
.co-context {
  display: flex;
  flex-direction: column;
  gap: $space-3;

  .co-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: $radius-lg;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    overflow: hidden;

    &__head {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: $space-3 $space-4;
      background: transparent;
      border: 0;
      cursor: pointer;
      text-align: left;
    }
    &__title { font-weight: 600; color: #111827; font-size: 14px; }
    &__chev  { color: #6b7280; font-size: 12px; }
    &__summary { padding: 0 $space-4 $space-3; color: #6b7280; font-size: 13px; }
    &__body { padding: 0 $space-4 $space-3; }
  }

  &__jd { white-space: pre-wrap; font-size: 13px; color: #374151; line-height: 1.5; max-height: 180px; overflow: auto; }
  &__row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; padding: 4px 0; border-bottom: 1px dashed #f1f5f9;
    span { color: #6b7280; }
    strong { color: #111827; font-weight: 500; }
    a { color: $color-primary; text-decoration: none; &:hover { text-decoration: underline; } }
    &:last-child { border-bottom: 0; }
  }
  &__sum { font-size: 13px; color: #374151; margin: $space-2 0 0; }
  &__flags {
    margin-top: $space-2;
    h5 { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #6b7280; }
    ul { margin: 0; padding-left: 16px; font-size: 13px; color: #374151; }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/liveInterview/ContextPanel.jsx frontend/src/features/liveInterview/ContextPanel.scss
git commit -m "feat(live-interview): ContextPanel component"
```

---

### Task 13: QuestionCard component

**Files:**
- Create: `frontend/src/features/liveInterview/QuestionCard.jsx`
- Create: `frontend/src/features/liveInterview/QuestionCard.scss`

- [ ] **Step 1: Create the component**

Create `frontend/src/features/liveInterview/QuestionCard.jsx`:

```jsx
import './QuestionCard.scss';

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function QuestionCard({ question, index, onChange }) {
  const asked = !!question.askedAt;
  const onToggleAsked = () => onChange(index, 'askedAt', asked ? null : new Date().toISOString());
  const onNote = (e) => onChange(index, 'note', e.target.value);
  const onRate = (n) => onChange(index, 'rating', n);

  return (
    <div className={`qc ${asked ? 'qc--asked' : ''}`}>
      <div className="qc__head">
        <span className={`qc__diff qc__diff--${question.difficulty}`}>{DIFFICULTY_LABEL[question.difficulty] || question.difficulty}</span>
        {question.topic && <span className="qc__topic">{question.topic}</span>}
        <button type="button" className="qc__toggle" onClick={onToggleAsked}>
          {asked ? '✓ Asked' : 'Mark asked'}
        </button>
      </div>
      <div className="qc__text">{question.text}</div>
      <textarea
        className="qc__note"
        placeholder="Quick note about the answer…"
        value={question.note || ''}
        onChange={onNote}
        maxLength={500}
        rows={2}
      />
      <div className="qc__rate">
        <span>Rating:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            className={`qc__star ${n <= (question.rating || 0) ? 'qc__star--on' : ''}`}
            onClick={() => onRate(question.rating === n ? null : n)}
            aria-label={`${n} star`}
          >★</button>
        ))}
        <span className="qc__rate-val">{question.rating ? `${question.rating}/5` : '—'}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the SCSS**

Create `frontend/src/features/liveInterview/QuestionCard.scss`:

```scss
.qc {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: $radius-lg;
  padding: $space-3 $space-4;
  display: flex;
  flex-direction: column;
  gap: $space-2;
  transition: border-color 0.15s, background 0.15s;

  &--asked { background: #f0fdf4; border-color: #bbf7d0; }

  &__head { display: flex; align-items: center; gap: $space-2; flex-wrap: wrap; }
  &__diff {
    padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
    &--easy   { background: #dcfce7; color: #166534; }
    &--medium { background: #fef3c7; color: #92400e; }
    &--hard   { background: #fee2e2; color: #991b1b; }
  }
  &__topic {
    background: #f1f5f9; color: #475569;
    padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 500;
  }
  &__toggle {
    margin-left: auto;
    background: $color-primary; color: #fff; border: 0;
    padding: 6px 12px; border-radius: $radius-md;
    font-size: 12px; font-weight: 600; cursor: pointer;
    &:hover { filter: brightness(1.05); }
  }
  .qc--asked &__toggle { background: #16a34a; }

  &__text { font-size: 14px; color: #111827; line-height: 1.5; }

  &__note {
    width: 100%; resize: vertical;
    border: 1px solid #d1d5db; border-radius: $radius-md;
    padding: $space-2 $space-3; font-size: 13px; font-family: inherit;
    &:focus { outline: none; border-color: $color-primary; }
  }

  &__rate {
    display: flex; align-items: center; gap: 4px;
    font-size: 13px; color: #6b7280;
  }
  &__star {
    background: transparent; border: 0; cursor: pointer;
    font-size: 18px; color: #d1d5db;
    padding: 0 2px;
    &--on { color: #f59e0b; }
  }
  &__rate-val { margin-left: 6px; color: #111827; font-weight: 500; }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/liveInterview/QuestionCard.jsx frontend/src/features/liveInterview/QuestionCard.scss
git commit -m "feat(live-interview): QuestionCard component"
```

---

### Task 14: CoverageBar component

**Files:**
- Create: `frontend/src/features/liveInterview/CoverageBar.jsx`
- Create: `frontend/src/features/liveInterview/CoverageBar.scss`

- [ ] **Step 1: Create the component**

Create `frontend/src/features/liveInterview/CoverageBar.jsx`:

```jsx
import './CoverageBar.scss';

export default function CoverageBar({ questions = [] }) {
  const total = questions.length;
  const asked = questions.filter((q) => q.askedAt).length;
  const pct = total ? Math.round((asked / total) * 100) : 0;

  const topics = {};
  for (const q of questions) {
    if (!q.topic) continue;
    if (!topics[q.topic]) topics[q.topic] = { covered: false };
    if (q.askedAt) topics[q.topic].covered = true;
  }
  const topicEntries = Object.entries(topics);

  return (
    <div className="cov">
      <div className="cov__bar">
        <div className="cov__fill" style={{ width: `${pct}%` }} />
        <span className="cov__label">{asked} / {total} asked</span>
      </div>
      {topicEntries.length > 0 && (
        <div className="cov__topics">
          {topicEntries.map(([name, info]) => (
            <span key={name} className={`cov__chip ${info.covered ? 'cov__chip--on' : ''}`}>
              {info.covered ? '✓ ' : '○ '}{name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the SCSS**

Create `frontend/src/features/liveInterview/CoverageBar.scss`:

```scss
.cov {
  display: flex;
  flex-direction: column;
  gap: $space-2;
  margin-bottom: $space-3;

  &__bar {
    position: relative;
    height: 22px;
    background: #f1f5f9;
    border-radius: 9999px;
    overflow: hidden;
  }
  &__fill {
    height: 100%;
    background: linear-gradient(90deg, #34d399, #2563eb);
    transition: width 0.25s ease;
  }
  &__label {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600; color: #0f172a;
    mix-blend-mode: difference;
    color: #fff;
  }

  &__topics {
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  &__chip {
    background: #f1f5f9; color: #6b7280;
    padding: 3px 10px; border-radius: 9999px;
    font-size: 11px; font-weight: 500;
    &--on { background: #dcfce7; color: #166534; }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/liveInterview/CoverageBar.jsx frontend/src/features/liveInterview/CoverageBar.scss
git commit -m "feat(live-interview): CoverageBar component"
```

---

### Task 15: LiveInterviewPage — assembly + debounced save + end flow

**Files:**
- Create: `frontend/src/features/liveInterview/LiveInterviewPage.jsx`
- Create: `frontend/src/features/liveInterview/LiveInterviewPage.scss`

- [ ] **Step 1: Create the page component**

Create `frontend/src/features/liveInterview/LiveInterviewPage.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchMyInterview } from '@/features/myInterviews/myInterviewsSlice';
import {
  startLiveSession, fetchActiveLiveSession, patchLiveSession, endLiveSession,
  setQuestionField, clearSession,
} from './liveInterviewSlice';
import ContextPanel from './ContextPanel';
import QuestionCard from './QuestionCard';
import CoverageBar from './CoverageBar';
import './LiveInterviewPage.scss';

const DEBOUNCE_MS = 1200;

function Timer({ startedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const elapsedSec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  return <span className="live__timer">⏱ {mm}:{ss}</span>;
}

export default function LiveInterviewPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const { session, status, error } = useSelector((s) => s.liveInterview);
  const { detail } = useSelector((s) => s.myInterviews);

  // Buffer of pending updates to debounce-flush. Keyed by `${index}:${field}` so
  // a rapid sequence on the same field collapses to the latest value.
  const pendingRef = useRef(new Map());
  const timerRef = useRef(null);

  // On mount: load interview details (for context panel) + start/resume session.
  useEffect(() => {
    dispatch(fetchMyInterview(id));
    (async () => {
      const a = await dispatch(fetchActiveLiveSession(id));
      if (fetchActiveLiveSession.fulfilled.match(a) && !a.payload) {
        // No active session → start one (idempotent server-side).
        await dispatch(startLiveSession(id));
      }
    })();
    return () => { dispatch(clearSession()); };
  }, [id, dispatch]);

  const flushPending = async () => {
    if (!session || !pendingRef.current.size) return;
    // Aggregate by index → single update per question, latest field values win.
    const byIndex = new Map();
    for (const [key, value] of pendingRef.current) {
      const [iStr, field] = key.split(':');
      const index = Number(iStr);
      const cur = byIndex.get(index) || { index };
      cur[field] = value;
      byIndex.set(index, cur);
    }
    pendingRef.current.clear();
    const updates = Array.from(byIndex.values());
    await dispatch(patchLiveSession({ sessionId: session.id || session._id, questionUpdates: updates }));
  };

  const onFieldChange = (index, field, value) => {
    dispatch(setQuestionField({ index, field, value }));
    pendingRef.current.set(`${index}:${field}`, value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushPending, DEBOUNCE_MS);
  };

  const onEnd = async () => {
    if (!session) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    await flushPending();
    const a = await dispatch(endLiveSession(session.id || session._id));
    if (endLiveSession.fulfilled.match(a)) {
      const draft = a.payload?.draftReview || null;
      const qp = draft ? `?draft=${encodeURIComponent(JSON.stringify(draft))}` : '';
      push({ type: 'success', message: 'Interview ended. Review draft ready.' });
      navigate(`/interviewer/interviews/${id}${qp}`);
    } else {
      push({ type: 'error', message: a.payload?.message || 'Could not end the interview' });
    }
  };

  if (status === 'loading' || !session) return <Loader message="Preparing co-pilot…" />;
  if (status === 'failed') return <EmptyState title="Couldn't open the co-pilot" description={error || '—'} />;

  const interview = detail?.interview;
  const candidate = interview?.candidate;
  const jd = interview?.jobDescription;
  const priorReviews = (detail?.reviewHistory || []).filter(Boolean);

  return (
    <div className="live">
      <header className="live__topbar">
        <Link to={`/interviewer/interviews/${id}`} className="live__back">← Back</Link>
        <div className="live__id">
          <strong>{candidate?.name || 'Candidate'}</strong>
          <span>{interview?.role || jd?.title || ''}</span>
        </div>
        <Timer startedAt={session.startedAt} />
        <Button onClick={onEnd} loading={status === 'ending'}>End interview</Button>
      </header>

      <div className="live__grid">
        <ContextPanel interview={interview} candidate={candidate} jd={jd} priorReviews={priorReviews} />
        <section className="live__queue">
          <CoverageBar questions={session.questions || []} />
          {(session.questions || []).length === 0 && (
            <EmptyState
              title="No questions generated"
              description="The AI didn't return any questions. You can still capture notes by ending the interview and writing the review manually."
            />
          )}
          {(session.questions || []).map((q, i) => (
            <QuestionCard key={i} question={q} index={i} onChange={onFieldChange} />
          ))}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the SCSS**

Create `frontend/src/features/liveInterview/LiveInterviewPage.scss`:

```scss
.live {
  min-height: 100vh;
  background: #f8fafc;

  &__topbar {
    position: sticky; top: 0; z-index: 5;
    display: flex; align-items: center; gap: $space-4;
    padding: $space-3 $space-5;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #fff;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15);
  }
  &__back {
    color: #cbd5e1; text-decoration: none; font-size: 13px;
    &:hover { color: #fff; }
  }
  &__id {
    display: flex; flex-direction: column; line-height: 1.2;
    strong { font-size: 15px; }
    span { font-size: 12px; color: #94a3b8; }
  }
  &__timer {
    margin-left: auto;
    background: rgba(255,255,255,0.08);
    padding: 6px 14px; border-radius: 9999px;
    font-family: ui-monospace, monospace; font-size: 14px;
  }

  &__grid {
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(0, 6fr);
    gap: $space-5;
    padding: $space-5;
    align-items: start;

    @media (max-width: $bp-lg) {
      grid-template-columns: 1fr;
    }
  }

  &__queue {
    display: flex; flex-direction: column; gap: $space-3;
  }
}
```

- [ ] **Step 3: Smoke-build the frontend**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/liveInterview/LiveInterviewPage.jsx frontend/src/features/liveInterview/LiveInterviewPage.scss
git commit -m "feat(live-interview): LiveInterviewPage with debounced save"
```

---

### Task 16: Register the route and add "Open co-pilot" entry button

**Files:**
- Modify: `frontend/src/routes/AppRoutes.jsx`
- Modify: `frontend/src/features/myInterviews/MyInterviewDetailPage.jsx`

- [ ] **Step 1: Add the route**

Edit `frontend/src/routes/AppRoutes.jsx`. Near the other interview imports, add:

```js
import LiveInterviewPage from '@/features/liveInterview/LiveInterviewPage';
```

In the `InterviewerLayout` route block (just after `<Route path="/interviewer/interviews/:id" element={<MyInterviewDetailPage />} />`), add:

```jsx
        <Route path="/interviewer/interviews/:id/live" element={<LiveInterviewPage />} />
```

- [ ] **Step 2: Add "Open co-pilot" button to MyInterviewDetailPage**

Edit `frontend/src/features/myInterviews/MyInterviewDetailPage.jsx`.

Find the block (around line 93):

```jsx
      {interview.meetingUrl && (interview.status === 'scheduled' || interview.status === 'reschedule_requested') && (
        <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="my-interview__join">Join meeting</a>
      )}
```

Replace with:

```jsx
      <div className="my-interview__actions-row">
        {interview.meetingUrl && (interview.status === 'scheduled' || interview.status === 'reschedule_requested') && (
          <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="my-interview__join">Join meeting</a>
        )}
        {canOpenCopilot(interview) && (
          <Link to={`/interviewer/interviews/${id}/live`} className="my-interview__join my-interview__join--secondary">
            Open co-pilot
          </Link>
        )}
      </div>
```

At the top of the file, just below the existing imports, add:

```js
const COPILOT_WINDOW_MIN = 15;

function canOpenCopilot(interview) {
  if (!interview) return false;
  if (interview.status === 'cancelled' || interview.status === 'completed') return false;
  if (interview.status === 'reschedule_requested') return false;
  const scheduledAt = interview.scheduledAt ? new Date(interview.scheduledAt).getTime() : 0;
  const now = Date.now();
  return scheduledAt > 0 && (scheduledAt - now) <= COPILOT_WINDOW_MIN * 60 * 1000;
}
```

(The `Link` and `id` are already imported/destructured in the existing file — verify by reading the file's top.)

- [ ] **Step 3: Add the SCSS for the actions row**

Find `frontend/src/features/myInterviews/MyInterviewDetailPage.scss` and at the bottom add:

```scss
.my-interview__actions-row {
  display: flex;
  gap: $space-3;
  flex-wrap: wrap;
  margin: $space-3 0;
}
.my-interview__join--secondary {
  background: #fff;
  color: $color-primary;
  border: 1px solid #dbeafe;
  &:hover { background: #eff6ff; }
}
```

(If the file doesn't already declare `.my-interview__join`, leave the existing rule alone — these are additive.)

- [ ] **Step 4: Smoke-build**

Run: `cd frontend && npm run build`
Expected: build succeeds, no missing-import errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/AppRoutes.jsx frontend/src/features/myInterviews/MyInterviewDetailPage.jsx frontend/src/features/myInterviews/MyInterviewDetailPage.scss
git commit -m "feat(live-interview): route + Open co-pilot entry button"
```

---

### Task 17: Pre-fill the existing ReviewForm with the AI draft

**Files:**
- Modify: `frontend/src/features/myInterviews/MyInterviewDetailPage.jsx`
- Modify: `frontend/src/features/myInterviews/ReviewForm.jsx` (only if `initial` prop isn't already supported)

The co-pilot's End flow navigates to `/interviewer/interviews/:id?draft=<encodedJson>`. The detail page reads it, decodes it, and passes it as `initial` to `ReviewForm`.

- [ ] **Step 1: Confirm ReviewForm already supports the initial prop shape we need (no edit needed)**

`ReviewForm.jsx` already initializes from `initial?.ratings?.{knowledge,communication,confidence}` and `initial?.comments` (verified). No changes required to this file. Skip to Step 2.

- [ ] **Step 2: Decode `?draft=` in MyInterviewDetailPage and pass as initial**

Edit `frontend/src/features/myInterviews/MyInterviewDetailPage.jsx`. At the top, add:

```js
import { useSearchParams } from 'react-router-dom';
```

(Skip if `useSearchParams` is already imported.)

Inside the component body, after the existing `useParams`/`useState` hooks, add:

```js
  const [searchParams, setSearchParams] = useSearchParams();
  const aiDraft = useMemo(() => {
    const raw = searchParams.get('draft');
    if (!raw) return null;
    try {
      const d = JSON.parse(decodeURIComponent(raw));
      return {
        ratings: {
          knowledge:     d.knowledge     || 0,
          communication: d.communication || 0,
          confidence:    d.confidence    || 0,
        },
        comments: d.comments || '',
      };
    } catch { return null; }
  }, [searchParams]);
```

Add the import for `useMemo` (at the top, alongside `useEffect`/`useState`):

```js
import { useEffect, useMemo, useState } from 'react';
```

Find the block that renders the `<ReviewForm>` for the "can submit review" path (around line 116):

```jsx
            <ReviewForm
              onSubmit={onSubmit}
              busy={busy}
              submitLabel={isCompleted ? 'Submit review' : 'Submit review & mark complete'}
            />
```

Change to:

```jsx
            <ReviewForm
              initial={aiDraft || undefined}
              onSubmit={async (payload) => {
                await onSubmit(payload);
                setSearchParams({}, { replace: true });
              }}
              busy={busy}
              submitLabel={aiDraft
                ? 'Submit AI-drafted review'
                : (isCompleted ? 'Submit review' : 'Submit review & mark complete')}
            />
```

If `aiDraft` is present and the review was already submitted before, the existing branch that renders the read-only review still applies; only the "canSubmitReview" branch consumes the draft. That is intentional.

- [ ] **Step 3: Optional banner when a draft is available**

Just above the `<ReviewForm initial={aiDraft || undefined}` block, add:

```jsx
            {aiDraft && (
              <div className="my-interview__draft-banner">
                AI has drafted a review from your co-pilot notes. Review and submit when ready.
              </div>
            )}
```

And to `MyInterviewDetailPage.scss`:

```scss
.my-interview__draft-banner {
  background: #eff6ff;
  border: 1px solid #dbeafe;
  color: #1e40af;
  padding: $space-3 $space-4;
  border-radius: $radius-md;
  font-size: 13px;
  margin-bottom: $space-3;
}
```

- [ ] **Step 4: Smoke-build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/myInterviews/MyInterviewDetailPage.jsx frontend/src/features/myInterviews/MyInterviewDetailPage.scss
git commit -m "feat(live-interview): pre-fill ReviewForm with AI draft on return"
```

---

### Task 18: Full-suite verify + manual smoke test

- [ ] **Step 1: Run full backend tests**

Run: `cd backend && npm test`
Expected: all green. Tests: 159 passed (146 existing + 13 new).

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: build succeeds, no missing imports.

- [ ] **Step 3: Manual end-to-end smoke (recorded as a test plan, NOT automated)**

Pre-reqs: backend running on `:5000`, frontend on `:5173`, Mongo up, valid Gemini key. An interview record assigned to a logged-in interviewer with a candidate that has a resume + screening + a JD.

Steps to perform manually:

1. Log in as an interviewer whose interview is scheduled within 15 min OR currently in the past 24 h.
2. Open `/interviewer/interviews/<id>`. Confirm: "Open co-pilot" button appears next to "Join meeting".
3. Click "Open co-pilot". URL becomes `/interviewer/interviews/<id>/live`.
4. Confirm: page renders top bar with candidate name + running timer, left context panel with JD / candidate / screening cards, right queue with ~12 questions tiered easy/medium/hard.
5. Click "Mark asked" on 3 questions. Confirm coverage bar increments to 3/12 and topic chips light up.
6. Type a note on one of the asked questions. Wait ~2 sec. Reload the page. Confirm the note is still there (debounced save persisted).
7. Set a rating on another asked question. Reload. Confirm persisted.
8. Click "End interview". A loading state shows, then redirect to `/interviewer/interviews/<id>?draft=...`.
9. Confirm a blue banner says "AI has drafted a review…" and the ReviewForm is pre-filled with ratings + comments.
10. Edit a field. Click "Submit AI-drafted review". Confirm: success toast, review now appears as submitted, interview marked completed.

Note any deviations from expected behavior as a follow-up commit.

- [ ] **Step 4: Final commit (no-op or test fixtures only — do NOT amend)**

If steps 1-3 passed and step 4 manual smoke surfaced no bugs, the feature is done. If step 4 surfaced bugs, create new commits per fix (do NOT amend earlier ones).

```bash
git log --oneline | head -20
```

Confirm the commit history matches the task structure (one commit per task).

---

## Out of scope (do NOT implement here)

These are deferred to future slices per the spec. If a task tempts you toward any of these, stop and confirm with the user first:

- Sockets for HR live observation
- Live transcription / Whisper integration
- WebRTC / in-app video
- Adaptive question streaming (regen as topics close)
- Cheat detection / screen share / tab-switch
- Multi-interviewer panel sessions
- Topic auto-detection from notes
- Audit UI for admin

## Self-review notes (engineer should skim before starting)

- **Idempotency:** `start` is idempotent — opening the page twice does NOT create two sessions or burn two AI calls.
- **Ownership:** session endpoints rely on the `interviewer` field on `LiveSession`, set at create. Service code (Task 6) verifies before any mutation.
- **AI failure paths:** every AI call has a fallback. Question generation failure → empty `questions[]` and a retry-able state. Draft review failure → notes concatenated into `comments`. Page never hard-errors on AI being down.
- **Optimistic UI:** the slice mutates local state immediately on field change so typing feels instant; the debounced PATCH reconciles with the server.
- **No new interview statuses:** `LiveSession.endedAt` is the live signal. Interview transitions to `completed` only when the review is submitted, exactly as today.
