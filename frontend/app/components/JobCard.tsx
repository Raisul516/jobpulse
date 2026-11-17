import { Job } from "../types/job";

type JobCardProps = {
  job: Job;
};

function formatSalary(min: number | null, max: number | null): string {
  if (min === null && max === null) return "Not stated";
  if (min !== null && max !== null && min !== max) {
    return `${min.toLocaleString()} – ${max.toLocaleString()} BDT`;
  }
  return `${(max ?? min)!.toLocaleString()} BDT`;
}

// Whole days from today until the deadline (0 = today).
function daysLeft(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${deadline}T00:00:00`);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) {
    return <span className="text-sm text-gray-500">No deadline listed</span>;
  }
  const days = daysLeft(deadline);
  const urgent = days <= 3;
  const label = days === 0 ? "Last day today" : `${days} day${days === 1 ? "" : "s"} left`;
  return (
    <span
      className={`text-sm rounded-full px-2 py-0.5 ${
        urgent ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"
      }`}
    >
      {label} · {deadline}
    </span>
  );
}

export default function JobCard({ job }: JobCardProps) {
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
      {job.isDemo ? <p className="text-xs mt-2 text-amber-700">Demo listing</p> : null}
    </div>
  );
}
