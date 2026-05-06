# Interview Management System

Production-ready MERN application for running secure, AI-graded technical interviews:

- HR/Admin creates a candidate, sets the question count (default 10), and gets a secure test link (default 1-hour expiry)
- Candidate opens the link, captures a webcam photo, takes the test (questions shown one-by-one with prev/next + a live timer; default ~1.2 min/question)
- MCQ / multi-select / one-line questions are auto-graded; descriptive answers are evaluated by **Gemini** (chained 2.5-flash → 2.5-flash-lite → 2.0-flash → 2.0-flash-lite) with **Groq** Llama fallback (`llama-3.3-70b-versatile` → `llama-3.1-8b-instant`)
- If AI question generation fails entirely, the system falls back to HR-curated manual questions for the same tech stack
- Switching tabs or losing window focus auto-submits and flags the session
- HR receives an email report with score, breakdown, and AI feedback

## Repository layout

```
.
├── backend/      # Node + Express + MongoDB (layered architecture)
├── frontend/     # React + Vite + Redux Toolkit + SCSS
└── docs/
    └── superpowers/plans/
```

## Quickstart

### 1. Backend

```bash
cd backend
cp .env.example .env
# fill in MONGODB_URI, JWT_SECRET, TEST_TOKEN_SECRET, CLOUDINARY_*, GEMINI_API_KEY, SMTP_*
npm install
npm run seed   # creates the bootstrap admin from SEED_ADMIN_*
npm run dev    # http://localhost:5000
npm test       # runs the unit tests (token, evaluation)
```

Health check: `GET http://localhost:5000/api/v1/health`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# set VITE_API_BASE_URL to your backend (default http://localhost:5000/api/v1)
npm install
npm run dev    # http://localhost:5173
```

Login at `/login` with the seeded admin credentials, then create candidates.

## Environment variables

See [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example).

Required to actually run end-to-end:

| Variable | Where | Notes |
| -------- | ----- | ----- |
| `MONGODB_URI` | backend | Local Mongo or Atlas |
| `JWT_SECRET` | backend | 32+ random chars |
| `TEST_TOKEN_SECRET` | backend | 32+ random chars (HMAC for candidate links) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | backend | Photo upload |
| `GEMINI_API_KEY` | backend | Primary AI provider (chained models) |
| `GROQ_API_KEY` | backend | Fallback AI provider (Groq Llama models) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | backend | HR report delivery |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_HR_EMAIL` | backend | First admin + report recipient |
| `VITE_API_BASE_URL` | frontend | Points to backend `/api/v1` |
| `FRONTEND_URL` | backend | Used to compose candidate test URLs |

## Architecture

### Backend (layered)

- **controllers/** thin Express handlers, wrapped with `asyncHandler`
- **services/** all business logic (auth, candidate, question, test, evaluation, AI, email, upload, submission)
- **repositories/** Mongoose calls only — no business rules
- **models/** Admin, Candidate, Question, TestSession, Submission
- **middlewares/** auth (JWT), tokenMiddleware (candidate test token), Joi validator, rate limit, multer upload, error handler
- **utils/** ApiError, ApiResponse, asyncHandler, jwt, tokenGenerator (UUID + HMAC), constants

### Frontend (feature-based)

- **features/auth, candidates, questions, submissions, test, dashboard** — slice + pages co-located
- **components/common/** Button, Input, Modal, Loader, Toast, EmptyState, ProtectedRoute, StatusBadge
- **layouts/** AdminLayout (sidebar) and PublicLayout (candidate flow)
- **api/** Axios instance with JWT interceptor + per-test-token client
- **app/store.js** Redux Toolkit store
- **styles/** SCSS variables/mixins, auto-injected via Vite preprocessor

## API documentation

Base path: `/api/v1`. See [`backend/README.md`](backend/README.md) for full route table.

## Anti-cheat & security

- Helmet, CORS allowlist, `express-mongo-sanitize`, JSON 1 MB limit, rate limits per route
- Bcrypt 12 rounds, JWT signed with `JWT_SECRET`, candidate tokens are UUID + HMAC-SHA256 with constant-time compare
- One submission per candidate (DB-level unique on `Submission.candidate`)
- Frontend: `visibilitychange` + `blur` listeners (debounced) trigger `/test/auto-submit` → backend marks session as `cheated` and emails the report
- Photo upload: memory storage only, JPEG/PNG/WEBP, 5 MB max, immediately streamed to Cloudinary

## Tests

```bash
cd backend && npm test
```

Covers `tokenGenerator` (uniqueness, signature, timing-safe verify) and `evaluationService` (mcq exact, multi-select set + partial credit, one-line keyword matching, descriptive AI scoring path).

## Implementation plan

Detailed phased plan in [`docs/superpowers/plans/2026-05-06-interview-management-system.md`](docs/superpowers/plans/2026-05-06-interview-management-system.md).
