# Phase 4 — JD-based Resume Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a JD-driven, AI-assisted resume-screening step between candidate creation and the Round 1 test. HR maintains a reusable JD library; the system scores uploaded resumes against the matching JD, surfaces structured strengths/gaps, and gates the test link behind an explicit HR Approve/Decline decision with corresponding candidate emails.

**Architecture:** Extend the existing layered backend (models → repositories → services → controllers → routes) with a new `JobDescription` entity, a `resumeScreeningService` that wraps the existing `aiService.askWithFallback` chain, and three new candidate lifecycle states (`resume_pending`, `resume_approved`, `resume_declined`) inserted before the existing `pending` test-link state. Frontend gets a new JDs admin page and a Screening panel on the candidate detail page.

**Tech Stack:** Node.js, Express, Mongoose, Joi, Jest. React + Redux Toolkit, Vite, SCSS. Adds `pdf-parse` and `mammoth` for resume text extraction.

**Spec reference:** [`docs/superpowers/specs/2026-05-12-phase-4-resume-screening-design.md`](../specs/2026-05-12-phase-4-resume-screening-design.md)

---

## Important deviation from spec

The spec described screening firing inline during candidate creation. The existing API uploads resumes via a separate endpoint (`POST /candidates/:id/resume`), so the implementation triggers screening at **first resume upload** rather than at candidate creation. The user-facing UX is unchanged: HR sees the screening result as soon as the resume is processed. The Re-screen button covers re-runs. Candidate creation no longer auto-fires the test invite email — that fires via the new explicit "Send test" action after Approve.

---

## File Structure

### Backend — new files
- `backend/src/models/JobDescription.js` — Mongoose model
- `backend/src/repositories/jobDescriptionRepository.js` — CRUD wrapper
- `backend/src/services/jobDescriptionService.js` — list/detail/create/update/deactivate/lookup
- `backend/src/services/resumeScreeningService.js` — PDF text extract + AI scoring + result shaping
- `backend/src/controllers/jobDescriptionController.js`
- `backend/src/routes/jobDescriptionRoutes.js`
- `backend/src/validators/jobDescriptionValidator.js`
- `backend/src/templates/resumeShortlistedEmail.js` — Approve email
- `backend/src/templates/resumeDeclinedEmail.js` — Decline email
- `backend/tests/unit/jobDescriptionService.test.js`
- `backend/tests/unit/resumeScreeningService.test.js`
- `backend/tests/unit/candidateScreeningActions.test.js` — approve/decline/sendTest/rescreen

### Backend — modified files
- `backend/src/utils/constants.js` — add `RESUME_PENDING`, `RESUME_APPROVED`, `RESUME_DECLINED`
- `backend/src/models/Candidate.js` — add `screening` sub-doc; default `status` becomes `RESUME_PENDING`
- `backend/src/services/candidateService.js` — disable auto-invite on create, add new actions, hook screening into resume upload
- `backend/src/services/emailService.js` — register `sendResumeShortlisted`, `sendResumeDeclined`
- `backend/src/controllers/candidateController.js` — handlers for new actions
- `backend/src/routes/candidateRoutes.js` — wire new endpoints
- `backend/src/validators/candidateValidator.js` — schemas for new endpoints, statuses
- `backend/src/routes/index.js` — mount `/job-descriptions`
- `backend/package.json` — add `pdf-parse`, `mammoth`

### Frontend — new files
- `frontend/src/api/jobDescriptionApi.js`
- `frontend/src/features/jobDescriptions/jobDescriptionsSlice.js`
- `frontend/src/features/jobDescriptions/JobDescriptionListPage.jsx`
- `frontend/src/features/jobDescriptions/JobDescriptionFormModal.jsx`
- `frontend/src/features/jobDescriptions/JobDescriptionListPage.scss`
- `frontend/src/features/candidates/ScreeningPanel.jsx`
- `frontend/src/features/candidates/ScreeningPanel.scss`

### Frontend — modified files
- `frontend/src/app/store.js` — register slice
- `frontend/src/main.jsx` (or router config) — register `/job-descriptions` route
- `frontend/src/layouts/AdminLayout.jsx` — add "Job Descriptions" nav entry
- `frontend/src/api/candidateApi.js` — `approveResume`, `declineResume`, `rescreen`, `sendTest`
- `frontend/src/features/candidates/CandidateDetailPage.jsx` — show `ScreeningPanel` + new buttons
- `frontend/src/features/candidates/CandidateListPage.jsx` — Match% column, new status filters

---

# Phase A — JD library (backend)

## Task A1: Add `JobDescription` model

**Files:**
- Create: `backend/src/models/JobDescription.js`

- [ ] **Step 1: Create the model file**

```js
'use strict';

const mongoose = require('mongoose');

const jobDescriptionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    techStack: { type: String, required: true, lowercase: true, trim: true, index: true },
    experience: {
      type: String,
      enum: ['entry', 'mid', 'senior'],
      required: true,
      index: true,
    },
    jobRole: { type: String, required: true, maxlength: 2000 },
    responsibilities: { type: String, required: true, maxlength: 5000 },
    qualifications: { type: String, required: true, maxlength: 5000 },
    niceToHave: { type: String, default: '', maxlength: 3000 },
    minYears: { type: Number, min: 0, max: 50, default: null },
    maxYears: { type: Number, min: 0, max: 50, default: null },
    location: { type: String, default: '', maxlength: 200 },
    isActive: { type: Boolean, default: true, index: true },
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

// Partial unique: only one ACTIVE JD per (techStack, experience).
jobDescriptionSchema.index(
  { techStack: 1, experience: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

module.exports = mongoose.model('JobDescription', jobDescriptionSchema);
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/models/JobDescription.js
git commit -m "feat: add JobDescription model"
```

---

## Task A2: Add `jobDescriptionRepository`

**Files:**
- Create: `backend/src/repositories/jobDescriptionRepository.js`

- [ ] **Step 1: Create the repository file**

```js
'use strict';

const JobDescription = require('../models/JobDescription');

const create = (data) => JobDescription.create(data);

const findById = (id) => JobDescription.findById(id);

const findActiveByCombo = (techStack, experience) =>
  JobDescription.findOne({
    techStack: String(techStack || '').toLowerCase().trim(),
    experience,
    isActive: true,
  });

const updateById = (id, update) =>
  JobDescription.findByIdAndUpdate(id, update, { new: true });

const list = async ({ page = 1, limit = 20, search, experience, isActive } = {}) => {
  const filter = {};
  if (isActive !== undefined && isActive !== null) filter.isActive = isActive;
  if (experience) filter.experience = experience;
  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { techStack: rx }];
  }
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    JobDescription.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    JobDescription.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

module.exports = { create, findById, findActiveByCombo, updateById, list };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/jobDescriptionRepository.js
git commit -m "feat: add jobDescriptionRepository"
```

---

## Task A3: Add Joi validators for JD endpoints

**Files:**
- Create: `backend/src/validators/jobDescriptionValidator.js`

- [ ] **Step 1: Create the validator file**

```js
'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const baseFields = {
  title: Joi.string().min(2).max(200).required(),
  techStack: Joi.string().lowercase().min(1).max(60).required(),
  experience: Joi.string().valid('entry', 'mid', 'senior').required(),
  jobRole: Joi.string().min(10).max(2000).required(),
  responsibilities: Joi.string().min(10).max(5000).required(),
  qualifications: Joi.string().min(10).max(5000).required(),
  niceToHave: Joi.string().allow('').max(3000).optional(),
  minYears: Joi.number().integer().min(0).max(50).allow(null).optional(),
  maxYears: Joi.number().integer().min(0).max(50).allow(null).optional(),
  location: Joi.string().allow('').max(200).optional(),
};

const createJdSchema = { body: Joi.object(baseFields) };

const updateJdSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    ...baseFields,
    title: baseFields.title.optional(),
    techStack: baseFields.techStack.optional(),
    experience: baseFields.experience.optional(),
    jobRole: baseFields.jobRole.optional(),
    responsibilities: baseFields.responsibilities.optional(),
    qualifications: baseFields.qualifications.optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),
};

const idParamSchema = { params: Joi.object({ id: objectId.required() }) };

const listJdsSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().trim().max(120).empty('').optional(),
    experience: Joi.string().valid('entry', 'mid', 'senior').empty('').optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const lookupJdSchema = {
  query: Joi.object({
    techStack: Joi.string().lowercase().min(1).max(60).required(),
    experience: Joi.string().valid('entry', 'mid', 'senior').required(),
  }),
};

module.exports = {
  createJdSchema,
  updateJdSchema,
  idParamSchema,
  listJdsSchema,
  lookupJdSchema,
};
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/validators/jobDescriptionValidator.js
git commit -m "feat: add JD validators"
```

---

## Task A4: Add `jobDescriptionService` with tests

