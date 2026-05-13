# Interview Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready MERN Interview Management System: HR/Admin creates candidates, generates secure time-bound test links; candidates take photo + answer auto-graded tests with anti-cheat detection; AI evaluates descriptive answers; HR receives email reports.

**Architecture:** Layered backend (controllers → services → repositories → models) with centralized error handling, JWT auth for admin, signed UUID tokens for candidate links, Socket.io for real-time anti-cheat monitoring, Cloudinary for photos, Gemini (primary) + Grok (fallback) for AI evaluation, Nodemailer for HR reports. Frontend is React/Vite/Redux Toolkit/SCSS with feature-based folder structure, protected routes for admin, token-validated public route for candidate test flow.

**Tech Stack:**
- **Backend:** Node.js, Express, MongoDB/Mongoose, JWT (jsonwebtoken), bcrypt, Joi, Socket.io, Multer (memory) → Cloudinary, Nodemailer, helmet, express-rate-limit, express-mongo-sanitize, winston
- **Frontend:** React 18, Vite, Redux Toolkit, RTK Query (or Axios), React Router v6, SCSS, react-webcam
- **AI:** Gemini API (`@google/generative-ai`), Grok API (xAI fallback via REST)
- **Tooling:** ESLint, Prettier, dotenv, nodemon

---

## File Structure

