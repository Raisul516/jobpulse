"use client";

// "Add a job from a link" page.
// 1. User pastes a link  2. Backend reads the page and guesses details
// 3. User checks/corrects them in ReviewForm  4. Saved as a job
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError, JobImport } from "../lib/api";
import DuplicatePairs from "./DuplicatePairs";
import ReviewForm from "./ReviewForm";

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [current, setCurrent] = useState<JobImport | null>(null);
  const [pending, setPending] = useState<JobImport[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Drafts that were imported earlier but not reviewed yet.
  useEffect(() => {
    api<{ imports: JobImport[] }>("/api/imports?status=pending")
      .then((body) => setPending(body.imports))
      .catch(() => setPending([]));
  }, [refreshKey]);

  async function readLink(event: FormEvent) {
    event.preventDefault();
    setReading(true);
    setError("");
    setMessage("");
    try {
      const body = await api<{ import: JobImport; alreadyExisted: boolean }>("/api/imports", {
        method: "POST",
        body: { url },
      });
      if (body.alreadyExisted && body.import.reviewStatus !== "pending") {
        setMessage(`You already imported this link (it was ${body.import.reviewStatus}).`);
      } else {
        setCurrent(body.import);
        setUrl("");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.fields[0]?.message ?? err.message : "Something went wrong.");
    } finally {
      setReading(false);
    }
  }

  async function openPending(id: number) {
    setMessage("");
    try {
      const body = await api<{ import: JobImport }>(`/api/imports/${id}`);
      setCurrent(body.import);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function finished(text: string) {
    setCurrent(null);
    setMessage(text);
    setRefreshKey((k) => k + 1);
  }

  return (
    <main className="page-narrow space-y-6">
      <div>
        <Link href="/" className="text-sm link">
          ← Back to jobs
        </Link>
        <h1 className="page-title mt-2">Add a job from a link</h1>
        <p className="page-sub">
          Paste a link to a job post. JobPulse reads the page and fills in what it can — you check it before it&apos;s saved.
        </p>
      </div>

      <form onSubmit={readLink} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          required
          placeholder="https://company.com/careers/job-123"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="input flex-1"
        />
        <button type="submit" disabled={reading} className="btn btn-primary">
          {reading ? "Reading page…" : "Read page"}
        </button>
      </form>

      {error ? <p className="alert alert-error">{error}</p> : null}
      {message ? <p className="alert alert-success">{message}</p> : null}

      {current ? <ReviewForm key={current.id} item={current} onDone={finished} /> : null}

      {pending.filter((p) => p.id !== current?.id).length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold mb-2">Waiting for your review</h2>
          <ul className="space-y-2">
            {pending
              .filter((p) => p.id !== current?.id)
              .map((p) => (
                <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2 p-4">
                  <span className="break-all">
                    {p.extracted?.title?.value ?? "Untitled"}
                    <span className="block text-xs text-muted">{p.sourceUrl}</span>
                    {p.reviewReason ? <span className="block text-xs text-blue-700">{p.reviewReason}</span> : null}
                  </span>
                  <button type="button" onClick={() => openPending(p.id)} className="btn btn-secondary btn-sm">
                    Review
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <DuplicatePairs />
    </main>
  );
}
