# JobPulse — Build Roadmap (agreed 2026-11-17)

Strategy: build one thin end-to-end slice first (source → database → match → phone alert), then widen it.
Build first, learn later: each milestone gets a short walkthrough once it works.

## Decisions
| Area | Decision |
|---|---|
| Repo | One root git repo; `frontend/`, `backend/`, `ai-service/`, `documentation/` as separate folders |
| Frontend | Next.js 16 + React 19 + Tailwind (existing) |
| Backend | Express 5 + TypeScript, REST, port 4000 |
| Database | PostgreSQL + ORM migrations; `pg_trgm` for search/dedupe; `pgvector` later |
| Jobs/queue | `pg-boss` or `node-cron` on Postgres (no Redis yet) |
| Notifications | Web Push via an installable PWA (Android Chrome) |
| AI | Python FastAPI `ai-service`: rule-based parsing + LLM API calls inside it |
| Sources | 1) Paste-a-link 2) Govt circulars (Teletalk, after robots/terms check) 3) Chosen company career pages |

## Milestones
1. ✅ **Database foundation** — Postgres, schema (`jobs`, `job_sources`, `job_source_records`, `users`, `profiles`, `saved_jobs`), seed demo data, API reads from the DB.
2. ✅ **Paste-a-link ingestion** (HTML pages; PDF circulars postponed by the user, 2026-11-18) — submit URL → fetch → store raw snapshot → extract title/company/deadline → draft for user review.
3. ✅ **Saved jobs + application tracking + deadlines** (reminders by push come in milestone 4) — bookmark, status, deadline countdown.
4. 🟡 (works on desktop browsers; phone needs HTTPS deployment) **PWA + Web Push** — installable app, push subscription, "new matching job" and "deadline in 3 days" alerts.
5. ✅ (part 1: company career platforms — SmartRecruiters, Greenhouse, Lever) **Collectors** — Teletalk govt circulars, then company career pages; scheduled, rate-limited, raw snapshots kept.
   - ⏸ **Teletalk alljobs on hold (checked 2026-11-17):** React app on an undocumented internal API; Terms §6.2 forbid using site content without written consent. Build only with written permission. Alternative: PDF circular reading for links from organisations' own sites.
6. ✅ (suggest pairs, merge or "not the same" on the review page; never automatic) **Duplicate detection** — URL normalisation + company/title/deadline + trigram similarity; uncertain matches go to a review queue, never auto-merged.
7. 🟡 (CV upload, rule-based parsing, draft → confirm, local embeddings + pgvector similarity, rule-based eligibility done; optional LLM and PDF circulars still to do) **ai-service** — CV upload (PDF/DOCX) → draft profile → user confirms; job-requirement extraction; eligibility (pass / fail / unknown) separate from match score; threshold setting (default 70%).
8. **Auth, tests, deploy** — login, Jest/Pytest on matching/eligibility/dedupe, Playwright smoke test, CI, hosting.

## Principles (from the handoff)
No auto-applying; no silent merges; AI-extracted data is a draft until confirmed; eligibility always overrides score; keep source URLs; respect robots/terms/rate limits; no secrets in frontend or git.
