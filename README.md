# JobPulse

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

- `GET /api/health`
- `GET /api/jobs?search=&location=&jobType=&category=&sort=` — `sort`: `newest`, `deadline`, `salary-high`, `salary-low`. Expired jobs are hidden.
- `GET /api/jobs/locations`
- `GET /api/jobs/similar?title=&company=` — open jobs that may be the same vacancy
- `GET /api/jobs/:id`

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
