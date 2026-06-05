# Project Setup & Branching Guide

Single source of truth for how this project is structured, how the branches work,
and how to run it locally. If anyone (including the AI assistant) forgets the
workflow, read this file.

Last updated: 2026-06-05.

---

## 1. Repositories (two SEPARATE repos)

The app was originally a monorepo (both apps in one repo). It is now split into
two independent repos, each holding only its own code at the repo root.

| Part | GitHub repo | Local folder | Stack |
| --- | --- | --- | --- |
| Backend | `harsh041711/interview-management-backend` | `c:\Users\Tops\Desktop\Inteview_management\interview-management-backend` | Node.js + Express + MongoDB |
| Frontend | `harsh041711/interview-management-frontend` | `c:\Users\Tops\Desktop\Inteview_management\interview-management-frontend` | React + Vite + Redux |

Backend talks to the frontend via CORS; frontend calls the backend at
`http://localhost:5000/api/v1` and Socket.io at `http://localhost:5000`.

---

## 2. Branching strategy (IMPORTANT)

Each repo uses the same two-branch flow:

- **`production`** — stable / latest released code. **Never commit directly here.**
- **`staging`** — the working/development branch. **Do all day-to-day work here.**

Local folders are normally checked out on **`staging`**.

### Daily work (on `staging`)
```bash
# already on staging
git add -A
git commit -m "your message"
git push
```

### Promote staging -> production (when tested and ready)
Run in EACH repo you changed:
```bash
git checkout production
git pull
git merge staging
git push
git checkout staging   # go back to the working branch
```

### Backup of the original combined code
The full monorepo (backend + frontend together, plus the design/implementation
specs under `docs/superpowers/`) is preserved and NOT lost:
- Remote branch `origin/dev-clean-2026-05-13` (exists on both repos).
- Local branch `local-dev` in the backend folder.

Other branches (`main`, `dev`, `phase-3`, `phase-4`, …) are the original author's
history and are left untouched.

---

## 3. Local environment / prerequisites

- Node.js 20.x, npm 10.x
- MongoDB running locally at `mongodb://127.0.0.1:27017/interview_management`
- Docker Desktop (only for the coding-test sandbox — see Piston below)

### Corporate network TLS note (why HTTPS calls work)
The corporate network does SSL inspection, so Node/npm reject outbound HTTPS by
default (`UNABLE_TO_VERIFY_LEAF_SIGNATURE` / "unable to verify the first certificate").
Fixes already applied on this machine:
- `corp-ca-bundle.pem` (exported Windows root CAs) at
  `c:\Users\Tops\Desktop\Inteview_management\corp-ca-bundle.pem`.
- Backend `nodemon.json` has an `env.NODE_EXTRA_CA_CERTS` pointing at that bundle
  (local, uncommitted edit — keep it).
- A persistent User env var `NODE_EXTRA_CA_CERTS` points at the same bundle.
- `npm config set strict-ssl false` (global).

If the project folder moves, update the bundle path in `nodemon.json` and the
`NODE_EXTRA_CA_CERTS` user env var.

---

## 4. Environment files (.env — gitignored, never committed)

### Backend (`interview-management-backend/.env`)
Key values currently configured:
- `MONGODB_URI=mongodb://127.0.0.1:27017/interview_management`
- `JWT_SECRET`, `TEST_TOKEN_SECRET` (dev secrets)
- AI: `GEMINI_API_KEY`, `GROQ_API_KEY`
- Cloudinary: cloud `dhbmwxk1s` + API key + secret (resume/photo upload)
- SMTP (email): `harsh@topsinfosolutions.com` with a Gmail app password
- Google Calendar OAuth: `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
- Piston: `PISTON_URL=http://localhost:2000/api/v2/execute`
- Admin bootstrap: `SEED_ADMIN_EMAIL=admin@example.com` / `SEED_ADMIN_PASSWORD=ChangeMe@123`

### Frontend (`interview-management-frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
VITE_DEV_PORT=5173
VITE_APP_NAME=Interview Management
```

`.env.example` in each repo documents all keys.

---

## 5. Coding-test sandbox (Piston, Docker)

The MCQ/coding test executes candidate code via a self-hosted Piston container.
- Container: `piston_api` on port `2000`, persistent volume `piston_data`.
- Runtimes installed: **Python 3.12.0, JavaScript (Node 20.11.1), PHP 8.2.3**
  (the 3 languages the coding test supports).
- After a reboot, just start it (runtimes persist):
  ```bash
  docker start piston_api
  ```
- First-time / re-create:
  ```bash
  docker run -d --name piston_api --privileged -p 2000:2000 -v piston_data:/piston ghcr.io/engineer-man/piston
  # then install runtimes via POST http://localhost:2000/api/v2/packages
  ```

---

## 6. How to run the app locally

Startup order after a reboot:
1. Start the MongoDB service.
2. `docker start piston_api` (for coding tests).
3. Backend, then frontend (below).

### Backend (port 5000)
```bash
cd interview-management-backend
npm install        # first time only
npm run seed       # first time only — creates the bootstrap admin
npm run dev        # nodemon, http://localhost:5000
```
Health check: `GET http://localhost:5000/api/v1/health` -> `{ "status": "ok" }`.
Tests: `npm test` (Jest unit suite).

### Frontend (port 5173)
```bash
cd interview-management-frontend
npm install        # first time only
npm run dev        # Vite, http://localhost:5173
```

### Admin login
- Email: `admin@example.com`
- Password: `ChangeMe@123`

---

## 7. What the app does (high level)

Interview Management System. Pipeline: create candidate (from a Job Description)
-> resume upload + AI screening against the JD -> approve (shortlist email) ->
MCQ test -> coding test (Piston) -> prompt test -> Round-2 interview scheduling
(Google Calendar/Meet) -> reviews. Admin auth via JWT; candidate test access via
signed tokens; live proctoring via Socket.io.

### Recent feature work (JD-driven candidate creation)
Candidate creation is driven by selecting a Job Description (the JD provides the
tech stack + experience); resumes are screened against the linked JD; the MCQ
test config (questions/duration/tech stack) is chosen at the "Send test" step via
a dedicated modal. Full design + implementation specs live on the monorepo backup
branches under `docs/superpowers/specs/` and `docs/superpowers/plans/`
(`2026-06-05-jd-driven-candidate-creation*`).

---

## 8. Commit conventions

- Do **not** add a `Co-Authored-By: Claude` / "Generated with" trailer to commits.
- Conventional-commit style messages (`feat(...)`, `fix(...)`, `docs:`, `chore:`).
