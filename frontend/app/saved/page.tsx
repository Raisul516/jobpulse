"use client";

// "My applications": every job you saved, with its status, notes and deadline.
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
      <main className="max-w-3xl mx-auto p-6">
        <p className="text-red-600">{error}</p>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-3 border rounded-md px-3 py-2">
          Try again
        </button>
      </main>
    );
  }

  if (!items) {
    return <main className="max-w-3xl mx-auto p-6">Loading…</main>;
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
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">My applications</h1>
        <p className="text-sm">Jobs you saved, nearest deadline first. Change the status as you go.</p>
      </div>

      {items.length === 0 ? (
        <p>
          Nothing saved yet. Press <strong>☆ Save</strong> on a job in the{" "}
          <Link href="/" className="underline">
            job list
          </Link>
          .
        </p>
      ) : (
        <>
          {dueSoon.length > 0 ? (
            <section className="rounded-md border border-red-300 bg-red-50 text-red-900 p-3">
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
                  className={`rounded-full px-3 py-1 text-sm border ${
                    active ? "bg-blue-600 text-white border-blue-600" : f === "all" ? "" : STATUS_COLORS[f]
                  }`}
                >
                  {f === "all" ? "All" : STATUS_LABELS[f].split(" —")[0]} ({count})
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p>No jobs with this status.</p>
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
