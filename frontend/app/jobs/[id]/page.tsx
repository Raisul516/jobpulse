"use client";

// Job detail: everything JobPulse knows about one vacancy —
// full text, match, eligibility checks, the requirements it read, and every site it was found on.
import {
  ArrowLeft,
  Banknote,
  Bookmark,
  BookmarkCheck,
  Building2,
  ExternalLink,
  Globe,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { Suspense, use, useEffect, useState } from "react";
import AiExplain from "../../components/AiExplain";
import CoverLetter from "../../components/CoverLetter";
import DeadlineBadge from "../../components/DeadlineBadge";
import { formatSalary } from "../../components/JobCard";
import { api } from "../../lib/api";
import { saveJob, STATUS_LABELS, unsaveJob } from "../../lib/saved";
import { Job } from "../../types/job";

type Requirements = {
  maxAge?: number;
  minAge?: number;
  ageReferenceDate?: string;
  minEducation?: string;
  subjects?: string[];
  minCgpa?: number;
  minExperienceYears?: number;
  freshersWelcome?: boolean;
};

type FoundOn = { name: string; adapter: string; url: string; firstSeen: string; lastSeen: string | null; removed: boolean };

function requirementLines(r: Requirements): string[] {
  const lines: string[] = [];
  if (r.minAge !== undefined || r.maxAge !== undefined) {
    lines.push(
      `Age ${r.minAge !== undefined ? `${r.minAge}–${r.maxAge}` : `up to ${r.maxAge}`}${r.ageReferenceDate ? ` (as on ${r.ageReferenceDate})` : ""}`
    );
  }
  if (r.minEducation) lines.push(`${r.minEducation} degree${r.subjects?.length ? ` in ${r.subjects.join(" / ")}` : ""}`);
  if (r.minCgpa !== undefined) lines.push(`CGPA ${r.minCgpa.toFixed(2)} or more`);
  if (r.minExperienceYears) lines.push(`${r.minExperienceYears}+ years of experience`);
  if (r.freshersWelcome) lines.push("Fresh graduates may apply");
  return lines;
}

const sourceLabel = (s: FoundOn) => (s.adapter === "manual" ? "Link you added" : s.name);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const ELIGIBILITY = {
  pass: { label: "You're eligible", Icon: ShieldCheck, tone: "text-emerald-600 dark:text-emerald-400" },
  fail: { label: "You're not eligible", Icon: ShieldAlert, tone: "text-red-600 dark:text-red-400" },
  unknown: { label: "Check eligibility", Icon: ShieldQuestion, tone: "text-amber-600 dark:text-amber-400" },
};
const CHECK_ICON = { pass: "✓", fail: "✗", unknown: "?" };

function DetailSkeleton() {
  return (
    <main className="page-narrow space-y-4">
      <div className="card h-40 animate-pulse" />
      <div className="card h-64 animate-pulse" />
    </main>
  );
}

// The job id comes from the address, which is only known when the page is requested:
// Next.js wants that read inside <Suspense> so the rest of the page can be prepared in advance.
export default function JobDetailPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <JobDetail params={params} />
    </Suspense>
  );
}

