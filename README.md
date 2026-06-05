# Interview Management — Backend

Node.js + Express + MongoDB API for the Interview Management System. Layered architecture (controllers → services → repositories → models), JWT for admin auth, signed UUID test tokens for candidates, Gemini (primary) + Grok (fallback) for AI evaluation, Cloudinary for photo storage, Nodemailer for HR reports, Socket.io for live proctor signals.

## Phase 2

Phase 2 adds the full Round 2 interview lifecycle on top of Phase 1's assessment pipeline. Phase 2A added the `Interviewer` CRUD foundation and outcome emails. Phase 2B adds `Interview` and `RescheduleRequest` models, the scheduling service (shortlisted-only, active-interviewer, no-overlap guards), a token-based public API for candidate and interviewer views, a reschedule request/approve/reject loop, and four new email templates (scheduled, reschedule-requested, reschedule-approved, reschedule-rejected). `candidateService.remove` now cascades to interviews and their reschedule requests; `interviewerService.remove` blocks when active interviews exist. The email system now covers **9 templates total** (2 from Phase 1 + 3 from Phase 2A + 4 from Phase 2B): invite and HR report (Phase 1), Round 1 shortlisted, rejected, and disqualified (Phase 2A), plus interview scheduled, reschedule requested, approved, and rejected (Phase 2B). The interview token secret is controlled by `INTERVIEW_TOKEN_SECRET` (falls back to `TEST_TOKEN_SECRET` if unset).

## Requirements

- Node.js >= 18
- MongoDB (local or Atlas)
- Cloudinary account
- Gemini API key (and optionally Grok)
- SMTP credentials for outbound email

## Setup

```bash
cp .env.example .env
# fill credentials in .env
npm install
npm run seed   # creates the bootstrap admin from SEED_ADMIN_*
npm run dev    # starts on http://localhost:5000
```

Health check: `GET /api/v1/health`.

## Scripts

| Script        | Purpose                            |
| ------------- | ---------------------------------- |
| `npm run dev` | Start server with nodemon          |
| `npm start`   | Production start                   |
| `npm run seed`| Create initial admin from env vars |
| `npm test`    | Run unit + integration tests       |
| `npm run lint`| Lint `src/**/*.js`                 |

## Architecture

```
src/
├── config/        # env loader, DB, cloudinary, logger
├── models/        # Mongoose schemas
├── repositories/  # thin DB layer (no business logic)
├── services/      # business logic (auth, candidate, question, test, evaluation, ai, email, upload, submission)
├── controllers/   # express handlers
├── routes/        # routers mounted under /api/v1
├── middlewares/   # auth, token, error, rate-limit, validator, upload, notFound
├── validators/    # Joi schemas per resource
├── utils/         # ApiError, ApiResponse, asyncHandler, jwt, tokenGenerator, constants
├── sockets/       # Socket.io proctor channel
├── templates/     # report email HTML/text builder
├── seed/          # admin bootstrap
└── server.js      # http + socket bootstrap
```

## API (base path `/api/v1`)

### Auth (admin)

| Method | Path             | Body                                   | Auth |
| ------ | ---------------- | -------------------------------------- | ---- |
| POST   | `/auth/register` | `{name,email,password,hrNotificationEmail?}` | gated by `ALLOW_ADMIN_REGISTER` |
| POST   | `/auth/login`    | `{email,password}`                     | none |
| GET    | `/auth/me`       | —                                      | Bearer JWT |

### Candidates (admin)

| Method | Path                              | Description |
| ------ | --------------------------------- | ----------- |
| POST   | `/candidates`                     | Create candidate, returns `testToken` + `testUrl` |
| GET    | `/candidates`                     | List with `?page&limit&status&search&techStack` |
| GET    | `/candidates/stats`               | Status counts |
| GET    | `/candidates/:id`                 | Full candidate + linked submission |
| POST   | `/candidates/:id/regenerate-token`| New token & expiry (only if test not started); re-sends invite |
| POST   | `/candidates/:id/resend-invite`   | Re-send the existing invite email to the candidate |
| DELETE | `/candidates/:id`                 | Hard delete |

### Questions (admin)

| Method | Path                  | Description |
| ------ | --------------------- | ----------- |
| POST   | `/questions`          | Single create (mcq, multi_select, one_line, descriptive) |
| POST   | `/questions/bulk`     | Bulk create |
| POST   | `/questions/generate` | AI generate `{techStack,count?,types?,difficulty?,persist?}` |
| GET    | `/questions`          | List with `?techStack&type&difficulty&page&limit` |
| PUT    | `/questions/:id`      | Update |
| DELETE | `/questions/:id`      | Delete |

