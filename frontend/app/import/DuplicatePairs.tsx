"use client";

// "Possible duplicate jobs": pairs that look like the same vacancy (e.g. found on bdjobs AND the
// company's own site). You decide: keep one and merge the other into it, or say they're different.
import { AlertTriangle, CopyCheck, ExternalLink, GitMerge, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Summary = {
  id: number;
  title: string;
  company: string;
  location: string;
  deadline: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  applyUrl: string | null;
  sources: string[];
};
type Pair = { a: Summary; b: Summary; reasons: { text: string; warning: boolean }[]; score: number };

function salary(s: Summary) {
  if (s.salaryMin === null && s.salaryMax === null) return "Salary not stated";
  return s.salaryMin === s.salaryMax || s.salaryMax === null || s.salaryMin === null
    ? `${(s.salaryMax ?? s.salaryMin)!.toLocaleString()} BDT`
    : `${s.salaryMin.toLocaleString()} – ${s.salaryMax.toLocaleString()} BDT`;
}

function JobSide({ job }: { job: Summary }) {
  return (
    <div className="min-w-0 flex-1 space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
      <Link href={`/jobs/${job.id}`} className="font-semibold hover:text-brand hover:underline">
        {job.title}
      </Link>
      <p className="text-muted">{job.company}</p>
      <p className="text-muted">
        {job.location} · {job.deadline ? `apply by ${job.deadline}` : "no deadline"} · {salary(job)}
      </p>
      <p className="text-xs text-muted">From: {job.sources.join(", ") || "—"}</p>
      {job.applyUrl ? (
        <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-xs">
          Original <ExternalLink size={12} aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

export default function DuplicatePairs() {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "a-b" of the pair being handled
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  useEffect(() => {
    api<{ pairs: Pair[] }>("/api/duplicates")
      .then((body) => setPairs(body.pairs))
      .catch(() => setPairs([]));
  }, []);

  async function act(pair: Pair, action: "keep-a" | "keep-b" | "dismiss") {
    const key = `${pair.a.id}-${pair.b.id}`;
    setBusy(key);
    setMessage(null);
    try {
      if (action === "dismiss") {
        await api("/api/duplicates/dismiss", { method: "POST", body: { jobId1: pair.a.id, jobId2: pair.b.id } });
        setMessage({ text: "Marked as different jobs. This pair won't be suggested again.", kind: "ok" });
      } else {
        const [keep, merge] = action === "keep-a" ? [pair.a, pair.b] : [pair.b, pair.a];
        await api("/api/duplicates/merge", { method: "POST", body: { keepId: keep.id, mergeId: merge.id } });
        setMessage({ text: `Merged into “${keep.title}”. Its links, saved status and missing details were combined.`, kind: "ok" });
      }
      // a merged job may appear in other pairs too, so reload the list
      const body = await api<{ pairs: Pair[] }>("/api/duplicates");
      setPairs(body.pairs);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Something went wrong.", kind: "error" });
    } finally {
      setBusy(null);
    }
  }

  if (!pairs || (pairs.length === 0 && !message)) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <CopyCheck size={18} aria-hidden /> Possible duplicate jobs
        </h2>
        <p className="text-sm text-muted">
          These look like the same vacancy listed twice. Nothing is merged unless you choose to.
        </p>
      </div>

      {message ? <p className={`alert ${message.kind === "ok" ? "alert-success" : "alert-error"}`}>{message.text}</p> : null}

      {pairs.map((pair) => {
        const key = `${pair.a.id}-${pair.b.id}`;
        return (
          <article key={key} className="card space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-blue">{pair.score}% alike</span>
              {pair.reasons.map((r) => (
                <span key={r.text} className={`badge ${r.warning ? "badge-amber" : "badge-gray"}`}>
                  {r.warning ? <AlertTriangle size={12} aria-hidden /> : null}
                  {r.text}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <JobSide job={pair.a} />
              <JobSide job={pair.b} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy === key} onClick={() => act(pair, "keep-a")} className="btn btn-secondary btn-sm">
                <GitMerge size={14} aria-hidden /> Same job — keep left
              </button>
              <button type="button" disabled={busy === key} onClick={() => act(pair, "keep-b")} className="btn btn-secondary btn-sm">
                <GitMerge size={14} aria-hidden /> Same job — keep right
              </button>
              <button type="button" disabled={busy === key} onClick={() => act(pair, "dismiss")} className="btn btn-ghost btn-sm">
                <X size={14} aria-hidden /> Not the same
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