**Files:**
- Create: `backend/src/services/jobDescriptionService.js`
- Create: `backend/tests/unit/jobDescriptionService.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/unit/jobDescriptionService.test.js
'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/jobDescriptionRepository');

const jdService = require('../../src/services/jobDescriptionService');
const jdRepo = require('../../src/repositories/jobDescriptionRepository');

describe('jobDescriptionService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects 409 when active JD already exists for combo', async () => {
    jdRepo.findActiveByCombo.mockResolvedValue({ _id: 'jd1' });
    await expect(jdService.create({
      title: 'React Sr', techStack: 'react', experience: 'senior',
      jobRole: 'role', responsibilities: 'resp', qualifications: 'quals',
    }, 'admin1')).rejects.toMatchObject({ statusCode: 409 });
  });

  test('creates JD when no active duplicate exists', async () => {
    jdRepo.findActiveByCombo.mockResolvedValue(null);
    const created = { id: 'jd1', title: 'React Sr', techStack: 'react' };
    jdRepo.create.mockResolvedValue(created);
    const result = await jdService.create({
      title: 'React Sr', techStack: 'react', experience: 'senior',
      jobRole: 'role', responsibilities: 'resp', qualifications: 'quals',
    }, 'admin1');
    expect(jdRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'React Sr', techStack: 'react', experience: 'senior', createdBy: 'admin1',
    }));
    expect(result.id).toBe('jd1');
  });
});

describe('jobDescriptionService.deactivate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('soft-deletes by setting isActive=false', async () => {
    jdRepo.findById.mockResolvedValue({ id: 'jd1', isActive: true });
    jdRepo.updateById.mockResolvedValue({ id: 'jd1', isActive: false });
    await jdService.deactivate('jd1');
    expect(jdRepo.updateById).toHaveBeenCalledWith('jd1', { isActive: false });
  });

  test('404 when JD not found', async () => {
    jdRepo.findById.mockResolvedValue(null);
    await expect(jdService.deactivate('jd1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('jobDescriptionService.lookup', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns matching active JD', async () => {
    jdRepo.findActiveByCombo.mockResolvedValue({ id: 'jd1', techStack: 'react' });
    const result = await jdService.lookup('react', 'senior');
    expect(result.id).toBe('jd1');
  });

  test('returns null when no active JD matches', async () => {
    jdRepo.findActiveByCombo.mockResolvedValue(null);
    const result = await jdService.lookup('rust', 'senior');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/jobDescriptionService.test.js`
Expected: FAIL with "Cannot find module '../../src/services/jobDescriptionService'"

- [ ] **Step 3: Create the service**

```js
// backend/src/services/jobDescriptionService.js
'use strict';

const jdRepo = require('../repositories/jobDescriptionRepository');
const ApiError = require('../utils/ApiError');

const present = (doc) => ({
  id: doc.id,
  title: doc.title,
  techStack: doc.techStack,
  experience: doc.experience,
  jobRole: doc.jobRole,
  responsibilities: doc.responsibilities,
  qualifications: doc.qualifications,
  niceToHave: doc.niceToHave || '',
  minYears: doc.minYears ?? null,
  maxYears: doc.maxYears ?? null,
  location: doc.location || '',
  isActive: doc.isActive,
  createdBy: doc.createdBy,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const create = async (payload, adminId) => {
  const techStack = String(payload.techStack || '').toLowerCase().trim();
  const existing = await jdRepo.findActiveByCombo(techStack, payload.experience);
  if (existing) {
    throw ApiError.conflict(
      `An active JD already exists for ${techStack} / ${payload.experience}. Deactivate it first.`,
      { code: 'E_JD_DUPLICATE' },
    );
  }
  const doc = await jdRepo.create({ ...payload, techStack, createdBy: adminId });
  return present(doc);
};

const update = async (id, updates) => {
  const doc = await jdRepo.findById(id);
  if (!doc) throw ApiError.notFound('JD not found');

  // If techStack/experience would change and isActive remains true, check uniqueness.
  const nextStack = updates.techStack
    ? String(updates.techStack).toLowerCase().trim()
    : doc.techStack;
  const nextExp = updates.experience || doc.experience;
  const nextActive = updates.isActive !== undefined ? updates.isActive : doc.isActive;
  if (nextActive && (nextStack !== doc.techStack || nextExp !== doc.experience)) {
    const conflict = await jdRepo.findActiveByCombo(nextStack, nextExp);
    if (conflict && String(conflict._id) !== String(doc._id)) {
      throw ApiError.conflict(
        `Another active JD already exists for ${nextStack} / ${nextExp}`,
        { code: 'E_JD_DUPLICATE' },
      );
    }
  }
  if (updates.techStack) updates.techStack = nextStack;
  const updated = await jdRepo.updateById(id, updates);
  return present(updated);
};

const detail = async (id) => {
  const doc = await jdRepo.findById(id);
  if (!doc) throw ApiError.notFound('JD not found');
  return present(doc);
};

const list = async (query) => {
  const result = await jdRepo.list(query);
  return { ...result, items: result.items.map(present) };
};

const deactivate = async (id) => {
  const doc = await jdRepo.findById(id);
  if (!doc) throw ApiError.notFound('JD not found');
  const updated = await jdRepo.updateById(id, { isActive: false });
  return present(updated);
};

const lookup = async (techStack, experience) => {
  const doc = await jdRepo.findActiveByCombo(techStack, experience);
  return doc ? present(doc) : null;
};

module.exports = { create, update, detail, list, deactivate, lookup, present };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/jobDescriptionService.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/jobDescriptionService.js backend/tests/unit/jobDescriptionService.test.js
git commit -m "feat: add jobDescriptionService with tests"
```

---

## Task A5: Add JD controller

**Files:**
- Create: `backend/src/controllers/jobDescriptionController.js`

- [ ] **Step 1: Create the controller**

```js
'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const jdService = require('../services/jobDescriptionService');

exports.createJd = asyncHandler(async (req, res) => {
  const jd = await jdService.create(req.body, req.admin.id);
  return ApiResponse.created(res, jd, 'JD created');
});

exports.listJds = asyncHandler(async (req, res) => {
  const result = await jdService.list(req.query);
  return ApiResponse.ok(res, result);
});

exports.getJd = asyncHandler(async (req, res) => {
  const jd = await jdService.detail(req.params.id);
  return ApiResponse.ok(res, jd);
});

exports.updateJd = asyncHandler(async (req, res) => {
  const jd = await jdService.update(req.params.id, req.body);
  return ApiResponse.ok(res, jd, 'JD updated');
});

exports.deactivateJd = asyncHandler(async (req, res) => {
  const jd = await jdService.deactivate(req.params.id);
  return ApiResponse.ok(res, jd, 'JD deactivated');
});

exports.lookupJd = asyncHandler(async (req, res) => {
  const { techStack, experience } = req.query;
  const jd = await jdService.lookup(techStack, experience);
  return ApiResponse.ok(res, jd);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/controllers/jobDescriptionController.js
git commit -m "feat: add JD controller"
```

---

## Task A6: Wire JD routes

**Files:**
- Create: `backend/src/routes/jobDescriptionRoutes.js`
- Modify: `backend/src/routes/index.js`

- [ ] **Step 1: Create the routes file**

```js
// backend/src/routes/jobDescriptionRoutes.js
'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const jdController = require('../controllers/jobDescriptionController');
const {
  createJdSchema, updateJdSchema, idParamSchema, listJdsSchema, lookupJdSchema,
} = require('../validators/jobDescriptionValidator');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.post('/', validate(createJdSchema), jdController.createJd);
router.get('/', validate(listJdsSchema), jdController.listJds);
router.get('/lookup', validate(lookupJdSchema), jdController.lookupJd);
router.get('/:id', validate(idParamSchema), jdController.getJd);
router.patch('/:id', validate(updateJdSchema), jdController.updateJd);
router.delete('/:id', validate(idParamSchema), jdController.deactivateJd);

module.exports = router;
```

- [ ] **Step 2: Mount routes**

In `backend/src/routes/index.js`, add the import alongside the others:

```js
const jobDescriptionRoutes = require('./jobDescriptionRoutes');
```

and the mount alongside the others:

```js
router.use('/job-descriptions', jobDescriptionRoutes);
```

- [ ] **Step 3: Smoke-check the route boots**

Run: `cd backend && node -e "require('./src/routes')" && echo OK`
Expected: prints `OK`. Confirms no require-time errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/jobDescriptionRoutes.js backend/src/routes/index.js
git commit -m "feat: mount /job-descriptions routes"
```

---

# Phase B — Resume screening service

## Task B1: Install PDF/DOCX parsing libraries

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd backend && npm install pdf-parse@1.1.1 mammoth@1.8.0
```

- [ ] **Step 2: Verify installation**

Run: `cd backend && node -e "require('pdf-parse'); require('mammoth'); console.log('OK')"`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add pdf-parse and mammoth for resume text extraction"
```

---

## Task B2: Add new candidate statuses to constants

**Files:**
- Modify: `backend/src/utils/constants.js:25-37`

- [ ] **Step 1: Edit the CANDIDATE_STATUS object**

Replace the existing `CANDIDATE_STATUS` block with:

```js
const CANDIDATE_STATUS = Object.freeze({
  RESUME_PENDING: 'resume_pending',
  RESUME_APPROVED: 'resume_approved',
  RESUME_DECLINED: 'resume_declined',
  PENDING: 'pending',
  PHOTO_CAPTURED: 'photo_captured',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  CHEATED: 'cheated',
  SHORTLISTED: 'shortlisted',
  REJECTED: 'rejected',
  AWAITING_DECISION: 'awaiting_decision',
  SELECTED_FOR_CULTURE: 'selected_for_culture',
  FINAL_REJECTED: 'final_rejected',
});
```

- [ ] **Step 2: Run existing tests to confirm nothing breaks**

Run: `cd backend && npm test --silent`
Expected: All existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/constants.js
git commit -m "feat: add resume_pending/approved/declined to candidate status enum"
```

---

## Task B3: Add `screening` sub-doc to Candidate model

