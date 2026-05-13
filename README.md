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

## Prerequisites

| Tool | Why | Tested with |
| ---- | --- | ----------- |
| **Node.js ≥ 18** | Backend + frontend dev servers | 20.x |
| **MongoDB ≥ 6** | Application database (system service or container) | 7.0 |
| **Docker** | Hosts the Piston code-execution sandbox for the coding test (Phase 5) | Docker Desktop / Docker CE |
| **Google Cloud OAuth client** *(optional)* | Required only if you want auto-generated Google Meet links + Calendar events when scheduling interviews | OAuth 2.0 Web client |

## Quickstart (first-time setup)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill in at minimum: MONGODB_URI, JWT_SECRET, TEST_TOKEN_SECRET, INTERVIEW_TOKEN_SECRET,
# CLOUDINARY_*, GEMINI_API_KEY, SMTP_*, SEED_ADMIN_*
# (PISTON_URL and GOOGLE_OAUTH_* can be left at defaults / blank for now.)
npm install
npm run seed   # creates the bootstrap admin from SEED_ADMIN_*
npm run dev    # http://localhost:5000
npm test       # runs the unit suite (133 tests)
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

Login at `/login` with the seeded admin credentials.

### 3. Piston (code-execution sandbox — needed for the coding test)

The public `emkc.org` Piston API went whitelist-only in Feb 2026, so the coding test
runs against a **self-hosted Piston Docker** instance on port 2000.

```bash
# One-time: pull, run, and persist a Piston container
docker run --privileged -d \
  --name piston_api \
  -v piston_data:/piston \
  -p 2000:2000 \
  ghcr.io/engineer-man/piston

# Install the three language runtimes (each takes 10–60s)
curl -X POST http://localhost:2000/api/v2/packages \
  -H 'Content-Type: application/json' -d '{"language":"node","version":"20.11.1"}'
curl -X POST http://localhost:2000/api/v2/packages \
  -H 'Content-Type: application/json' -d '{"language":"python","version":"*"}'
curl -X POST http://localhost:2000/api/v2/packages \
  -H 'Content-Type: application/json' -d '{"language":"php","version":"*"}'

# Smoke test
curl -s http://localhost:2000/api/v2/runtimes
```

`PISTON_URL` in `backend/.env` should point at `http://localhost:2000/api/v2/execute`
(the default value in `.env.example`).

### 4. Google Calendar integration (optional)

If you want the Schedule Interview modal to auto-generate Meet links and Calendar invites:

