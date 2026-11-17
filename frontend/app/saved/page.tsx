"use client";

// "My applications": every job you saved, with its status, notes and deadline.
import { BookmarkPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import DeadlineBadge, { daysLeft } from "../components/DeadlineBadge";
import { api } from "../lib/api";
import { APPLICATION_STATUSES, ApplicationStatus, SavedJob, STATUS_COLORS, STATUS_LABELS } from "../lib/saved";
import SavedJobRow from "./SavedJobRow";

type Filter = "all" | ApplicationStatus;

export default function SavedPage() {
  const [items, setItems] = useState<SavedJob[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api<{ saved: SavedJob[] }>("/api/saved")
      .then((body) => {
        setItems(body.saved);
        setError("");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load saved jobs."));
  }, [reloadKey]);

  function replaceItem(updated: SavedJob) {
    setItems((old) => old?.map((item) => (item.job.id === updated.job.id ? updated : item)) ?? null);
  }

  function removeItem(jobId: number) {
    setItems((old) => old?.filter((item) => item.job.id !== jobId) ?? null);
  }

  if (error) {
    return (
      <main className="page-narrow">
        <div className="alert alert-error flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn btn-secondary btn-sm">
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!items) {
    return (
      <main className="page-narrow space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-2" />
        <div className="card h-40 animate-pulse" />
      </main>
    );
  }

  const counts = Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length])
  ) as Record<ApplicationStatus, number>;

  // Saved but not applied, and the deadline is within 3 days: the ones to act on today.
  const dueSoon = items.filter(
    (i) => i.status === "saved" && i.job.deadline && daysLeft(i.job.deadline) >= 0 && daysLeft(i.job.deadline) <= 3
  );

  const visible = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <main className="page-narrow space-y-6">
      <div>
        <h1 className="page-title">My applications</h1>
        <p className="page-sub">Jobs you saved, nearest deadline first. Change the status as you go.</p>
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <BookmarkPlus size={36} className="text-muted" aria-hidden />
          <p className="font-medium">Nothing saved yet</p>
          <p className="text-sm text-muted">Press Save on a job you like and track it here until you get the offer.</p>
          <Link href="/" className="btn btn-primary btn-sm">
            Browse jobs
          </Link>
        </div>
      ) : (
        <>
          {dueSoon.length > 0 ? (
            <section className="alert alert-error">
              <h2 className="font-semibold">Apply soon — deadline in 3 days or less</h2>
              <ul className="list-disc ml-5 text-sm mt-1">
                {dueSoon.map((i) => (
                  <li key={i.job.id}>
                    {i.job.title} at {i.job.company} — <DeadlineBadge deadline={i.job.deadline} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
            {(["all", ...APPLICATION_STATUSES] as Filter[]).map((f) => {
              const count = f === "all" ? items.length : counts[f];
              const active = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f)}
                  className={active ? "chip chip-active" : f === "all" ? "chip" : `chip border-transparent ${STATUS_COLORS[f]}`}
                >
                  {f === "all" ? "All" : STATUS_LABELS[f].split(" —")[0]} ({count})
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted">No jobs with this status.</p>
          ) : (
            <ul className="space-y-4">
              {visible.map((item) => (
                <SavedJobRow key={item.job.id} item={item} onChange={replaceItem} onRemove={removeItem} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
