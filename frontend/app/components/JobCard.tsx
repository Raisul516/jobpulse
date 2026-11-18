import { Banknote, Bookmark, BookmarkCheck, Building2, ExternalLink, MapPin, Tag } from "lucide-react";
import Link from "next/link";
import { STATUS_LABELS } from "../lib/saved";
import { Job } from "../types/job";
import DeadlineBadge from "./DeadlineBadge";
import EligibilityBadge from "./EligibilityBadge";
import MatchBadge from "./MatchBadge";

type JobCardProps = {
  job: Job;
  // Called when the user clicks Save / Saved. Leave out to hide the button.
  onToggleSave?: (job: Job) => void;
  busy?: boolean;
};

function formatSalary(min: number | null, max: number | null): string {
  if (min === null && max === null) return "Not stated";
  if (min !== null && max !== null && min !== max) {
    return `${min.toLocaleString()} – ${max.toLocaleString()} BDT`;
  }
  return `${(max ?? min)!.toLocaleString()} BDT`;
}

// A coloured square with the company's initials, so cards are easy to tell apart at a glance.
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
];

function CompanyAvatar({ name }: { name: string }) {
  const initials = name
    .replace(/\b(ltd|limited|pvt|plc|co|inc)\b\.?/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const color = AVATAR_COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${color}`} aria-hidden>
      {initials || "?"}
    </div>
  );
}

function SaveButton({ job, onToggleSave, busy }: Required<Pick<JobCardProps, "job" | "onToggleSave">> & { busy?: boolean }) {
  // Already past "saved" (applied, interview...): don't let one click throw that away — link to the tracker instead.
  if (job.savedStatus && job.savedStatus !== "saved") {
    return (
      <Link href="/saved" className="btn btn-secondary btn-sm">
        <BookmarkCheck size={16} aria-hidden />
        {STATUS_LABELS[job.savedStatus]}
      </Link>
    );
  }

  const saved = job.savedStatus === "saved";
  return (
    <button
      type="button"
      onClick={() => onToggleSave(job)}
      disabled={busy}
      aria-pressed={saved}
      className={`btn btn-sm ${saved ? "btn-secondary text-brand" : "btn-secondary"}`}
    >
      {saved ? <BookmarkCheck size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
      {saved ? "Saved" : "Save"}
    </button>
  );
}

export default function JobCard({ job, onToggleSave, busy }: JobCardProps) {
  return (
    <article className={`card card-hover p-5 ${job.match?.isMatch ? "ring-1 ring-emerald-400/50" : ""}`}>
      <div className="flex gap-4">
        <CompanyAvatar name={job.company} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-snug">
                <Link href={`/jobs/${job.id}`} className="hover:text-brand hover:underline underline-offset-4">
                  {job.title}
                </Link>
              </h2>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Building2 size={14} aria-hidden />
                {job.company}
              </p>
            </div>
            <DeadlineBadge deadline={job.deadline} />
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <MapPin size={14} aria-hidden />
              {job.location}
            </span>
            <span className="flex items-center gap-1.5">
              <Tag size={14} aria-hidden />
              {job.jobType} · {job.category}
            </span>
            <span className="flex items-center gap-1.5">
              <Banknote size={14} aria-hidden />
              {formatSalary(job.salaryMin, job.salaryMax)}
            </span>
          </div>

          {job.match ? (
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <MatchBadge match={job.match} />
              {job.match.eligibility ? <EligibilityBadge eligibility={job.match.eligibility} /> : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {job.applyUrl ? (
              <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                Apply / view
                <ExternalLink size={14} aria-hidden />
              </a>
            ) : null}
            {onToggleSave ? <SaveButton job={job} onToggleSave={onToggleSave} busy={busy} /> : null}
            {job.isDemo ? <span className="badge badge-amber ml-auto">Demo listing</span> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export { formatSalary };