**Files:**
- Modify: `backend/src/models/Candidate.js:34-39, 49`

- [ ] **Step 1: Edit the model**

In `backend/src/models/Candidate.js`, change the `status` default and add the `screening` sub-doc.

Replace the `status` block:

```js
    status: {
      type: String,
      enum: CANDIDATE_STATUS_LIST,
      default: CANDIDATE_STATUS.RESUME_PENDING,
      index: true,
    },
```

Add this new field just before `createdBy`:

```js
    screening: {
      status: {
        type: String,
        enum: ['scored', 'skipped', 'failed'],
        default: undefined,
      },
      matchPercent: { type: Number, min: 0, max: 100 },
      greenFlags: { type: [String], default: undefined },
      redFlags: { type: [String], default: undefined },
      summary: { type: String, maxlength: 500 },
      jdId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobDescription' },
      jdSnapshot: {
        title: String,
        jobRole: String,
        responsibilities: String,
        qualifications: String,
        niceToHave: String,
        minYears: Number,
        maxYears: Number,
      },
      resumeText: { type: String, maxlength: 20000 },
      scoredAt: Date,
      scoredBy: String,
    },
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/models/Candidate.js
git commit -m "feat: add screening sub-doc and default status to Candidate"
```

---

## Task B4: Add `resumeScreeningService` with tests

**Files:**
- Create: `backend/src/services/resumeScreeningService.js`
- Create: `backend/tests/unit/resumeScreeningService.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/unit/resumeScreeningService.test.js
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
jest.mock('pdf-parse', () => jest.fn());

const aiService = require('../../src/services/aiService');
const pdfParse = require('pdf-parse');
const screeningService = require('../../src/services/resumeScreeningService');

const jd = {
  id: 'jd1',
  title: 'DevOps Sr',
  techStack: 'devops',
  experience: 'senior',
  jobRole: 'We are seeking a devops...',
  responsibilities: '- IaC with Terraform',
  qualifications: '- 5+ years',
  niceToHave: '- CKA',
  minYears: 5,
  maxYears: 10,
};

describe('resumeScreeningService.score', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns scored result when AI returns valid JSON', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: '{"matchPercent":78,"greenFlags":["5 years AWS"],"redFlags":["No K8s"],"summary":"Strong base."}',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    aiService.extractJson.mockReturnValue({
      matchPercent: 78,
      greenFlags: ['5 years AWS'],
      redFlags: ['No K8s'],
      summary: 'Strong base.',
    });
    const result = await screeningService.score({ resumeText: 'resume text here', jd });
    expect(result.status).toBe('scored');
    expect(result.matchPercent).toBe(78);
    expect(result.greenFlags).toEqual(['5 years AWS']);
    expect(result.redFlags).toEqual(['No K8s']);
    expect(result.summary).toBe('Strong base.');
    expect(result.scoredBy).toBe('gemini-2.5-flash');
    expect(result.jdSnapshot.title).toBe('DevOps Sr');
  });

  test('returns failed status when AI returns null text', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null, errors: [{ provider: 'gemini', message: 'rate-limited' }] });
    const result = await screeningService.score({ resumeText: 'resume', jd });
    expect(result.status).toBe('failed');
    expect(result.matchPercent).toBeUndefined();
  });

  test('returns failed status when JSON parse returns null', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'not json', provider: 'groq', model: 'llama-3.3-70b-versatile' });
    aiService.extractJson.mockReturnValue(null);
    const result = await screeningService.score({ resumeText: 'resume', jd });
    expect(result.status).toBe('failed');
  });

  test('clamps matchPercent to 0-100 range', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'x', provider: 'gemini', model: 'gemini-2.5-flash' });
    aiService.extractJson.mockReturnValue({
      matchPercent: 150,
      greenFlags: [],
      redFlags: [],
      summary: 's',
    });
    const result = await screeningService.score({ resumeText: 'r', jd });
    expect(result.matchPercent).toBe(100);
  });

  test('truncates flag arrays to at most 6 entries', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'x', provider: 'gemini', model: 'gemini-2.5-flash' });
    aiService.extractJson.mockReturnValue({
      matchPercent: 50,
      greenFlags: ['a','b','c','d','e','f','g','h'],
      redFlags: ['1','2','3','4','5','6','7','8'],
      summary: 's',
    });
    const result = await screeningService.score({ resumeText: 'r', jd });
    expect(result.greenFlags).toHaveLength(6);
    expect(result.redFlags).toHaveLength(6);
  });
});

describe('resumeScreeningService.extractResumeText', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns text from PDF buffer', async () => {
    pdfParse.mockResolvedValue({ text: 'extracted resume content' });
    const text = await screeningService.extractResumeText(Buffer.from('fake pdf'), 'application/pdf');
    expect(text).toBe('extracted resume content');
  });

  test('returns empty string when buffer is empty', async () => {
    const text = await screeningService.extractResumeText(null, 'application/pdf');
    expect(text).toBe('');
  });

  test('truncates extracted text to 20000 chars', async () => {
    pdfParse.mockResolvedValue({ text: 'a'.repeat(25000) });
    const text = await screeningService.extractResumeText(Buffer.from('x'), 'application/pdf');
    expect(text.length).toBe(20000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/resumeScreeningService.test.js`
Expected: FAIL with "Cannot find module '../../src/services/resumeScreeningService'"

- [ ] **Step 3: Create the service**

```js
// backend/src/services/resumeScreeningService.js
'use strict';

const aiService = require('./aiService');
const logger = require('../config/logger');

const MAX_RESUME_CHARS = 20000;
const MAX_FLAGS = 6;
const MAX_SUMMARY = 500;

const extractResumeText = async (buffer, mimeType) => {
  if (!buffer || !buffer.length) return '';
  try {
    if (mimeType === 'application/pdf' || mimeType?.includes('pdf')) {
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(buffer);
      const text = (parsed?.text || '').replace(/\s+/g, ' ').trim();
      return text.slice(0, MAX_RESUME_CHARS);
    }
    if (
      mimeType?.includes('officedocument.wordprocessingml.document') ||
      mimeType?.includes('msword') ||
      mimeType?.includes('docx')
    ) {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      const text = (value || '').replace(/\s+/g, ' ').trim();
      return text.slice(0, MAX_RESUME_CHARS);
    }
    return '';
  } catch (err) {
    logger.warn('Resume text extraction failed', { mimeType, err: err.message });
    return '';
  }
};

const buildPrompt = ({ resumeText, jd }) => `You are a senior technical recruiter. Score how well the candidate's resume matches the job description. Be strict but fair.

JOB DESCRIPTION:
Title: ${jd.title} · ${jd.techStack} · ${jd.experience} · ${jd.minYears ?? '?'}-${jd.maxYears ?? '?'} years

Job Role:
${jd.jobRole}

Role + Responsibilities:
${jd.responsibilities}

Person Specification and Qualifications:
${jd.qualifications}

Plus Points (Nice-to-Have):
${jd.niceToHave || '(none)'}

CANDIDATE RESUME:
${resumeText}

Respond with ONLY valid JSON in this exact shape:
{
  "matchPercent": <0-100 integer>,
  "greenFlags": [<at most ${MAX_FLAGS} short phrases>],
  "redFlags":  [<at most ${MAX_FLAGS} short phrases>],
  "summary":   "<1-2 sentence overall assessment>"
}`;

const snapshotJd = (jd) => ({
  title: jd.title,
  jobRole: jd.jobRole,
  responsibilities: jd.responsibilities,
  qualifications: jd.qualifications,
  niceToHave: jd.niceToHave || '',
  minYears: jd.minYears ?? null,
  maxYears: jd.maxYears ?? null,
});

const score = async ({ resumeText, jd }) => {
  if (!resumeText || !resumeText.trim()) {
    return { status: 'failed', jdId: jd.id, jdSnapshot: snapshotJd(jd), resumeText: '', scoredAt: new Date() };
  }
  const prompt = buildPrompt({ resumeText, jd });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    return {
      status: 'failed',
      jdId: jd.id,
      jdSnapshot: snapshotJd(jd),
      resumeText,
      scoredAt: new Date(),
    };
  }
  const parsed = aiService.extractJson(text);
  if (!parsed || typeof parsed.matchPercent !== 'number') {
    return {
      status: 'failed',
      jdId: jd.id,
      jdSnapshot: snapshotJd(jd),
      resumeText,
      scoredAt: new Date(),
    };
  }
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const truncList = (arr) =>
    Array.isArray(arr) ? arr.slice(0, MAX_FLAGS).map((s) => String(s).slice(0, 200)) : [];
  return {
    status: 'scored',
    matchPercent: clamp(parsed.matchPercent),
    greenFlags: truncList(parsed.greenFlags),
    redFlags: truncList(parsed.redFlags),
    summary: String(parsed.summary || '').slice(0, MAX_SUMMARY),
    jdId: jd.id,
    jdSnapshot: snapshotJd(jd),
    resumeText,
    scoredAt: new Date(),
    scoredBy: `${provider}-${model}`,
  };
};

module.exports = { score, extractResumeText, buildPrompt };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/resumeScreeningService.test.js`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/resumeScreeningService.js backend/tests/unit/resumeScreeningService.test.js
git commit -m "feat: add resumeScreeningService with PDF/DOCX extract and AI scoring"
```

---

# Phase C — Candidate flow integration (backend)

## Task C1: Add email templates and register in emailService

**Files:**
- Create: `backend/src/templates/resumeShortlistedEmail.js`
- Create: `backend/src/templates/resumeDeclinedEmail.js`
- Modify: `backend/src/services/emailService.js` (add 2 functions + 2 imports)

- [ ] **Step 1: Create the shortlist template**

```js
// backend/src/templates/resumeShortlistedEmail.js
'use strict';

