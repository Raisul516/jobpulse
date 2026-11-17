# JobPulse

Personal job-intelligence and alert app for Bangladesh. See [documentation/roadmap.md](documentation/roadmap.md) for the plan.

| Folder | What it is |
|---|---|
| `frontend/` | Next.js web app (port 3000) |
| `backend/` | Express + TypeScript REST API (port 4000) |
| `documentation/` | Plan and decisions |
| `docker-compose.yml` | PostgreSQL database for development (port 5433) |

## First-time setup

1. Copy `.env.example` → `.env` (root) and `backend/.env.example` → `backend/.env`; use the same password in both.
2. Start the database: `docker compose up -d`
3. Backend: `cd backend`, `npm install`, `npm run db:migrate`, `npm run db:seed`
4. Frontend: `cd frontend`, `npm install`

## Every day

- `docker compose up -d` (database)
- `cd backend` → `npm run dev`
- `cd frontend` → `npm run dev`, then open http://localhost:3000

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

### Paste-a-link imports (web page: http://localhost:3000/import)

- `POST /api/imports` `{ url }` — reads the page and saves a **draft** (same link twice returns the first one)
- `GET /api/imports?status=pending|approved|rejected`
- `GET /api/imports/:id`
- `POST /api/imports/:id/approve` `{ job: {...} }` to create a job, or `{ linkToJobId }` if it's the same vacancy as an existing job
- `POST /api/imports/:id/reject`

Imported pages are only fetched from public addresses (private/local network addresses are refused), with a 15 s timeout and 3 MB limit. PDF links aren't parsed yet — fill those in by hand.
