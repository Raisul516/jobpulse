import Link from "next/link";
import { STATUS_LABELS } from "../lib/saved";
import { Job } from "../types/job";
import DeadlineBadge from "./DeadlineBadge";

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

function SaveButton({ job, onToggleSave, busy }: Required<Pick<JobCardProps, "job" | "onToggleSave">> & { busy?: boolean }) {
  // Already past "saved" (applied, interview...): don't let one click throw that away — link to the tracker instead.
  if (job.savedStatus && job.savedStatus !== "saved") {
    return (
      <Link href="/saved" className="text-sm rounded-md border px-3 py-1 whitespace-nowrap">
        ★ {STATUS_LABELS[job.savedStatus]}
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
      className={`text-sm rounded-md border px-3 py-1 whitespace-nowrap disabled:opacity-50 ${
        saved ? "bg-yellow-100 text-yellow-900 border-yellow-300" : ""
      }`}
    >
      {saved ? "★ Saved" : "☆ Save"}
    </button>
  );
}

export default function JobCard({ job, onToggleSave, busy }: JobCardProps) {
  return (
    <div className="border rounded-lg p-4 mb-4 shadow-sm hover:shadow-lg transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">{job.title}</h2>
        <DeadlineBadge deadline={job.deadline} />
      </div>
      <p>{job.company}</p>
      <p className="text-sm mt-1">
        {job.location} · {job.jobType} · {job.category}
      </p>
      <p className="text-sm">Salary: {formatSalary(job.salaryMin, job.salaryMax)}</p>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        {onToggleSave ? <SaveButton job={job} onToggleSave={onToggleSave} busy={busy} /> : null}
        {job.applyUrl ? (
          <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">
            Apply / view original ↗
          </a>
        ) : null}
        {job.isDemo ? <span className="text-xs text-amber-700">Demo listing</span> : null}
      </div>
    </div>
  );
}

export { formatSalary };
