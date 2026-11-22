# JobPulse

[![CI](https://github.com/Raisul516/jobpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/Raisul516/jobpulse/actions/workflows/ci.yml)

Personal job-intelligence and alert app for Bangladesh. See [documentation/roadmap.md](documentation/roadmap.md) for the plan.

| Folder | What it is |
|---|---|
| `frontend/` | Next.js web app (port 3000) |
| `backend/` | Express + TypeScript REST API (port 4000) |
| `ai-service/` | Python + FastAPI: reads CVs and makes embeddings (port 8000, this computer only) |
| `documentation/` | Plan and decisions |
| `docker-compose.yml` | PostgreSQL database for development (port 5433) |

## First-time setup

1. Copy `.env.example` → `.env` (root) and `backend/.env.example` → `backend/.env`; use the same password in both.
2. Start the database: `docker compose up -d`
3. Backend: `cd backend`, `npm install`, `npm run db:migrate`, `npm run db:seed`
4. Frontend: `cd frontend`, `npm install`

5. AI service (Python 3.12+):
   ```
   cd ai-service
   py -m venv .venv
   .venv\Scripts\python -m pip install -r requirements.txt
   ```
   The embedding model (~220 MB) downloads automatically the first time it's used.

## Every day

- `docker compose up -d` (database)
- `cd backend` → `npm run dev`
- `cd frontend` → `npm run dev`, then open http://localhost:3000
- `cd ai-service` → `.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` (needed for CV upload and CV matching; everything else works without it)
- AI service tests: `cd ai-service` → `.venv\Scripts\python -m pytest`

## Login

- The first time you open the site it asks you to **create your account** (email + password, at least 10 characters). Your existing CV, preferences and saved jobs are kept and linked to it. After that, sign-up is closed: it's a one-person app.
- Passwords are stored as scrypt hashes. A login lasts 30 days in an HttpOnly cookie; only a hash of the session token is kept in the database.
- 10 wrong passwords from one IP in 15 minutes → login is blocked for 15 minutes (restart the backend to clear it).
- Forgot your password? Reset to the "create account" screen:
  `docker exec jobplse-db-1 psql -U jobpulse -d jobpulse -c "UPDATE users SET password_hash=NULL WHERE id=1; DELETE FROM sessions;"`
- When deployed behind HTTPS, set `NODE_ENV=production` (or `COOKIE_SECURE=true`) in `backend/.env` so the cookie is only sent over HTTPS.

## Deploy (free)

| Part | Where | Notes |
|---|---|---|
| Database | [Neon](https://neon.tech) (free) | Postgres with pgvector + pg_trgm. Use the **pooled** connection string. |
| AI service | [Hugging Face Spaces](https://huggingface.co/spaces) (free CPU, Docker) | `ai-service/Dockerfile`. Copied there by `.github/workflows/deploy-ai-space.yml`. |
| Backend | [Render](https://render.com) (free) | `render.yaml` blueprint. Runs migrations on every start. |
| Website | [Vercel](https://vercel.com) (free) | Root directory `frontend`, env `BACKEND_URL`. `/api/*` is forwarded to the backend, so the login cookie stays on the website's own address. |
| Keep awake | GitHub Actions | `.github/workflows/keep-awake.yml` pings the backend and AI service every 10 minutes (free Render sleeps after 15 min). |

Settings, in one place:
- **Hugging Face Space** → Settings → Secrets: `AI_SERVICE_TOKEN` (any long random string) and `LLM_API_KEY` (your Gemini key, for the AI features).
- **Render**: `DATABASE_URL` (Neon), `AI_SERVICE_URL` (`https://<hf-name>-<space-name>.hf.space`), `AI_SERVICE_TOKEN` (same string), `VAPID_*` (same as `backend/.env`).
- **Vercel**: `BACKEND_URL` = the Render address (`https://jobpulse-api.onrender.com`).
- **GitHub repo** → Settings → Secrets and variables → Actions: variables `BACKEND_URL`, `AI_SERVICE_URL`, `HF_SPACE` (`<hf-name>/<space-name>`), secret `HF_TOKEN` (Hugging Face token with write access).

Limits of the free setup: the first request after a sleep can take ~1 minute; GitHub may pause scheduled workflows after 60 days without commits (re-enable in the Actions tab).

## AI answers (RAG)

JobPulse uses RAG (Retrieval-Augmented Generation): the backend **finds** the right facts in your own database (jobs closest in meaning via pgvector, your CV profile, the match and eligibility checks), and only those are given to an LLM, which **writes** the answer. The LLM never sees the rest of the database and may only recommend jobs it was given.

- **Ask JobPulse** (http://localhost:3000/ask): ask in English, Bangla or Banglish, e.g. "Dhakay fresher der jonno kon software job ache?". Recommended jobs are shown under the answer.
- **Explain with AI** on every job page: what in your CV matches, what's missing, and a tip for applying (cached, so asking again costs nothing).
- Setup: get a free key at https://aistudio.google.com/apikey, copy `ai-service/.env.example` to `ai-service/.env` and set `LLM_API_KEY`, then restart the AI service. Without a key everything else still works; these two features say they are off.
- Any OpenAI-compatible provider works (`LLM_BASE_URL`, `LLM_MODEL`), e.g. Groq.
- Max 20 AI answers per 10 minutes, to stay inside free limits.
- Privacy: the question, the job texts and your CV profile (skills, education, experience, summary — not your name or date of birth) are sent to the LLM provider. Free tiers may use data to improve their models.

## End-to-end tests (real browser)

`e2e/` uses Playwright: it creates a **separate** database `jobpulse_e2e` (your real data is never touched), starts a test backend on port 4100 and a production build of the website on 3100, then Chromium creates an account, filters and saves jobs, checks the AI pages fail politely without an AI service, and logs out and in.

```
cd e2e
npm install
npx playwright install chromium   # first time only
npm test                          # needs the Docker database running
```

The same tests run on GitHub CI (job "End-to-end").

## Useful backend commands

| Command | Does |
|---|---|
| `npm run db:generate` | Create a new migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database |
| `npm run db:seed` | Reset demo jobs (only rows marked `is_demo`) |
| `npm run db:studio` | Browse the database in your browser |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run unit tests (parser, URL safety) |

## API

- `GET /api/health` (open; every other `/api` route needs you to be logged in)
- `GET /api/auth/status`, `POST /api/auth/setup`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/jobs?search=&location=&jobType=&category=&sort=` — `sort`: `newest`, `deadline`, `salary-high`, `salary-low`. Expired jobs are hidden.
- `GET /api/jobs/locations`
- `GET /api/jobs/similar?title=&company=` — open jobs that may be the same vacancy
- `GET /api/jobs/:id`

### AI (RAG)

- `POST /api/ai/ask` `{ question }` → `{ answer, model, recommended, jobs }`
- `POST /api/ai/explain/:jobId` → `{ text, model, cached }`

### CV profile (web page: http://localhost:3000/profile)

Free and private: no AI API, nothing leaves the computer.
1. Upload a PDF/DOCX CV → the ai-service reads the text and finds name, date of birth, skills, education, experience and summary **by rules** (`ai-service/app/cv_parser.py`, skill list in `skills.py`).
2. The result is a **draft**. Nothing is used until you check it and press *Confirm profile*.
3. On confirm, the profile is turned into an embedding (`paraphrase-multilingual-MiniLM-L12-v2`, understands Bangla) and compared with every job's embedding (pgvector).

- `GET /api/profile`, `POST /api/profile/cv` (multipart field `cv`, max 5 MB), `PUT /api/profile`, `DELETE /api/profile` (deletes profile and all uploaded CV text)
- Jobs get embeddings in the background (on startup, every 10 minutes, and after each collection) when the ai-service is running.

### Preferences and matching (web page: http://localhost:3000/preferences)

- `GET /api/preferences` / `PUT /api/preferences` — keywords, excluded title words, categories, job types, locations, minimum salary, match threshold (default 70%), notifications on/off
- Every job in `GET /api/jobs` gets `match: { score, passesFilters, isMatch, reasons }` once preferences are set. Add `matchesOnly=true` and/or `sort=best-match`.
- **Filters are separate from the score**: a job that fails a filter is never a match, whatever its score.
- The score is a weighted average of the parts you have: your keywords (40%), similarity to your CV (35%), your CV skills found in the job (25%). Keyword in the title = 70, each extra title keyword +15, each description-only keyword +5. CV similarity: cosine 0.2 → 0%, 0.6 → 100% (starting calibration). See `backend/src/lib/matching.ts`.

### Notifications (Web Push) — turn on at http://localhost:3000/preferences

- **New match**: a real (not demo) job added in the last 7 days that matches you (score ≥ threshold, passes filters, not ineligible). Up to 3 separate notifications, more become one summary.
- **Deadline reminders**: jobs you saved but haven't applied to, 3 days and 1 day before the deadline.
- Each job notifies once (`notification_log`). Runs every 30 minutes and right after new jobs are embedded.
- Setup: VAPID keys in `backend/.env` (`npx web-push generate-vapid-keys`). Push works on `http://localhost` in Chrome/Edge/Firefox; **on a phone the site must be served over HTTPS** (deploy, or a tunnel).
- Only endpoints of real push services (Google, Mozilla, Microsoft, Apple) are accepted — the server POSTs to them, so anything else could be abused (SSRF).
- `GET /api/push/config`, `GET /api/push/devices`, `POST/DELETE /api/push/subscribe`, `POST /api/push/test`, `POST /api/push/run`
- Service worker: `frontend/public/sw.js`; app manifest: `frontend/app/manifest.ts` (installable PWA).

### Eligibility (pass / fail / unknown)

With a confirmed CV profile, every job gets `match.eligibility`: mandatory requirements read from the job text by rules (`backend/src/lib/eligibility.ts`) — age limit (checked on the circular's "as on" date, else the deadline), minimum education level, subject, CGPA (4.00 scale), years of experience — each checked against your profile.
- `fail` blocks a match whatever the score; `unknown` (e.g. no date of birth, degree still in progress) is shown but doesn't block.
- "preferred / is a plus / advantage" sentences are ignored; "fresh graduates may apply" removes the experience requirement.
- Always confirm in the original circular: this is read automatically.

### Automatic sources (web page: http://localhost:3000/sources)

JobPulse checks company career pages on **SmartRecruiters, Greenhouse and Lever** through their public job APIs — 10 seconds after the backend starts, then every 3 hours (`COLLECT_INTERVAL_HOURS` to change, `COLLECT_DISABLED=1` to turn off).

- Complete new jobs with nothing similar already saved are added automatically.
- Jobs with missing details or that look like an existing job wait in the review list (`/import`), with the reason.
- Changed postings are updated; postings removed from the company site close the job (unless another source still lists it).

API:
- `GET /api/sources`
- `POST /api/sources` `{ url, category }` — paste any careers-page or job link from a supported platform
- `POST /api/sources/:id/run` — check now
- `PATCH /api/sources/:id` `{ enabled?, defaultCategory? }`

**bdjobs.com** (added 2026-11-18): pick categories on the Sources page. JobPulse reads the data bdjobs embeds in its **public** pages (`ng-state` JSON) — the newest-jobs list (1 request per run, cached 10 min) and the detail page of each NEW job in your categories (max 25 per run, 1.5 s apart). Only the newest 50 jobs are public, so bdjobs jobs are never closed for "disappearing" — they expire by deadline. Checked before building: robots.txt allows these pages; the Terms call bdjobs "a public site with free access". Personal use only, links always go back to bdjobs. bdjobs job links pasted on "Add from link" are read the same way.

Not available (checked 2026-11-18): chakri.com was down (Cloudflare error 523), smartjob.portal.gov.bd didn't answer. Teletalk alljobs is on hold — its terms require written permission.

To support another platform, add a file in `backend/src/collectors/` that implements `Collector` (see `types.ts`) and register it in `collectors/index.ts`.

### Saved jobs / application tracker (web page: http://localhost:3000/saved)

- `GET /api/saved` — my saved jobs, nearest deadline first
- `PUT /api/saved/:jobId` `{ status?, notes? }` — save a job, or change its status (`saved`, `applied`, `interview`, `offer`, `rejected`) / notes
- `DELETE /api/saved/:jobId` — remove from saved

Every job in `GET /api/jobs` includes `savedStatus` (`null` = not saved). Jobs whose deadline has passed (Bangladesh time) are marked `expired` when the server starts and every hour after.

### Paste-a-link imports (web page: http://localhost:3000/import)

- `POST /api/imports` `{ url }` — reads the page and saves a **draft** (same link twice returns the first one)
- `GET /api/imports?status=pending|approved|rejected`
- `GET /api/imports/:id`
- `POST /api/imports/:id/approve` `{ job: {...} }` to create a job, or `{ linkToJobId }` if it's the same vacancy as an existing job
- `POST /api/imports/:id/reject`

Imported pages are only fetched from public addresses (private/local network addresses are refused), with a 15 s timeout and 3 MB limit. PDF links aren't parsed yet — fill those in by hand.