const buildResumeShortlistedHtml = ({ candidate }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#0f766e">Your application has been shortlisted</h2>
  <p>Hi ${candidate.name},</p>
  <p>Your resume has been reviewed and <strong>shortlisted</strong> for the
     <strong>${(candidate.techStack || []).join(', ')}</strong> ${candidate.experience || ''} role.</p>
  <p>Your assessment test link will arrive in a separate email shortly — please watch your inbox.</p>
  <p>Best regards,<br/>The Hiring Team</p>
</body></html>`;

const buildResumeShortlistedText = ({ candidate }) =>
  `Hi ${candidate.name},

Your resume has been reviewed and shortlisted for the ${(candidate.techStack || []).join(', ')} ${candidate.experience || ''} role.

Your assessment test link will arrive in a separate email shortly — please watch your inbox.

Best regards,
The Hiring Team`;

module.exports = { buildResumeShortlistedHtml, buildResumeShortlistedText };
```

- [ ] **Step 2: Create the decline template**

```js
// backend/src/templates/resumeDeclinedEmail.js
'use strict';

const buildResumeDeclinedHtml = ({ candidate }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2>Update on your application</h2>
  <p>Hi ${candidate.name},</p>
  <p>Thank you for your interest in the <strong>${(candidate.techStack || []).join(', ')}</strong> ${candidate.experience || ''} role.</p>
  <p>After reviewing your resume, we have decided not to move forward at this time. We appreciate the time you took to apply and wish you the very best in your job search.</p>
  <p>Warm regards,<br/>The Hiring Team</p>
</body></html>`;

const buildResumeDeclinedText = ({ candidate }) =>
  `Hi ${candidate.name},

Thank you for your interest in the ${(candidate.techStack || []).join(', ')} ${candidate.experience || ''} role.

After reviewing your resume, we have decided not to move forward at this time. We appreciate the time you took to apply and wish you the very best in your job search.

Warm regards,
The Hiring Team`;

module.exports = { buildResumeDeclinedHtml, buildResumeDeclinedText };
```

- [ ] **Step 3: Register both functions in emailService**

In `backend/src/services/emailService.js`, near the other template imports near the top of the file, add:

```js
const { buildResumeShortlistedHtml, buildResumeShortlistedText } = require('../templates/resumeShortlistedEmail');
const { buildResumeDeclinedHtml, buildResumeDeclinedText } = require('../templates/resumeDeclinedEmail');
```

Then add two new send functions (place near existing candidate-facing senders, e.g. after `sendCandidateInvite`):

```js
const sendResumeShortlisted = async ({ candidate }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const subject = 'Your application has been shortlisted';
  const html = buildResumeShortlistedHtml({ candidate });
  const text = buildResumeShortlistedText({ candidate });
  const info = await transporter.sendMail({
    from: env.smtp.from,
    to: candidate.email,
    subject, text, html,
  });
  logger.info('Resume shortlisted email sent', { messageId: info.messageId, candidate: candidate.id });
  return info;
};

const sendResumeDeclined = async ({ candidate }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const subject = 'Update on your application';
  const html = buildResumeDeclinedHtml({ candidate });
  const text = buildResumeDeclinedText({ candidate });
  const info = await transporter.sendMail({
    from: env.smtp.from,
    to: candidate.email,
    subject, text, html,
  });
  logger.info('Resume declined email sent', { messageId: info.messageId, candidate: candidate.id });
  return info;
};
```

Then export them. At the bottom of the file, in the `module.exports` block, add `sendResumeShortlisted` and `sendResumeDeclined` to the exported names alongside the existing senders.

- [ ] **Step 4: Smoke-check the module loads**

Run: `cd backend && node -e "const e=require('./src/services/emailService'); console.log(typeof e.sendResumeShortlisted, typeof e.sendResumeDeclined)"`
Expected: prints `function function`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/templates/resumeShortlistedEmail.js backend/src/templates/resumeDeclinedEmail.js backend/src/services/emailService.js
git commit -m "feat: add resume shortlist + decline email templates"
```

---

## Task C2: Disable auto-invite on create + default status to RESUME_PENDING

**Files:**
- Modify: `backend/src/services/candidateService.js:66-84`

- [ ] **Step 1: Edit `createCandidate`**

Find the existing `createCandidate` function (lines ~66-84) and remove the `queueInviteEmail(candidate)` call. The default status now comes from the model (`RESUME_PENDING`).

Replace the function body with:

```js
const createCandidate = async ({ name, email, techStack, experience, questionCount, durationMinutes }, adminId) => {
  const { token, expiresAt } = generateTestToken();
  const finalCount = Number.isFinite(questionCount) ? questionCount : 10;
  const finalDuration = Number.isFinite(durationMinutes)
    ? durationMinutes
    : computeDuration(finalCount);
  const candidate = await candidateRepository.create({
    name,
    email,
    techStack,
    experience,
    questionCount: finalCount,
    durationMinutes: finalDuration,
    testToken: token,
    tokenExpiresAt: expiresAt,
    createdBy: adminId,
    // status defaults to RESUME_PENDING via the model.
  });
  return presentCandidate(candidate);
};
```

- [ ] **Step 2: Update `presentCandidate` to include `experience` and `screening`**

In the `presentCandidate` function near the top of `candidateService.js` (~lines 22-41), add the `experience` and `screening` fields to the returned object:

```js
const presentCandidate = (candidate) => ({
  id: candidate.id,
  name: candidate.name,
  email: candidate.email,
  techStack: candidate.techStack,
  experience: candidate.experience,
  status: candidate.status,
  questionCount: candidate.questionCount,
  durationMinutes: candidate.durationMinutes,
  photoUrl: candidate.photoUrl,
  resumeUrl: candidate.resumeUrl,
  resumeOriginalName: candidate.resumeOriginalName,
  resumeMimeType: candidate.resumeMimeType,
  resumeBytes: candidate.resumeBytes,
  resumeUploadedAt: candidate.resumeUploadedAt,
  screening: candidate.screening
    ? {
        status: candidate.screening.status,
        matchPercent: candidate.screening.matchPercent,
        greenFlags: candidate.screening.greenFlags || [],
        redFlags: candidate.screening.redFlags || [],
        summary: candidate.screening.summary || '',
        jdId: candidate.screening.jdId || null,
        jdSnapshot: candidate.screening.jdSnapshot || null,
        scoredAt: candidate.screening.scoredAt || null,
        scoredBy: candidate.screening.scoredBy || null,
      }
    : null,
  testToken: candidate.testToken,
  testUrl: buildTestUrl(candidate.testToken),
  tokenExpiresAt: candidate.tokenExpiresAt,
  createdAt: candidate.createdAt,
  updatedAt: candidate.updatedAt,
});
```

- [ ] **Step 3: Run existing tests to confirm nothing breaks**

Run: `cd backend && npm test --silent`
Expected: All existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/candidateService.js
git commit -m "feat: stop auto-firing test invite on candidate create; expose screening sub-doc"
```

---

## Task C3: Trigger screening on first resume upload

**Files:**
- Modify: `backend/src/services/candidateService.js` (extend `uploadResume` and add `rescreen`)

- [ ] **Step 1: Add screening trigger helper at the top of the file**

Add these imports at the top of `candidateService.js`, alongside the existing imports (Node 18+'s built-in `fetch` is used for resume re-download; no new dep required):

```js
const jdService = require('./jobDescriptionService');
const resumeScreeningService = require('./resumeScreeningService');
```

Then add a helper near the bottom of the file (before the exports):

```js
const fetchResumeBuffer = async (resumeUrl) => {
  if (!resumeUrl) return null;
  try {
    const res = await fetch(resumeUrl);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    logger.warn('Resume fetch failed', { resumeUrl, err: err.message });
    return null;
  }
};

const runScreeningFor = async (candidate, { buffer } = {}) => {
  // candidate.techStack is an array; use the first element as the primary match key.
  const primaryStack = Array.isArray(candidate.techStack) && candidate.techStack.length
    ? candidate.techStack[0]
    : '';
  const jd = primaryStack
    ? await jdService.lookup(primaryStack, candidate.experience)
    : null;
  if (!jd) {
    candidate.screening = { status: 'skipped', scoredAt: new Date() };
    await candidate.save();
    return;
  }
  const resumeBuffer = buffer || (await fetchResumeBuffer(candidate.resumeUrl));
  const resumeText = await resumeScreeningService.extractResumeText(resumeBuffer, candidate.resumeMimeType);
  const result = await resumeScreeningService.score({ resumeText, jd });
  candidate.screening = result;
  await candidate.save();
};
```

- [ ] **Step 2: Hook into `uploadResume`**

Find the existing `uploadResume` function. After `await candidate.save();` (line ~197), add the screening trigger:

```js
const uploadResume = async (id, file) => {
  if (!file) throw ApiError.badRequest('Resume file is required', { code: 'E_FILE_MISSING' });
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');

  const folder = `${env.cloudinary.folder}/resumes`;
  const publicId = `${candidate.id}-${Date.now()}-${sanitizeBaseName(file.originalname)}`;
  const result = await uploadBufferToCloudinary(file.buffer, {
    folder,
    publicId,
    resourceType: 'raw',
    tags: ['resume', `candidate:${candidate.id}`],
  });

  const previousPublicId = candidate.resumePublicId;
  candidate.resumeUrl = result.url;
  candidate.resumePublicId = result.publicId;
  candidate.resumeOriginalName = file.originalname;
  candidate.resumeMimeType = file.mimetype;
  candidate.resumeBytes = file.size;
  candidate.resumeUploadedAt = new Date();
  await candidate.save();

  if (previousPublicId && previousPublicId !== result.publicId) {
    destroyAsset(previousPublicId).catch((err) =>
      logger.warn('Failed to destroy previous resume asset', { previousPublicId, err: err.message }),
    );
  }

  // Only auto-screen on FIRST upload (no prior screening result). Re-uploads use the manual Re-screen button.
  if (candidate.status === CANDIDATE_STATUS.RESUME_PENDING && !candidate.screening) {
    try {
      await runScreeningFor(candidate, { buffer: file.buffer });
    } catch (err) {
      logger.error('Auto-screening failed', { candidateId: candidate.id, err: err.message });
      candidate.screening = { status: 'failed', scoredAt: new Date() };
      await candidate.save();
    }
  }

  return presentCandidate(candidate);
};
```

- [ ] **Step 3: Add `rescreen` action**

After `uploadResume`, add a new function:

```js
const rescreen = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (![CANDIDATE_STATUS.RESUME_PENDING, CANDIDATE_STATUS.RESUME_APPROVED].includes(candidate.status)) {
    throw ApiError.conflict(
      `Cannot re-screen a candidate in '${candidate.status}' state`,
      { code: 'E_NOT_RESCREENABLE' },
    );
  }
  if (!candidate.resumeUrl) {
    throw ApiError.badRequest('Candidate has no resume to screen', { code: 'E_NO_RESUME' });
  }
  try {
    await runScreeningFor(candidate);
  } catch (err) {
    logger.error('Re-screening failed', { candidateId: candidate.id, err: err.message });
    candidate.screening = { status: 'failed', scoredAt: new Date() };
    await candidate.save();
  }
  return presentCandidate(candidate);
};
```

- [ ] **Step 4: Export the new function**

In the `module.exports` block at the bottom, add `rescreen`.

- [ ] **Step 5: Smoke-check module loads**

Run: `cd backend && node -e "const c=require('./src/services/candidateService'); console.log(typeof c.rescreen)"`
Expected: prints `function`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/candidateService.js
git commit -m "feat: trigger screening on first resume upload + add rescreen action"
```