### Backend (`backend/`)

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js              # Centralized env loader + validation
│   │   ├── db.js               # Mongoose connection
│   │   ├── cloudinary.js       # Cloudinary config
│   │   └── logger.js           # Winston logger
│   ├── models/
│   │   ├── Admin.js            # HR/admin user
│   │   ├── Candidate.js        # Candidate + test token
│   │   ├── Question.js         # Question bank entries
│   │   ├── TestSession.js      # Active test session
│   │   └── Submission.js       # Final scored submission
│   ├── repositories/
│   │   ├── adminRepository.js
│   │   ├── candidateRepository.js
│   │   ├── questionRepository.js
│   │   ├── sessionRepository.js
│   │   └── submissionRepository.js
│   ├── services/
│   │   ├── authService.js      # Admin login, JWT issue/verify
│   │   ├── candidateService.js # Create candidate, issue token
│   │   ├── questionService.js  # CRUD + AI generation
│   │   ├── testService.js      # Validate token, start, submit
│   │   ├── evaluationService.js# MCQ/multi/one-line/descriptive scoring
│   │   ├── aiService.js        # Gemini + Grok fallback
│   │   ├── emailService.js     # Nodemailer + report template
│   │   └── uploadService.js    # Cloudinary upload from buffer
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── candidateController.js
│   │   ├── questionController.js
│   │   ├── testController.js
│   │   └── submissionController.js
│   ├── routes/
│   │   ├── index.js            # Mounts all routers under /api/v1
│   │   ├── authRoutes.js
│   │   ├── candidateRoutes.js
│   │   ├── questionRoutes.js
│   │   ├── testRoutes.js
│   │   └── submissionRoutes.js
│   ├── middlewares/
│   │   ├── authMiddleware.js   # JWT verify + role guard
│   │   ├── tokenMiddleware.js  # Candidate test-token verify
│   │   ├── errorHandler.js     # Centralized error -> JSON
│   │   ├── notFound.js
│   │   ├── rateLimiter.js      # Per-route limits
│   │   ├── validator.js        # Joi schema runner
│   │   └── upload.js           # Multer memory storage
│   ├── validators/
│   │   ├── authValidator.js
│   │   ├── candidateValidator.js
│   │   ├── questionValidator.js
│   │   └── testValidator.js
│   ├── utils/
│   │   ├── ApiError.js         # Operational error class
│   │   ├── ApiResponse.js      # Uniform success envelope
│   │   ├── asyncHandler.js     # Express promise wrapper
│   │   ├── tokenGenerator.js   # UUID + HMAC test tokens
│   │   └── constants.js        # Enums, durations
│   ├── sockets/
│   │   └── testSocket.js       # Optional realtime anti-cheat
│   ├── templates/
│   │   └── reportEmail.js      # HTML report builder
│   ├── seed/
│   │   └── seedAdmin.js        # First-run admin seeding
│   ├── app.js                  # Express app wiring
│   └── server.js               # HTTP + Socket.io bootstrap
├── tests/
│   ├── unit/
│   │   ├── evaluationService.test.js
│   │   └── tokenGenerator.test.js
│   └── integration/
│       └── testFlow.test.js
├── .env.example
├── .gitignore
├── package.json
├── nodemon.json
└── README.md
```

### Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── api/
│   │   ├── axios.js            # Axios instance + interceptors
│   │   ├── authApi.js
│   │   ├── candidateApi.js
│   │   ├── questionApi.js
│   │   ├── testApi.js
│   │   └── submissionApi.js
│   ├── app/
│   │   └── store.js            # Redux store
│   ├── features/
│   │   ├── auth/
│   │   │   ├── authSlice.js
│   │   │   └── LoginPage.jsx
│   │   ├── candidates/
│   │   │   ├── candidateSlice.js
│   │   │   ├── CandidateListPage.jsx
│   │   │   └── CreateCandidateModal.jsx
│   │   ├── questions/
│   │   │   ├── questionSlice.js
│   │   │   ├── QuestionListPage.jsx
│   │   │   └── QuestionFormModal.jsx
│   │   ├── submissions/
│   │   │   ├── submissionSlice.js
│   │   │   ├── SubmissionListPage.jsx
│   │   │   └── SubmissionDetailPage.jsx
│   │   └── test/
│   │       ├── testSlice.js
│   │       ├── TestEntryPage.jsx       # Token validation, intro
│   │       ├── PhotoCapturePage.jsx    # Webcam capture
│   │       ├── TestPage.jsx            # Question runner + timer
│   │       ├── SubmittedPage.jsx
│   │       └── components/
│   │           ├── QuestionRenderer.jsx
│   │           ├── Timer.jsx
│   │           └── AntiCheatGuard.jsx  # Tab/blur listener
│   ├── components/
│   │   └── common/
│   │       ├── Button.jsx
│   │       ├── Input.jsx
│   │       ├── Modal.jsx
│   │       ├── Loader.jsx
│   │       ├── Toast.jsx
│   │       └── ProtectedRoute.jsx
│   ├── layouts/
│   │   ├── AdminLayout.jsx
│   │   └── PublicLayout.jsx
│   ├── routes/
│   │   └── AppRoutes.jsx
│   ├── styles/
│   │   ├── _variables.scss
│   │   ├── _mixins.scss
│   │   ├── _reset.scss
│   │   └── main.scss
│   ├── hooks/
│   │   ├── useAuth.js
│   │   └── useAntiCheat.js
│   ├── utils/
│   │   ├── tokenStorage.js
│   │   └── formatters.js
│   ├── App.jsx
│   └── main.jsx
├── public/
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## API Contract Summary

Base path: `/api/v1`

### Auth (admin)
- `POST /auth/register` — seed first admin (gated by env flag)
- `POST /auth/login` — `{ email, password }` → `{ token, admin }`
- `GET /auth/me` — current admin (JWT)

### Candidates (admin only)
- `POST /candidates` — create candidate; backend issues `testToken`, returns full URL
- `GET /candidates` — list with pagination + status filter
- `GET /candidates/:id` — detail
- `DELETE /candidates/:id`
- `POST /candidates/:id/regenerate-token` — issue new token if expired

### Questions (admin only)
- `POST /questions` — single create
- `POST /questions/bulk` — array create
- `POST /questions/generate` — AI-generate `{ techStack, count, types }`
- `GET /questions?techStack=React&type=mcq`
- `PUT /questions/:id`
- `DELETE /questions/:id`

### Test (public, candidate token via header `x-test-token`)
- `GET /test/validate` — verify token, return candidate prefill (name/email/techStack)
- `POST /test/photo` — multipart `photo`, returns Cloudinary URL
- `POST /test/start` — generates session, returns questions (sanitized: no answers) + endsAt
- `POST /test/submit` — `{ answers: [{ questionId, answer }] }` → triggers evaluation + email
- `POST /test/auto-submit` — anti-cheat trigger (records reason, locks)

### Submissions (admin only)
- `GET /submissions?candidateId=...`
- `GET /submissions/:id` — full breakdown

---

## Data Models

### Admin
```js
{ name, email (unique), password (bcrypt hash), role: 'admin', hrNotificationEmail, timestamps }
```

### Candidate
```js
{
  name, email, techStack: [String],
  testToken (unique, indexed), tokenExpiresAt: Date,
  status: 'pending' | 'photo_captured' | 'in_progress' | 'completed' | 'expired' | 'cheated',
  photoUrl, photoPublicId,
  durationMinutes: { type: Number, default: 60 },
  createdBy: ObjectId<Admin>,
  timestamps
}
```

### Question
```js
{
  techStack: String,                  // 'React', 'Node', 'MERN', etc.
  type: 'mcq' | 'multi_select' | 'one_line' | 'descriptive',
  question: String,
  options: [String],                  // mcq/multi
  correctAnswer: Mixed,               // String for mcq/one_line, [String] for multi
  keywords: [String],                 // one_line fallback matching
  marks: { type: Number, default: 1 },
  difficulty: 'easy' | 'medium' | 'hard',
  source: 'manual' | 'ai',
  createdBy: ObjectId<Admin>,
  timestamps
}
```

### TestSession
```js
{
  candidate: ObjectId<Candidate, unique>,
  questions: [ObjectId<Question>],
  startedAt: Date, endsAt: Date,
  status: 'active' | 'submitted' | 'auto_submitted' | 'cheated' | 'expired',
  cheatEvents: [{ type: 'tab_switch'|'blur'|'visibility', at: Date }],
  timestamps
}
```

### Submission
```js
{
  candidate: ObjectId<Candidate>,
  session: ObjectId<TestSession>,
  answers: [{
    question: ObjectId<Question>,
    type, given: Mixed, isCorrect: Boolean, score: Number,
    aiFeedback: String,
    aiProvider: 'gemini' | 'grok' | null
  }],
  totalScore: Number, maxScore: Number, percentage: Number,
  autoSubmitted: Boolean, cheatDetected: Boolean, cheatReason: String,
  reportEmailedAt: Date,
  timestamps
}
```

---

## Phases

Each phase produces runnable, testable software. The engineer commits at the end of each phase (and at logical sub-points).

### Phase 1 — Backend Foundation
Project init, env/config, DB, logger, error infra, models, admin auth, candidate creation + token issuance, photo upload to Cloudinary.

**Deliverable:** Admin can register, login, create a candidate, get test URL, candidate-link validation works, photo upload to Cloudinary works.

- [ ] **1.1** Init `backend/` project: `package.json`, install deps, `.gitignore`, `nodemon.json`, ESLint
- [ ] **1.2** Build `src/config/env.js` (validates required env at boot), `src/config/db.js`, `src/config/cloudinary.js`, `src/config/logger.js`
- [ ] **1.3** Build `src/utils/{ApiError,ApiResponse,asyncHandler,tokenGenerator,constants}.js`
- [ ] **1.4** Build `src/middlewares/{errorHandler,notFound,rateLimiter,validator,upload,authMiddleware,tokenMiddleware}.js`
- [ ] **1.5** Build models: `Admin`, `Candidate`, `Question`, `TestSession`, `Submission`
- [ ] **1.6** Build repositories (thin Mongoose wrappers) for all 5 models
- [ ] **1.7** Build `authService` + `authController` + `authRoutes` + `authValidator` (register gated, login, me)
- [ ] **1.8** Build `uploadService` (Cloudinary buffer upload)
- [ ] **1.9** Build `candidateService` + `candidateController` + `candidateRoutes` + `candidateValidator` (create issues token, list, detail, regen, delete)
- [ ] **1.10** Build `app.js` (helmet, cors, json, mongo-sanitize, rate limit, route mount, error handler) + `server.js`
- [ ] **1.11** Write unit test for `tokenGenerator` (uniqueness + expiry parsing)
- [ ] **1.12** Manual smoke test: register admin → login → create candidate → URL works → upload photo
- [ ] **1.13** `.env.example`, README quickstart, commit

### Phase 2 — Backend Test Flow + AI + Email
Question CRUD + AI generation, test session lifecycle, evaluation engine, AI fallback, email report, anti-cheat endpoint, submissions API.

**Deliverable:** Full backend ready for frontend integration. End-to-end candidate flow works via curl: validate → start → submit → evaluated → email sent.

- [ ] **2.1** `aiService` (Gemini primary, Grok fallback, prompts for question gen + descriptive eval, retry/timeout)
- [ ] **2.2** `questionService` + controller + routes + validator (CRUD, bulk, AI generate)
- [ ] **2.3** `evaluationService` (MCQ exact, multi-select set equality, one-line keyword/regex + AI fallback, descriptive AI scoring with rubric)
- [ ] **2.4** `testService` (validate, start session, submit, auto-submit, prevent multi-submission)
- [ ] **2.5** `testController` + `testRoutes` + `testValidator` (uses `tokenMiddleware`)
- [ ] **2.6** `emailService` + `templates/reportEmail.js` (Nodemailer SMTP, async, Logger on failure)
- [ ] **2.7** `submissionService` + controller + routes (admin list/detail)
- [ ] **2.8** `sockets/testSocket.js` (admin watches active sessions; emits cheat events) — optional, wire in `server.js`
- [ ] **2.9** `seed/seedAdmin.js` runnable via `npm run seed`
- [ ] **2.10** Unit test: `evaluationService` for each type
- [ ] **2.11** Integration test: full flow with mocked AI + mocked email
- [ ] **2.12** Update README with full API docs, commit

### Phase 3 — Frontend Admin Panel
Vite project, Redux store, Axios, routing, login, dashboard, candidate management, question management, submission viewing.

**Deliverable:** Admin can fully drive the system from a browser.

- [ ] **3.1** Init `frontend/` Vite + React, install deps, ESLint, base SCSS, env
- [ ] **3.2** Axios instance with interceptors, base URL from env, JWT injection, 401 handler
- [ ] **3.3** Redux store + `authSlice` (login, logout, me hydration from localStorage)
- [ ] **3.4** Routes: `AppRoutes` with `ProtectedRoute`, layouts (`AdminLayout` with sidebar/header)
- [ ] **3.5** Common components: `Button`, `Input`, `Modal`, `Loader`, `Toast`, `Table`
- [ ] **3.6** `LoginPage` + form validation + redirect on success
- [ ] **3.7** Dashboard (counts: candidates by status)
- [ ] **3.8** `CandidateListPage` + `CreateCandidateModal` (copy test URL, regen token, status badge)
- [ ] **3.9** `QuestionListPage` + `QuestionFormModal` + AI-generate flow (techStack/type/count)
- [ ] **3.10** `SubmissionListPage` + `SubmissionDetailPage` (per-question breakdown, photo, cheat reason)
- [ ] **3.11** SCSS theme (variables, mixins, modern minimal palette)
- [ ] **3.12** Manual smoke test against backend, commit

### Phase 4 — Frontend Candidate Flow
Token entry, photo capture (react-webcam + Cloudinary upload), test page with timer + dynamic question rendering + anti-cheat (tab/blur) auto-submit, submitted screen.

**Deliverable:** Full candidate experience polished, modern UI feel.

- [ ] **4.1** `PublicLayout` + `TestEntryPage` (parses token from URL, validates, shows candidate name/instructions)
- [ ] **4.2** `PhotoCapturePage` (react-webcam, capture, preview, upload, retry)
- [ ] **4.3** `testSlice` for session/answer state
- [ ] **4.4** `TestPage` with `Timer`, `QuestionRenderer` (handles all 4 question types)
- [ ] **4.5** `useAntiCheat` hook + `AntiCheatGuard` (visibilitychange, blur, contextmenu/copy optional) → triggers `/test/auto-submit`
- [ ] **4.6** Submission flow: confirm → POST → redirect to `SubmittedPage`
- [ ] **4.7** Resume guard: if status not `pending`/`in_progress`, show "already completed/expired/cheated" page
- [ ] **4.8** Polished SCSS (full-screen, mobile-aware, focus indicators, progress bar)
- [ ] **4.9** End-to-end manual test of complete flow (admin creates → candidate completes → email arrives → admin views submission)
- [ ] **4.10** Final README updates (env vars for both apps, run instructions, deployment notes), commit

---

## Implementation Notes (engineer must follow)

1. **No hardcoded URLs/keys** — everything through `config/env.js` (backend) and `import.meta.env.VITE_*` (frontend).
2. **Validation at boundaries** — every controller route has a Joi schema mounted via `validator` middleware. Service layer assumes inputs are clean.
3. **`asyncHandler` everywhere** — all controllers wrap with `asyncHandler` so `next(err)` is automatic.
4. **Repositories are dumb** — only Mongoose calls. Business logic lives in services.
5. **Token system** — `crypto.randomUUID()` + HMAC signature stored. Expiry stored on `Candidate.tokenExpiresAt`. Constant-time compare.
6. **One submission per candidate** — DB-level: `Submission.candidate` is unique. Service checks status before allowing start/submit.
7. **Anti-cheat** — frontend uses `document.visibilitychange` + `window.blur` (debounced 500ms to avoid devtools false positives). Single trigger calls `/test/auto-submit`. Backend marks session `cheated` and triggers grading on whatever's stored.
8. **AI calls** — wrap with timeout (8s) + try/catch. Gemini fail → Grok. Both fail → record `aiProvider: null` and fallback to keyword match (one-line) or zero score with `aiFeedback: 'evaluation unavailable'` (descriptive).
9. **Email failure must not fail submission** — fire-and-forget with logger.error on failure; expose retry endpoint later.
10. **Rate limits** — `auth/login` 5/min, `test/start` 1/min per token, `test/submit` 1/session.
11. **Helmet + mongo-sanitize + cors with whitelist** at app boot.
12. **Logger** — `winston` with separate streams; never log secrets or full tokens (mask).
13. **Tests** — unit on `evaluationService` and `tokenGenerator`; integration on full test flow with AI + email mocked.
14. **Commits** — at end of each numbered task; meaningful messages (`feat(backend): add candidate token issuance`).

---

## Self-Review Notes

- Spec sections covered: Admin auth ✓ (1.7), candidate create + unique token ✓ (1.9), token expiry 1h ✓ (constants), question CRUD + AI ✓ (2.1-2.2), question types (mcq/multi/one-line/descriptive) ✓ (2.3), candidate token validation ✓ (2.5), photo capture + upload ✓ (1.8 + 4.2), timer ✓ (4.4), tab/blur auto-submit ✓ (4.5), MCQ exact ✓ (2.3), descriptive AI ✓ (2.3 + 2.1), Gemini→Grok fallback ✓ (2.1), HR email report ✓ (2.6), centralized error handling ✓ (1.4), env vars ✓ (1.2), Joi validation ✓ (1.4), rate limiting ✓ (1.4), input sanitization ✓ (1.10), secure tokens ✓ (1.3), prevent multiple submissions ✓ (note 6), session state ✓ (Submission/TestSession models), feature-based frontend ✓ (structure), reusable components ✓ (3.5), loading/error states ✓ (Redux slices), protected routes ✓ (3.4), .env.example ✓ (1.13), README ✓ (4.10), API docs ✓ (2.12).
- No `TBD`/`TODO`/placeholder text in plan.
- Type consistency: `testToken`/`tokenExpiresAt`/`status` enum names used identically across model, service, and frontend slice.

---

## Execution

Proceeding with **inline execution** in the current session per phased build agreement. Each phase commits at meaningful checkpoints.
