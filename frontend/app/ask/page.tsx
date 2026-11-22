"use client";

// Ask JobPulse: type a question in English, Bangla or Banglish.
// The backend finds the closest jobs by meaning (retrieval), an LLM answers from only those (generation),
// and the jobs it recommends are shown first.
import { Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import JobCard from "../components/JobCard";
import { api, ApiError } from "../lib/api";
import { saveJob, unsaveJob } from "../lib/saved";
import { Job } from "../types/job";

type AskResult = { answer: string; model?: string; recommended: Job[]; jobs: Job[] };

const EXAMPLES = [
  "Which of these jobs suit my CV best?",
  "Dhakay fresher der jonno kon software job ache?",
  "Any remote or part-time jobs closing soon?",
  "ব্যাংকে কোনো চাকরি আছে?",
];

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [busyJobId, setBusyJobId] = useState<number | null>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setError("");
    setAsked(q);
    try {
      setResult(await api<AskResult>("/api/ai/ask", { method: "POST", body: { question: q } }));
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Could not get an answer.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  async function toggleSave(job: Job) {
    setBusyJobId(job.id);
    try {
      const nowSaved = job.savedStatus === null;
      if (nowSaved) await saveJob(job.id);
      else await unsaveJob(job.id);
      const update = (list: Job[]) => list.map((j) => (j.id === job.id ? { ...j, savedStatus: nowSaved ? ("saved" as const) : null } : j));
      setResult((old) => old && { ...old, jobs: update(old.jobs), recommended: update(old.recommended) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the job.");
    } finally {
      setBusyJobId(null);
    }
  }

  const recommendedIds = new Set(result?.recommended.map((j) => j.id));
  const others = result?.jobs.filter((j) => !recommendedIds.has(j.id)) ?? [];

  return (
    <main className="page space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <MessageCircleQuestion className="text-brand" aria-hidden />
          Ask JobPulse
        </h1>
        <p className="page-sub">Ask about your jobs in English, Bangla or Banglish. The AI answers only from jobs in JobPulse.</p>
      </div>

      <form onSubmit={submit} className="card space-y-3 p-4">
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="e.g. Which React jobs fit my CV?"
            aria-label="Your question"
            className="input flex-1"
          />
          <button type="submit" disabled={busy || question.trim().length < 3} className="btn btn-primary">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
            <span className="hidden sm:inline">Ask</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => {
                setQuestion(example);
                void ask(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      {error ? <p className="alert alert-error">{error}</p> : null}

      {busy ? (
        <div className="card flex items-center gap-3 p-5 text-muted">
          <Loader2 className="animate-spin" aria-hidden /> Searching your jobs and writing an answer…
        </div>
      ) : null}

      {result && !busy ? (
        <>
          <section className="card space-y-2 p-5">
            <p className="text-sm text-muted">You asked: {asked}</p>
            <p className="whitespace-pre-line leading-relaxed">{result.answer}</p>
            {result.model ? <p className="hint">Written by AI ({result.model}). It can be wrong — open the job to check.</p> : null}
          </section>

          {result.recommended.length ? (
            <section className="space-y-4">
              <h2 className="section-title">Recommended</h2>
              {result.recommended.map((job) => (
                <JobCard key={job.id} job={job} onToggleSave={toggleSave} busy={busyJobId === job.id} />
              ))}
            </section>
          ) : null}

          {others.length ? (
            <section className="space-y-4">
              <h2 className="section-title text-muted">Other jobs the search found</h2>
              {others.map((job) => (
                <JobCard key={job.id} job={job} onToggleSave={toggleSave} busy={busyJobId === job.id} />
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
