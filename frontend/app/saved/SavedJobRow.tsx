"use client";

// One saved job: status dropdown, notes, deadline and remove button.
import { useState } from "react";
import DeadlineBadge from "../components/DeadlineBadge";
import { formatSalary } from "../components/JobCard";
import { APPLICATION_STATUSES, ApplicationStatus, saveJob, SavedJob, STATUS_LABELS, unsaveJob } from "../lib/saved";

type Props = {
  item: SavedJob;
  onChange: (updated: SavedJob) => void;
  onRemove: (jobId: number) => void;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function SavedJobRow({ item, onChange, onRemove }: Props) {
  const { job } = item;
  const [notes, setNotes] = useState(item.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function update(changes: { status?: ApplicationStatus; notes?: string | null }, doneMessage: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await saveJob(job.id, changes);
      const saved = body.saved as { status: ApplicationStatus; notes: string | null; appliedAt: string | null; updatedAt: string };
      onChange({ ...item, status: saved.status, notes: saved.notes, appliedAt: saved.appliedAt, updatedAt: saved.updatedAt });
      setMessage(doneMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${job.title}" from your saved jobs? Your notes for it will be deleted.`)) return;
    setBusy(true);
    try {
      await unsaveJob(job.id);
      onRemove(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
      setBusy(false);
    }
  }

  const notesChanged = notes.trim() !== (item.notes ?? "");

  return (
    <li className="card p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{job.title}</h2>
          <p>{job.company}</p>
          <p className="text-sm">
            {job.location} · {job.jobType} · {job.category} · Salary: {formatSalary(job.salaryMin, job.salaryMax)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DeadlineBadge deadline={job.deadline} muted={item.status !== "saved"} />
          {job.status !== "open" ? <span className="text-xs text-muted">Listing {job.status}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Status
          <select
            value={item.status}
            disabled={busy}
            onChange={(e) => update({ status: e.target.value as ApplicationStatus }, "Status updated")}
            className="input w-auto py-1"
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {item.appliedAt ? <span className="text-sm text-muted">Applied on {formatDate(item.appliedAt)}</span> : null}
        {job.applyUrl ? (
          <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="text-sm link">
            Apply / view original ↗
          </a>
        ) : null}
      </div>

      <label className="block text-sm">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          // save when you click away from the box, only if something changed
          onBlur={() => notesChanged && update({ notes }, "Notes saved")}
          rows={2}
          maxLength={2000}
          placeholder="e.g. Sent CV on 20 Nov, contact: HR team, interview prep…"
          className="input mt-1"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={remove} disabled={busy} className="btn btn-secondary btn-sm">
          Remove
        </button>
        {busy ? <span>Saving…</span> : null}
        {message && !busy ? <span className="text-emerald-600 dark:text-emerald-400">{message} ✓</span> : null}
        {error ? <span className="text-red-600">{error}</span> : null}
      </div>
    </li>
  );
}