1. In [Google Cloud Console](https://console.cloud.google.com) → enable the Google Calendar API.
2. Create an **OAuth 2.0 Client (Web application)**. Add this exact redirect URI:
   `http://localhost:5000/api/v1/integrations/google/callback`
3. Configure the OAuth consent screen with these scopes:
   `auth/calendar.events`, `auth/userinfo.email`, `auth/userinfo.profile`
4. Copy the client ID + secret into `backend/.env`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   ```
5. Restart the backend, then in the app go to **Settings → Connect Google Calendar**.

If you skip this, the Schedule modal automatically falls back to manual URL paste.

## Daily startup (after the first-time setup)

After a reboot or fresh shell, in this order:

```bash
# 1. MongoDB (skip if it's a systemd auto-start)
sudo systemctl start mongod

# 2. Docker Desktop (or Docker daemon) — start manually
docker start piston_api          # the runtimes persist on the piston_data volume

# 3. Backend
cd /path/to/Interview\ management/backend && npm run dev

# 4. Frontend
cd /path/to/Interview\ management/frontend && npm run dev
```

Quick "is everything up?" probe:

```bash
curl -s http://localhost:5000/api/v1/health                # backend → {"success":true,...}
curl -s http://localhost:2000/api/v2/runtimes | head -c 60 # piston  → [{"language":"javascript",...
curl -sI http://localhost:5173 | head -1                   # frontend → HTTP/1.1 200 OK
```

Stopping everything: Ctrl+C in the npm terminals, plus `docker stop piston_api` if you want.
The `piston_data` Docker volume persists the installed runtimes across restarts, so you
don't need to re-install Node/Python/PHP after a stop/start.

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
| `PISTON_URL` | backend | Code-execution sandbox. Default `http://localhost:2000/api/v2/execute` for the self-hosted Docker container (see Quickstart §3). |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | backend | Optional — only needed to enable auto-generate Google Meet + Calendar events in the Schedule Interview modal. See Quickstart §4. |

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

## Phase 2 — Interview Process

Phase 2 extends the system with the full post-Round-1 workflow.

### Round 1 outcome emails

After a candidate submits (or auto-submits), the system immediately grades the test and fires one of three emails:

- **Shortlisted** (`candidate.status = shortlisted`) — score ≥ 50%, no cheating detected. Candidate is congratulated and told to expect further contact.
- **Rejected** (`candidate.status = rejected`) — score < 50%, no cheating. Polite rejection email.
- **Disqualified** (`candidate.status = cheated`) — cheat flag set (tab-switch auto-submit). Test-invalidated notice; no Round 2 eligibility.

### Interviewer roster

HR manages a list of interviewers (name, email, expertise tags). Interviewers have no login; they interact entirely via tokenized email links. Inactive interviewers are hidden from the scheduling picker but not deleted.

### Round 2 scheduling

HR schedules a Round 2 interview for a shortlisted candidate: picks an interviewer, sets a date/time, duration, meeting URL (Zoom / Meet / Teams), and optional notes. The system generates two unique access tokens — one for the candidate, one for the interviewer — and emails both parties a link to their personalized view page.

### Reschedule loop

The interviewer can request a reschedule from their view page (propose a new time + optional reason). HR sees the pending request in the admin panel and approves or rejects it. On approval, the scheduled time updates and both parties receive a re-notification email. On rejection, the original time stands and the interviewer is notified. HR can also directly edit a `scheduled` interview's time (blocked while a reschedule is pending), or mark an interview `completed` or `cancelled`.

### Public interview view — `/interview/:token`

Each party's tokenized URL opens `/interview/:token` — a public page (no login required, separate from the candidate test flow at `/test/:token`). The page shows:

- The scheduled date/time as the headline, with duration and status badge
- Both parties' names side-by-side
- A **Join meeting** button that opens the external meeting URL in a new tab (hidden once the interview is completed or cancelled)
- For the interviewer: an optional HR notes block (if notes were attached when scheduling)
- For the interviewer: a collapsible **Request reschedule** form when the status allows it
- A pending-reschedule banner visible to both parties while HR review is in progress
- A friendly locked-state card (no join button) when the interview is `completed` or `cancelled`

## Phase 3 — Interviewer Portal

Phase 3 adds first-class authentication and a dashboard for interviewers, structured ratings, an HR-mediated edit loop, and HR's final Select/Reject decision after Round 2.

### Interviewer authentication

Interviewers no longer interact via tokenized email links alone. HR creates an interviewer (or clicks **Send setup link** on an existing one), which sends a one-time magic-link email. The interviewer clicks through, sets a password, and from then on logs in at the same `/login` page as HR. The JWT carries a `role` claim (`admin` | `interviewer`); login redirects route by role: HR → `/dashboard`, interviewer → `/interviewer/dashboard`. **Forgot-password** at `/forgot-password` reuses the same magic-link mechanism.

For backwards compatibility, the Phase 2 tokenized `/interview/:token` page is preserved for any in-flight Round 2s scheduled before Phase 3. New Round 2 emails sent to interviewers point at the dashboard URL instead — and if the interviewer has not yet set a password, the same email also embeds the setup magic link inline (lazy fallback).

### Interviewer dashboard

`/interviewer/dashboard` shows two sections: **Upcoming** and **Past**. Each past row carries a small badge: **Reviewed**, **Edit pending**, or **Pending review**. Clicking through opens `/interviewer/interviews/:id` with all the interview details, the candidate's resume download (if HR uploaded one), the **Join meeting** CTA while still scheduled, and the review form.

### Reviews

After an interview is marked `completed`, the assigned interviewer submits a review with three 5-star ratings (Knowledge, Communication, Confidence) and a comments block (10–2000 chars). Submitting auto-transitions the candidate from `shortlisted` → `awaiting_decision` and emails HR with the ratings preview.

### Edit-permission loop

Reviews are immutable after submission unless HR explicitly grants edit permission via a **Request edit** flow that mirrors Phase 2's reschedule loop:

1. Interviewer clicks **Request edit** on the review (with optional reason)
2. HR sees pending requests at `/admin/review-edit-requests` with inline **Approve** / **Reject**
3. On approve, the interviewer can edit the review **once**; the approval is consumed by their next save
4. On reject, the original review stands. Both decisions email the interviewer; the edit itself emails HR with the updated ratings

### HR final decision

When HR opens a candidate in `awaiting_decision`, they see the review panel inline (3 stars + average + comments + edit-request history) plus two action buttons:

- **Select** — sets `candidate.status = selected_for_culture`, emails the candidate "advanced to the final culture-fit round"
- **Reject** — sets `candidate.status = final_rejected`, emails the candidate a polite "not moving forward" message (with optional HR note)

Both decisions are terminal.

### Question bank — experience tagging (3D)

Candidates and questions both gain an `experience` field (entry / mid / senior; questions also support `any` for catch-all). The Round 1 sampler now filters by candidate experience and biases toward least-used questions via a `timesUsed` counter atomically incremented when a question is sampled. This spreads the question pool across same-stack/same-experience candidates without strict per-candidate tracking.

Run `npm run migrate:phase3` once after deploy to backfill the new fields on existing candidates (`experience='mid'`) and questions (`experience='any'`, `timesUsed=0`).

## Implementation plan

Phased plans in [`docs/superpowers/plans/`](docs/superpowers/plans/) — Phase 1+2 design from 2026-05-06, Phase 3 (interviewer portal) and Phase 3D (question shuffling) from 2026-05-07.