---

## Task C4: Add approveResume / declineResume / sendTest actions

**Files:**
- Modify: `backend/src/services/candidateService.js`

- [ ] **Step 1: Add three new functions to the service**

Add these functions after `rescreen`:

```js
const approveResume = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.status !== CANDIDATE_STATUS.RESUME_PENDING) {
    throw ApiError.conflict(
      `Candidate is in '${candidate.status}' state — cannot approve`,
      { code: 'E_ALREADY_DECIDED' },
    );
  }
  candidate.status = CANDIDATE_STATUS.RESUME_APPROVED;
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendResumeShortlisted({ candidate: presented });
    } catch (err) {
      logger.error('Resume shortlist email failed', { candidateId: presented.id, err: err.message });
    }
  });
  return presented;
};

const declineResume = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.status !== CANDIDATE_STATUS.RESUME_PENDING) {
    throw ApiError.conflict(
      `Candidate is in '${candidate.status}' state — cannot decline`,
      { code: 'E_ALREADY_DECIDED' },
    );
  }
  candidate.status = CANDIDATE_STATUS.RESUME_DECLINED;
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendResumeDeclined({ candidate: presented });
    } catch (err) {
      logger.error('Resume decline email failed', { candidateId: presented.id, err: err.message });
    }
  });
  return presented;
};

const sendTest = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.status !== CANDIDATE_STATUS.RESUME_APPROVED) {
    throw ApiError.conflict(
      `Candidate must be in 'resume_approved' state to send test (currently '${candidate.status}')`,
      { code: 'E_NOT_APPROVED' },
    );
  }
  candidate.status = CANDIDATE_STATUS.PENDING;
  await candidate.save();

  // Re-use the existing invite email pipeline.
  queueInviteEmail(candidate);
  return presentCandidate(candidate);
};
```

- [ ] **Step 2: Export the new functions**

In the `module.exports` block, add `approveResume`, `declineResume`, `sendTest`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/candidateService.js
git commit -m "feat: add approveResume/declineResume/sendTest candidate actions"
```

---

## Task C5: Tests for new candidate actions

**Files:**
- Create: `backend/tests/unit/candidateScreeningActions.test.js`

- [ ] **Step 1: Write the tests**

```js
'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/services/emailService', () => ({
  sendResumeShortlisted: jest.fn(),
  sendResumeDeclined: jest.fn(),
  sendCandidateInvite: jest.fn(),
}));
jest.mock('../../src/services/jobDescriptionService', () => ({
  lookup: jest.fn(),
}));
jest.mock('../../src/services/resumeScreeningService', () => ({
  score: jest.fn(),
  extractResumeText: jest.fn(),
}));

const candidateService = require('../../src/services/candidateService');
const candidateRepo = require('../../src/repositories/candidateRepository');
const emailService = require('../../src/services/emailService');
const { CANDIDATE_STATUS } = require('../../src/utils/constants');

const makeCandidate = (overrides = {}) => ({
  id: 'c1',
  name: 'Alice',
  email: 'alice@example.com',
  techStack: ['react'],
  experience: 'senior',
  status: CANDIDATE_STATUS.RESUME_PENDING,
  testToken: 'tok',
  tokenExpiresAt: new Date(Date.now() + 3600000),
  resumeUrl: 'https://cloudinary/test.pdf',
  save: jest.fn().mockResolvedValue(),
  ...overrides,
});

describe('candidateService.approveResume', () => {
  beforeEach(() => jest.clearAllMocks());

  test('flips status to resume_approved and fires shortlist email', async () => {
    const candidate = makeCandidate();
    candidateRepo.findById.mockResolvedValue(candidate);
    await candidateService.approveResume('c1');
    expect(candidate.status).toBe(CANDIDATE_STATUS.RESUME_APPROVED);
    expect(candidate.save).toHaveBeenCalled();
    // setImmediate fires the email
    await new Promise((r) => setImmediate(r));
    expect(emailService.sendResumeShortlisted).toHaveBeenCalled();
  });

  test('rejects with E_ALREADY_DECIDED when status is not resume_pending', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.RESUME_APPROVED });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.approveResume('c1')).rejects.toMatchObject({
      code: 'E_ALREADY_DECIDED',
    });
  });

  test('404 when candidate not found', async () => {
    candidateRepo.findById.mockResolvedValue(null);
    await expect(candidateService.approveResume('c1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('candidateService.declineResume', () => {
  beforeEach(() => jest.clearAllMocks());

  test('flips status to resume_declined and fires rejection email', async () => {
    const candidate = makeCandidate();
    candidateRepo.findById.mockResolvedValue(candidate);
    await candidateService.declineResume('c1');
    expect(candidate.status).toBe(CANDIDATE_STATUS.RESUME_DECLINED);
    expect(candidate.save).toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(emailService.sendResumeDeclined).toHaveBeenCalled();
  });

  test('rejects with E_ALREADY_DECIDED when status is not resume_pending', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.RESUME_DECLINED });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.declineResume('c1')).rejects.toMatchObject({
      code: 'E_ALREADY_DECIDED',
    });
  });
});

describe('candidateService.sendTest', () => {
  beforeEach(() => jest.clearAllMocks());

  test('flips status to pending and fires invite email', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.RESUME_APPROVED });
    candidateRepo.findById.mockResolvedValue(candidate);
    await candidateService.sendTest('c1');
    expect(candidate.status).toBe(CANDIDATE_STATUS.PENDING);
    expect(candidate.save).toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(emailService.sendCandidateInvite).toHaveBeenCalled();
  });

  test('rejects with E_NOT_APPROVED when status is not resume_approved', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.RESUME_PENDING });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.sendTest('c1')).rejects.toMatchObject({
      code: 'E_NOT_APPROVED',
    });
  });
});