function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{ job: Job; requirements: Requirements; sources: FoundOn[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ job: Job; requirements: Requirements; sources: FoundOn[] }>(`/api/jobs/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load this job."));
  }, [id]);

  async function toggleSave() {
    if (!data) return;
    setBusy(true);
    try {
      const nowSaved = data.job.savedStatus === null;
      if (nowSaved) await saveJob(data.job.id);
      else await unsaveJob(data.job.id);
      setData({ ...data, job: { ...data.job, savedStatus: nowSaved ? "saved" : null } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <main className="page-narrow space-y-4">
        <Link href="/" className="link inline-flex items-center gap-1 text-sm">
          <ArrowLeft size={16} aria-hidden /> Back to jobs
        </Link>
        <p className="alert alert-error">{error}</p>
      </main>
    );
  }
  if (!data) return <DetailSkeleton />;

  const { job, requirements, sources } = data;
  const reqLines = requirementLines(requirements);
  const eligibility = job.match?.eligibility;
  const advanced = job.savedStatus && job.savedStatus !== "saved";

  return (
    <main className="page-narrow space-y-5">
      <Link href="/" className="link inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={16} aria-hidden /> Back to jobs
      </Link>

      {/* ----- header ----- */}
      <section className="card space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="page-title">{job.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-muted">
              <Building2 size={16} aria-hidden /> {job.company}
            </p>
          </div>
          <DeadlineBadge deadline={job.deadline} muted={Boolean(advanced)} />
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <MapPin size={15} aria-hidden /> {job.location}
          </span>
          <span className="flex items-center gap-1.5">
            <Tag size={15} aria-hidden /> {job.jobType} · {job.category}
          </span>
          <span className="flex items-center gap-1.5">
            <Banknote size={15} aria-hidden /> {formatSalary(job.salaryMin, job.salaryMax)}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {job.applyUrl ? (
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Apply / view original <ExternalLink size={16} aria-hidden />
            </a>
          ) : null}
          {advanced ? (
            <Link href="/saved" className="btn btn-secondary">
              <BookmarkCheck size={16} aria-hidden /> {STATUS_LABELS[job.savedStatus!]}
            </Link>
          ) : (
            <button type="button" onClick={toggleSave} disabled={busy} aria-pressed={job.savedStatus === "saved"} className="btn btn-secondary">
              {job.savedStatus === "saved" ? <BookmarkCheck size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
              {job.savedStatus === "saved" ? "Saved" : "Save"}
            </button>
          )}
          {job.isDemo ? <span className="badge badge-amber self-center">Demo listing</span> : null}
        </div>
        {error ? <p className="alert alert-error">{error}</p> : null}
      </section>

      {/* ----- fit for you ----- */}
      {job.match ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-2 p-5">
            <h2 className="section-title flex items-center gap-2">
              <Sparkles size={18} className="text-brand" aria-hidden />
              {job.match.isMatch ? `Match ${job.match.score}%` : `${job.match.score}% match`}
            </h2>
            <ul className="space-y-1 text-sm">
              {job.match.reasons.map((r) => (
                <li key={r.text} className={r.good ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"}>
                  {r.good ? "✓" : "✗"} {r.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="card space-y-2 p-5">
            {eligibility && eligibility.status !== "none" ? (
              <>
                <h2 className={`section-title flex items-center gap-2 ${ELIGIBILITY[eligibility.status].tone}`}>
                  {(() => {
                    const { Icon } = ELIGIBILITY[eligibility.status];
                    return <Icon size={18} aria-hidden />;
                  })()}
                  {ELIGIBILITY[eligibility.status].label}
                </h2>
                <ul className="space-y-1 text-sm">
                  {eligibility.checks.map((c) => (
                    <li key={c.requirement}>
                      {CHECK_ICON[c.status]} <strong>{c.requirement}</strong> — {c.reason}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2 className="section-title">Requirements</h2>
                <p className="text-sm text-muted">
                  {eligibility ? "No age, degree, CGPA or experience requirements found in the job text." : "Upload your CV to check eligibility."}
                </p>
              </>
            )}
            <p className="hint">Read automatically from the job text — always confirm in the original post.</p>
          </div>
        </section>
      ) : null}

      {/* ----- AI explanation (RAG) ----- */}
      <AiExplain jobId={job.id} />
      <CoverLetter jobId={job.id} jobTitle={job.title} company={job.company} />

      {/* ----- requirements as read ----- */}
      {reqLines.length ? (
        <section className="card p-5">
          <h2 className="section-title mb-2">Requirements JobPulse found</h2>
          <ul className="flex flex-wrap gap-2">
            {reqLines.map((line) => (
              <li key={line} className="badge badge-blue">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ----- full text ----- */}
      <section className="card p-6">
        <h2 className="section-title mb-3">About the job</h2>
        {job.description ? (
          <div className="whitespace-pre-line text-sm leading-relaxed">{job.description}</div>
        ) : (
          <p className="text-sm text-muted">No description saved. Open the original post for details.</p>
        )}
      </section>

      {/* ----- where it was found ----- */}
      <section className="card p-5">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Globe size={18} aria-hidden /> Found on
        </h2>
        {sources.length ? (
          <ul className="space-y-2 text-sm">
            {sources.map((s, i) => (
              // the same link can come from two sources (pasted + collected), so the key includes the position
              <li key={`${i}-${s.url}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <span>
                  <strong>{sourceLabel(s)}</strong>
                  <span className="block text-xs text-muted">
                    first seen {formatDate(s.firstSeen)}
                    {s.removed ? " · no longer listed there" : ""}
                  </span>
                </span>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
                  View <ExternalLink size={14} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{job.isDemo ? "Demo listing — not from a real site." : "No source recorded."}</p>
        )}
      </section>
    </main>
  );
}