### Test (candidate, public — `x-test-token` header)

| Method | Path                | Description |
| ------ | ------------------- | ----------- |
| GET    | `/test/validate`    | Validate token + return prefill |
| POST   | `/test/photo`       | multipart `photo` |
| POST   | `/test/start`       | Generate session, return sanitized questions |
| POST   | `/test/submit`      | Submit answers, evaluate, email report |
| POST   | `/test/auto-submit` | Anti-cheat trigger; locks session |

### Interviewers (admin)

| Method | Path                | Description |
| ------ | ------------------- | ----------- |
| POST   | `/interviewers`     | Create interviewer |
| GET    | `/interviewers`     | List with `?page&limit&search&isActive` |
| GET    | `/interviewers/:id` | Detail |
| PUT    | `/interviewers/:id` | Update (name, email, expertise, notes, isActive) |
| DELETE | `/interviewers/:id` | Delete (blocked if active interviews exist) |

### Interviews — admin (`/interviews`)

All routes require Bearer JWT.

| Method | Path                               | Description |
| ------ | ---------------------------------- | ----------- |
| POST   | `/interviews`                      | Schedule a Round 2 interview (candidate must be shortlisted, interviewer must be active, no overlap) |
| GET    | `/interviews`                      | List with `?page&limit&status&candidateId&interviewerId&from&to` |
| GET    | `/interviews/:id`                  | Detail + pending reschedule + full history |
| PUT    | `/interviews/:id`                  | Update fields (scheduledAt, durationMinutes, meetingUrl, notes) |
| POST   | `/interviews/:id/cancel`           | Cancel with optional reason |
| POST   | `/interviews/:id/complete`         | Complete with optional note |
| POST   | `/interviews/:id/reschedule-decision` | Approve or reject pending reschedule request |

### Interview — public token-based (`/interview`)

Pass the access token via `x-interview-token` header or `?token=` query param.

| Method | Path                  | Description |
| ------ | --------------------- | ----------- |
| GET    | `/interview/details`  | View interview details for the token holder (candidate or interviewer) |
| POST   | `/interview/reschedule` | Interviewer submits a reschedule request (rate-limited 3/min) |

### Submissions (admin)

| Method | Path                                         | Description |
| ------ | -------------------------------------------- | ----------- |
| GET    | `/submissions`                               | List with `?candidateId&page&limit` |
| GET    | `/submissions/:id`                           | Detail with populated answers |
| GET    | `/submissions/by-candidate/:candidateId`     | Detail by candidate |

## Anti-cheat

- Frontend listens to `visibilitychange` + `blur` and POSTs `/test/auto-submit`.
- Server marks the session as `cheated`, candidate as `cheated`, scores remaining answers, emails the HR report immediately.
- `Submission.candidate` is unique → one submission per candidate, no double-grade.

## Evaluation

| Type           | Strategy |
| -------------- | -------- |
| `mcq`          | Exact string match |
| `multi_select` | Set equality with partial credit (`(tp - fp) / |correct|`) |
| `one_line`     | Normalize → exact, substring, or keyword (>= 50% match) |
| `descriptive`  | Gemini (fallback Groq) returns `{score, feedback, isCorrect}` |

## AI fallback chains

Both question generation and descriptive evaluation walk through this chain in order, advancing on rate limits / 5xx / unavailable models:

1. **Gemini** (`GEMINI_API_KEY`)
   - `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash` → `gemini-2.0-flash-lite`
2. **Groq** (`GROQ_API_KEY`) — fully OpenAI-compatible at `https://api.groq.com/openai/v1`
   - `llama-3.3-70b-versatile` → `llama-3.1-8b-instant`

If the entire chain is exhausted:
- **Question generation** falls back to HR-curated manual questions for the same tech stack (response includes `source: 'manual_fallback'`).
- **Descriptive evaluation** scores 0 with `aiFeedback: 'Evaluation unavailable…'`. The HR report still sends.

## Security

- Helmet + CORS allowlist + `express-mongo-sanitize` + JSON body limit 1 MB.
- Rate limits: global, per-route login (5/min), test start (3/min).
- Bcrypt 12 rounds, JWT signed with `JWT_SECRET`, candidate tokens are UUID + HMAC-SHA256 with constant-time compare.
- File uploads: memory storage, 5 MB max, JPEG/PNG/WEBP only.

## Tests

```bash
npm test
```

Unit tests cover `tokenGenerator`, `interviewToken`, `evaluationService`, `round1Outcome`, and `interviewService` (31 tests total).