describe('candidateService.rescreen', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects with E_NOT_RESCREENABLE when status past resume_approved', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.PENDING });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.rescreen('c1')).rejects.toMatchObject({
      code: 'E_NOT_RESCREENABLE',
    });
  });

  test('rejects with E_NO_RESUME when no resume url', async () => {
    const candidate = makeCandidate({ resumeUrl: null });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.rescreen('c1')).rejects.toMatchObject({ code: 'E_NO_RESUME' });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd backend && npx jest tests/unit/candidateScreeningActions.test.js`
Expected: All 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/unit/candidateScreeningActions.test.js
git commit -m "test: cover approveResume, declineResume, sendTest, rescreen"
```

---

## Task C6: Add controller handlers and wire routes

**Files:**
- Modify: `backend/src/controllers/candidateController.js` (add 4 handlers)
- Modify: `backend/src/routes/candidateRoutes.js` (wire 4 routes)
- Modify: `backend/src/validators/candidateValidator.js` (optional empty-body schemas)

- [ ] **Step 1: Add controller handlers**

In `backend/src/controllers/candidateController.js`, near the existing handlers, add:

```js
exports.approveResume = asyncHandler(async (req, res) => {
  const c = await candidateService.approveResume(req.params.id);
  return ApiResponse.ok(res, c, 'Candidate approved');
});

exports.declineResume = asyncHandler(async (req, res) => {
  const c = await candidateService.declineResume(req.params.id);
  return ApiResponse.ok(res, c, 'Candidate declined');
});

exports.rescreenResume = asyncHandler(async (req, res) => {
  const c = await candidateService.rescreen(req.params.id);
  return ApiResponse.ok(res, c, 'Re-screened');
});

exports.sendTest = asyncHandler(async (req, res) => {
  const c = await candidateService.sendTest(req.params.id);
  return ApiResponse.ok(res, c, 'Test invitation sent');
});
```

(If `asyncHandler` and `ApiResponse` aren't already imported in this file, follow the pattern used by the other handlers — check the top of the file.)

- [ ] **Step 2: Wire routes**

In `backend/src/routes/candidateRoutes.js`, after the existing `/:id/select` and `/:id/reject` lines, add:

```js
router.post('/:id/resume/approve', validate(idParamSchema), candidateController.approveResume);
router.post('/:id/resume/decline', validate(idParamSchema), candidateController.declineResume);
router.post('/:id/resume/rescreen', validate(idParamSchema), candidateController.rescreenResume);
router.post('/:id/send-test', validate(idParamSchema), candidateController.sendTest);
```

- [ ] **Step 3: Smoke-check the route boots**

Run: `cd backend && node -e "require('./src/routes')" && echo OK`
Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/candidateController.js backend/src/routes/candidateRoutes.js
git commit -m "feat: wire approve/decline/rescreen/sendTest routes"
```

---

# Phase D — JD library frontend

## Task D1: Add `jobDescriptionApi` client

**Files:**
- Create: `frontend/src/api/jobDescriptionApi.js`

- [ ] **Step 1: Create the file**

```js
import { apiClient } from './axios';

export const jobDescriptionApi = {
  list: (params) => apiClient.get('/job-descriptions', { params }).then((r) => r.data.data),
  detail: (id) => apiClient.get(`/job-descriptions/${id}`).then((r) => r.data.data),
  create: (payload) => apiClient.post('/job-descriptions', payload).then((r) => r.data.data),
  update: (id, payload) => apiClient.patch(`/job-descriptions/${id}`, payload).then((r) => r.data.data),
  deactivate: (id) => apiClient.delete(`/job-descriptions/${id}`).then((r) => r.data),
  lookup: (techStack, experience) =>
    apiClient.get('/job-descriptions/lookup', { params: { techStack, experience } }).then((r) => r.data.data),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/jobDescriptionApi.js
git commit -m "feat: add jobDescriptionApi client"
```

---

## Task D2: Add `jobDescriptions` Redux slice

**Files:**
- Create: `frontend/src/features/jobDescriptions/jobDescriptionsSlice.js`

- [ ] **Step 1: Create the slice**

```js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { jobDescriptionApi } from '@/api/jobDescriptionApi';
import { extractError } from '@/api/axios';

export const fetchJds = createAsyncThunk('jds/fetch', async (params, { rejectWithValue }) => {
  try {
    return await jobDescriptionApi.list(params);
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

export const createJd = createAsyncThunk('jds/create', async (payload, { rejectWithValue }) => {
  try {
    return await jobDescriptionApi.create(payload);
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

export const updateJd = createAsyncThunk('jds/update', async ({ id, payload }, { rejectWithValue }) => {
  try {
    return await jobDescriptionApi.update(id, payload);
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

export const deactivateJd = createAsyncThunk('jds/deactivate', async (id, { rejectWithValue }) => {
  try {
    await jobDescriptionApi.deactivate(id);
    return id;
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

const slice = createSlice({
  name: 'jds',
  initialState: {
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    status: 'idle',
    error: null,
    busy: false,
  },
  reducers: {
    clearError(state) { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJds.pending, (s) => { s.status = 'loading'; s.error = null; })
      .addCase(fetchJds.fulfilled, (s, a) => {
        s.status = 'succeeded';
        s.items = a.payload.items;
        s.total = a.payload.total;
        s.page = a.payload.page;
        s.totalPages = a.payload.totalPages;
      })
      .addCase(fetchJds.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed to load'; })
      .addCase(createJd.pending, (s) => { s.busy = true; })
      .addCase(createJd.fulfilled, (s) => { s.busy = false; })
      .addCase(createJd.rejected, (s, a) => { s.busy = false; s.error = a.payload?.message || 'Create failed'; })
      .addCase(updateJd.pending, (s) => { s.busy = true; })
      .addCase(updateJd.fulfilled, (s) => { s.busy = false; })
      .addCase(updateJd.rejected, (s, a) => { s.busy = false; s.error = a.payload?.message || 'Update failed'; })
      .addCase(deactivateJd.fulfilled, (s, a) => {
        const item = s.items.find((x) => x.id === a.payload);
        if (item) item.isActive = false;
      });
  },
});

export const { clearError } = slice.actions;
export default slice.reducer;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/jobDescriptions/jobDescriptionsSlice.js
git commit -m "feat: add jobDescriptions Redux slice"
```

---

## Task D3: Register slice in the store

**Files:**
- Modify: `frontend/src/app/store.js`

- [ ] **Step 1: Add slice to the store**

In `frontend/src/app/store.js`, add the import alongside the other reducer imports:

```js
import jdsReducer from '@/features/jobDescriptions/jobDescriptionsSlice';
```

Add it to the `reducer` object in `configureStore`:

```js
reducer: {
  // ... existing slices ...
  jds: jdsReducer,
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/store.js
git commit -m "feat: register jds slice in store"
```

---

## Task D4: Add JD form modal

**Files:**
- Create: `frontend/src/features/jobDescriptions/JobDescriptionFormModal.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { createJd, updateJd, fetchJds } from './jobDescriptionsSlice';

const EMPTY = {
  title: '',
  techStack: '',
  experience: 'mid',
  jobRole: '',
  responsibilities: '',
  qualifications: '',
  niceToHave: '',
  minYears: '',
  maxYears: '',
  location: '',
};

export default function JobDescriptionFormModal({ open, initial, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { busy } = useSelector((s) => s.jds);
  const [form, setForm] = useState(EMPTY);
  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (open) setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
  }, [open, initial]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      techStack: form.techStack.toLowerCase().trim(),
      minYears: form.minYears === '' ? null : Number(form.minYears),
      maxYears: form.maxYears === '' ? null : Number(form.maxYears),
    };
    const action = isEdit
      ? await dispatch(updateJd({ id: initial.id, payload }))
      : await dispatch(createJd(payload));
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: isEdit ? 'JD updated' : 'JD created' });
      dispatch(fetchJds({ page: 1, limit: 20 }));
      onClose();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Job Description' : 'New Job Description'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{isEdit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <Input name="title" label="Title" value={form.title} onChange={onChange} required />
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Input name="techStack" label="Tech stack" value={form.techStack} onChange={onChange} required placeholder="react, devops, etc." />
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Experience</label>
            <select name="experience" value={form.experience} onChange={onChange} style={{ width: '100%', padding: '8px 10px' }}>
              <option value="entry">Entry</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
          <Input name="minYears" type="number" label="Min years" value={form.minYears} onChange={onChange} />
          <Input name="maxYears" type="number" label="Max years" value={form.maxYears} onChange={onChange} />
          <Input name="location" label="Location" value={form.location} onChange={onChange} />
        </div>
        <Textarea name="jobRole" label="Job Role" rows={3} value={form.jobRole} onChange={onChange} />
        <Textarea name="responsibilities" label="Role + Responsibilities" rows={6} value={form.responsibilities} onChange={onChange} />
        <Textarea name="qualifications" label="Person Specification and Qualifications" rows={6} value={form.qualifications} onChange={onChange} />
        <Textarea name="niceToHave" label="Plus Points (Nice-to-Have)" rows={4} value={form.niceToHave} onChange={onChange} />
      </form>
    </Modal>
  );
}

function Textarea({ name, label, rows, value, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>{label}</label>
      <textarea
        name={name}
        rows={rows}
        value={value}
        onChange={onChange}
        style={{ width: '100%', resize: 'vertical', padding: 8, fontFamily: 'inherit' }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/jobDescriptions/JobDescriptionFormModal.jsx
git commit -m "feat: add JD form modal"
```

---

## Task D5: Add JD list page

**Files:**
- Create: `frontend/src/features/jobDescriptions/JobDescriptionListPage.jsx`
- Create: `frontend/src/features/jobDescriptions/JobDescriptionListPage.scss`

- [ ] **Step 1: Create the SCSS file**

```scss
// frontend/src/features/jobDescriptions/JobDescriptionListPage.scss
.jd-list {
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
  }
}
```

- [ ] **Step 2: Create the list page**

```jsx
// frontend/src/features/jobDescriptions/JobDescriptionListPage.jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchJds, deactivateJd } from './jobDescriptionsSlice';
import JobDescriptionFormModal from './JobDescriptionFormModal';
import './JobDescriptionListPage.scss';

export default function JobDescriptionListPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { items, total, totalPages, page, status } = useSelector((s) => s.jds);
  const [filters, setFilters] = useState({ search: '', experience: '', isActive: '' });
  const [modal, setModal] = useState({ open: false, initial: null });

  useEffect(() => {
    dispatch(fetchJds({ page: 1, limit: 20, ...filters }));
  }, [dispatch, filters]);

  const onDeactivate = async (id) => {
    if (!confirm('Deactivate this JD? Already-screened candidates keep their snapshot.')) return;
    const action = await dispatch(deactivateJd(id));
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: 'JD deactivated' });
    }
  };

  return (
    <div className="jd-list">
      <div className="jd-list__head">
        <div>
          <h1 style={{ margin: 0 }}>Job Descriptions</h1>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{total} total · page {page} / {totalPages}</div>
        </div>
        <Button onClick={() => setModal({ open: true, initial: null })}>+ New JD</Button>
      </div>

      <div className="jd-list__filters">
        <input
          placeholder="Search title or tech stack…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}
        />
        <select value={filters.experience} onChange={(e) => setFilters((f) => ({ ...f, experience: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">All experience</option>
          <option value="entry">Entry</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
        </select>
        <select value={filters.isActive} onChange={(e) => setFilters((f) => ({ ...f, isActive: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">Active &amp; inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {status === 'loading' && <Loader message="Loading…" />}
      {status !== 'loading' && items.length === 0 && (
        <EmptyState title="No JDs yet" description="Create one to start screening candidates." />
      )}
      {items.length > 0 && (
        <table className="jd-list__table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Tech / Experience</th>
              <th>Years</th>
              <th>Location</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((jd) => (
              <tr key={jd.id}>
                <td>{jd.title}</td>
                <td>{jd.techStack} / {jd.experience}</td>
                <td>{jd.minYears ?? '—'} – {jd.maxYears ?? '—'}</td>
                <td>{jd.location || '—'}</td>
                <td>
                  <span className={`jd-list__pill ${jd.isActive ? 'jd-list__pill--active' : 'jd-list__pill--inactive'}`}>
                    {jd.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(jd.updatedAt).toLocaleString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="secondary" onClick={() => setModal({ open: true, initial: jd })}>Edit</Button>
                    {jd.isActive && <Button size="sm" variant="ghost" onClick={() => onDeactivate(jd.id)}>Deactivate</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <JobDescriptionFormModal
        open={modal.open}
        initial={modal.initial}
        onClose={() => setModal({ open: false, initial: null })}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/jobDescriptions/JobDescriptionListPage.jsx frontend/src/features/jobDescriptions/JobDescriptionListPage.scss
git commit -m "feat: add JD list page with create/edit/deactivate"
```

---

## Task D6: Add nav entry and route

**Files:**
- Modify: `frontend/src/layouts/AdminLayout.jsx:7-15` (add to `NAV` array)
- Modify: `frontend/src/routes/AppRoutes.jsx` — add route for `/job-descriptions`

- [ ] **Step 1: Add nav entry**

In `frontend/src/layouts/AdminLayout.jsx`, in the `NAV` array, add an entry before `Edit requests`:

```js
{ to: '/job-descriptions', label: 'Job Descriptions', icon: '🗎' },
```

- [ ] **Step 2: Register the route**

In `frontend/src/routes/AppRoutes.jsx`, add the import alongside the others:

```jsx
import JobDescriptionListPage from '@/features/jobDescriptions/JobDescriptionListPage';
```

Then add a route inside the existing protected admin block (where `/candidates` is defined):

```jsx
<Route path="/job-descriptions" element={<JobDescriptionListPage />} />
```

- [ ] **Step 3: Smoke test**

Run: `cd frontend && npm run dev` (in another terminal) and navigate to `/job-descriptions`. Expected: the JD list page renders with a "+ New JD" button. Create a JD via the modal — should save and appear in the list.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/AdminLayout.jsx frontend/src/routes/AppRoutes.jsx
git commit -m "feat: add Job Descriptions nav entry and route"
```

---

# Phase E — Candidate page integration (frontend)

## Task E1: Extend `candidateApi` with new actions

**Files:**
- Modify: `frontend/src/api/candidateApi.js`

- [ ] **Step 1: Add new methods**

In `frontend/src/api/candidateApi.js`, add these methods to the existing `candidateApi` object:

```js
approveResume: (id) => apiClient.post(`/candidates/${id}/resume/approve`).then((r) => r.data.data),
declineResume: (id) => apiClient.post(`/candidates/${id}/resume/decline`).then((r) => r.data.data),
rescreen: (id) => apiClient.post(`/candidates/${id}/resume/rescreen`).then((r) => r.data.data),
sendTest: (id) => apiClient.post(`/candidates/${id}/send-test`).then((r) => r.data.data),
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/candidateApi.js
git commit -m "feat: add approve/decline/rescreen/sendTest candidate API methods"
```

---

## Task E2: Add `ScreeningPanel` component

**Files:**
- Create: `frontend/src/features/candidates/ScreeningPanel.jsx`
- Create: `frontend/src/features/candidates/ScreeningPanel.scss`

- [ ] **Step 1: Create the SCSS file**

```scss
// frontend/src/features/candidates/ScreeningPanel.scss
.screening-panel {
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 16px;

  &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  &__title { font-weight: 600; font-size: 14px; color: #374151; }

  &__match {
    font-size: 22px; font-weight: 700;
    &--high { color: #047857; }
    &--low { color: #b91c1c; }
  }
  &__rec {
    display: inline-block; margin-left: 12px; font-size: 12px; padding: 2px 10px; border-radius: 999px;
    &--approve { background: #ecfdf5; color: #047857; }
    &--decline { background: #fef2f2; color: #b91c1c; }
  }
  &__flags { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
  &__flagGroup { 
    h4 { margin: 0 0 8px; font-size: 13px; }
    ul { margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.5; }
  }
  &__flagGroup--green h4 { color: #047857; }
  &__flagGroup--red h4 { color: #b91c1c; }
  &__summary { background: #f9fafb; padding: 10px 12px; border-radius: 6px; font-size: 13px; }
  &__meta { font-size: 12px; color: #6b7280; margin-top: 12px; }
  &__warning {
    padding: 10px 12px; background: #fffbeb; color: #92400e; border-radius: 6px;
    font-size: 13px; margin-bottom: 12px;
  }
}
```

- [ ] **Step 2: Create the panel component**

```jsx
// frontend/src/features/candidates/ScreeningPanel.jsx
import Button from '@/components/common/Button';
import './ScreeningPanel.scss';

export default function ScreeningPanel({ screening, candidate, onRescreen, rescreening }) {
  if (!screening) return null;

  const recommend = screening.status === 'scored'
    ? (screening.matchPercent >= 60 ? 'approve' : 'decline')
    : null;

  return (
    <div className="screening-panel">
      <div className="screening-panel__head">
        <div className="screening-panel__title">
          Screening
          {screening.jdSnapshot?.title && (
            <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
              · JD: {screening.jdSnapshot.title}
            </span>
          )}
        </div>
        {(['resume_pending', 'resume_approved'].includes(candidate.status)) && (
          <Button size="sm" variant="secondary" onClick={onRescreen} loading={rescreening}>
            Re-screen against current JD
          </Button>
        )}
      </div>

      {screening.status === 'skipped' && (
        <div className="screening-panel__warning">
          ⚠ No JD configured for {(candidate.techStack || []).join(', ')} / {candidate.experience}.
          Create one in Job Descriptions, then click Re-screen.
        </div>
      )}

      {screening.status === 'failed' && (
        <div className="screening-panel__warning">
          ⚠ AI screening unavailable — review manually.
        </div>
      )}

      {screening.status === 'scored' && (
        <>
          <div>
            <span className={`screening-panel__match ${screening.matchPercent >= 60 ? 'screening-panel__match--high' : 'screening-panel__match--low'}`}>
              Match: {screening.matchPercent}%
            </span>
            <span className={`screening-panel__rec screening-panel__rec--${recommend}`}>
              AI recommends: {recommend === 'approve' ? 'Approve' : 'Decline'}
            </span>
          </div>

          <div className="screening-panel__flags">
            <div className="screening-panel__flagGroup screening-panel__flagGroup--green">
              <h4>✓ Green flags</h4>
              <ul>{(screening.greenFlags || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
            <div className="screening-panel__flagGroup screening-panel__flagGroup--red">
              <h4>✗ Red flags</h4>
              <ul>{(screening.redFlags || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          </div>

          {screening.summary && (
            <div className="screening-panel__summary">{screening.summary}</div>
          )}

          <div className="screening-panel__meta">
            Scored by {screening.scoredBy} · {screening.scoredAt && new Date(screening.scoredAt).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/candidates/ScreeningPanel.jsx frontend/src/features/candidates/ScreeningPanel.scss
git commit -m "feat: add ScreeningPanel component"
```

---

## Task E3: Wire screening + Approve/Decline/Send-test on CandidateDetailPage

**Files:**
- Modify: `frontend/src/features/candidates/CandidateDetailPage.jsx`

- [ ] **Step 1: Add imports and state**

At the top of the file, add:

```jsx
import ScreeningPanel from './ScreeningPanel';
import { candidateApi } from '@/api/candidateApi';
```

Inside the component, add busy-state hooks for the four new actions, near the existing useState declarations:

```jsx
const [actBusy, setActBusy] = useState(null); // 'approve' | 'decline' | 'rescreen' | 'sendTest' | null
const [confirmOverride, setConfirmOverride] = useState(null); // 'approve' | 'decline' | null
```

- [ ] **Step 2: Add action handlers**

Inside the component body (before the `return`):

```jsx
const refresh = () => dispatch(fetchCandidateDetail(id)); // use existing thunk name

const onApprove = async ({ skipConfirm } = {}) => {
  const score = candidate.screening?.matchPercent;
  const scored = candidate.screening?.status === 'scored';
  if (!skipConfirm && scored && score < 60) {
    setConfirmOverride('approve');
    return;
  }
  setConfirmOverride(null);
  setActBusy('approve');
  try {
    await candidateApi.approveResume(id);
    push({ type: 'success', message: 'Approved — shortlist email queued' });
    refresh();
  } catch (err) {
    push({ type: 'error', message: err.response?.data?.message || 'Approve failed' });
  } finally {
    setActBusy(null);
  }
};

const onDecline = async ({ skipConfirm } = {}) => {
  const score = candidate.screening?.matchPercent;
  const scored = candidate.screening?.status === 'scored';
  if (!skipConfirm && scored && score >= 60) {
    setConfirmOverride('decline');
    return;
  }
  setConfirmOverride(null);
  setActBusy('decline');
  try {
    await candidateApi.declineResume(id);
    push({ type: 'success', message: 'Declined — rejection email queued' });
    refresh();
  } catch (err) {
    push({ type: 'error', message: err.response?.data?.message || 'Decline failed' });
  } finally {
    setActBusy(null);
  }
};

const onRescreen = async () => {
  setActBusy('rescreen');
  try {
    await candidateApi.rescreen(id);
    push({ type: 'success', message: 'Re-screened' });
    refresh();
  } catch (err) {
    push({ type: 'error', message: err.response?.data?.message || 'Re-screen failed' });
  } finally {
    setActBusy(null);
  }
};

const onSendTest = async () => {
  setActBusy('sendTest');
  try {
    await candidateApi.sendTest(id);
    push({ type: 'success', message: 'Test invitation sent' });
    refresh();
  } catch (err) {
    push({ type: 'error', message: err.response?.data?.message || 'Send test failed' });
  } finally {
    setActBusy(null);
  }
};
```

- [ ] **Step 3: Render ScreeningPanel + action bar**

Near the top of the JSX (before the existing candidate detail fields), insert:

```jsx
<ScreeningPanel
  screening={candidate.screening}
  candidate={candidate}
  onRescreen={onRescreen}
  rescreening={actBusy === 'rescreen'}
/>

{candidate.status === 'resume_pending' && (
  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
    <Button onClick={() => onApprove()} loading={actBusy === 'approve'}>Approve</Button>
    <Button variant="secondary" onClick={() => onDecline()} loading={actBusy === 'decline'}>Decline</Button>
  </div>
)}

{candidate.status === 'resume_approved' && (
  <div style={{ marginBottom: 16 }}>
    <Button onClick={onSendTest} loading={actBusy === 'sendTest'}>Send test</Button>
  </div>
)}

<Modal
  open={confirmOverride !== null}
  onClose={() => setConfirmOverride(null)}
  title="Override AI recommendation?"
  footer={
    <>
      <Button variant="secondary" onClick={() => setConfirmOverride(null)}>Cancel</Button>
      <Button onClick={() => (confirmOverride === 'approve' ? onApprove({ skipConfirm: true }) : onDecline({ skipConfirm: true }))}>
        Confirm {confirmOverride === 'approve' ? 'Approve' : 'Decline'}
      </Button>
    </>
  }
>
  {confirmOverride === 'approve' && (
    <p>
      AI recommends declining this candidate (match: {candidate.screening?.matchPercent}%). Approve anyway?
    </p>
  )}
  {confirmOverride === 'decline' && (
    <p>
      AI recommends approving this candidate (match: {candidate.screening?.matchPercent}%). Decline anyway?
    </p>
  )}
</Modal>
```

Make sure `Modal` is imported from `@/components/common/Modal`.

- [ ] **Step 4: Smoke-test the flow in the browser**

Run: `cd frontend && npm run dev`. Navigate to a candidate detail page. Verify:
- Screening panel renders (when present)
- Approve/Decline buttons show only on `resume_pending`
- Override modal appears when score < 60 and Approve clicked (or score ≥ 60 and Decline clicked)
- Send test button shows on `resume_approved`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/candidates/CandidateDetailPage.jsx
git commit -m "feat: wire screening panel + approve/decline/sendTest on candidate detail"
```

---

## Task E4: Update `CandidateListPage` — match% column and new filters

**Files:**
- Modify: `frontend/src/features/candidates/CandidateListPage.jsx`

- [ ] **Step 1: Add Match% column to the table**

In the candidate table inside `CandidateListPage.jsx`, find the header row. Add a new `<th>` for `Match %` after the existing status column. In the body, render the matching `<td>`:

```jsx
<td>
  {candidate.screening?.status === 'scored'
    ? `${candidate.screening.matchPercent}%`
    : '—'}
</td>
```

- [ ] **Step 2: Add new status filter options**

Find the status filter `<select>` and ensure these options are present (alongside existing ones):

```jsx
<option value="resume_pending">Resume pending</option>
<option value="resume_approved">Approved</option>
<option value="resume_declined">Declined</option>
```

- [ ] **Step 3: Smoke test**

In the browser, navigate to `/candidates`. Verify the new column renders and filters work.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/candidates/CandidateListPage.jsx
git commit -m "feat: add match% column and new status filters to candidate list"
```

---

# Phase F — End-to-end verification

## Task F1: Full backend test pass + manual E2E

**Files:** None (verification only)

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && npm test --silent`
Expected: All tests pass, including the new `jobDescriptionService`, `resumeScreeningService`, and `candidateScreeningActions` suites.

- [ ] **Step 2: Manual E2E happy path**

With both backend (`npm run dev`) and frontend (`npm run dev`) running:

1. As HR, navigate to **Job Descriptions** → create a JD for `react / mid` matching your test candidate's stack/experience.
2. Navigate to **Candidates** → create a candidate (no resume yet). Verify status is `resume_pending` and no email was sent.
3. Open the candidate detail page. Verify the Screening panel does not yet render.
4. Upload a resume. Verify the page shows a screening result within ~3-8 seconds with match %, green/red flags, and summary.
5. Click **Approve**. Verify shortlist email is logged in backend stdout and status flips to `resume_approved`.
6. Click **Send test**. Verify test-link email is logged and status flips to `pending`.

- [ ] **Step 3: Manual E2E override-decline path**

1. Create another candidate with a tech stack that matches an existing JD but upload a clearly mismatched resume.
2. Wait for screening — match % should be below 60.
3. Click **Decline**. Verify rejection email is logged and status flips to `resume_declined`.
4. Verify all action buttons disappear once declined.

- [ ] **Step 4: Manual E2E no-JD fallback**

1. Create a candidate with a tech stack that has NO JD configured.
2. Upload a resume.
3. Verify the screening panel renders the "No JD configured" warning.
4. Verify Approve/Decline buttons still appear and work.

- [ ] **Step 5: Manual E2E override-approve modal**

1. Find a candidate with `screening.status === 'scored'` and `matchPercent < 60`.
2. Click Approve.
3. Verify the override-confirmation modal appears with the matching message.
4. Confirm → status flips to `resume_approved`.

- [ ] **Step 6: Commit (verification log only — empty commit not required)**

If any minor fixes were needed during manual testing, commit them with descriptive messages. Otherwise, this task has no commit.

---

## Self-Review

Walking the plan against the spec:

1. **Spec §2 (flow)** — Covered: A1-A6 build the JD library, B1-B4 build screening, C1-C6 build the candidate flow, D/E wire the UI. The implementation deviation (screening fires at resume upload rather than candidate create) is called out at the top.
2. **Spec §3 (JD library)** — Covered by Task A1 (model with partial unique index), A2 (repo), A3 (validators), A4 (service with reuse / no auto-deactivation), A5-A6 (controller + routes).
3. **Spec §4 (screening service)** — Covered by Task B1 (deps), B2-B3 (model changes), B4 (service with fallback chain reuse, jdSnapshot, status enum, clamp + truncation).
4. **Spec §5 (candidate UI)** — Task E2 (ScreeningPanel renders scored/skipped/failed with re-screen), E3 (buttons + override modal), E4 (list page).
5. **Spec §6 (status + emails)** — Task B2 (status enum), C1 (templates), C2 (default status, no auto-invite), C4 (transition logic + email fires).
6. **Spec §7 (API surface)** — Task A6 (`/job-descriptions` routes), C6 (candidate action routes).
7. **Spec §8 (edge cases)** — Task C3 covers re-screen guards (`E_NOT_RESCREENABLE`, `E_NO_RESUME`). C4 covers `E_ALREADY_DECIDED`. C5 tests them.
8. **Spec §9 (rollout)** — No backfill in plan (purely additive; existing candidates retain their `status` and have no `screening` sub-doc).
9. **Spec §10 (testing)** — Tasks A4, B4, C5 cover all three required test files.

**Type consistency:** `screening.status` values (`'scored'/'skipped'/'failed'`) are used identically across model (B3), service (B4), candidate update (C3, C4), and UI (E2). Candidate status names (`resume_pending/resume_approved/resume_declined`) are consistent across constants (B2), model default (B3), service guards (C4), and UI conditions (E3, E4). Error codes (`E_ALREADY_DECIDED`, `E_NOT_APPROVED`, `E_NOT_RESCREENABLE`, `E_NO_RESUME`, `E_JD_DUPLICATE`) are uniquely defined in services and surfaced by routes.

**Placeholder scan:** No "TBD"/"TODO"/"add validation"/etc. in any task.
