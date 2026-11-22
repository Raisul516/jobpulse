"use client";

// "Explain with AI": the backend collects this job, your CV profile and the match checks (retrieval),
// and an LLM writes a short explanation from only those facts (generation).
import { Loader2, WandSparkles } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../lib/api";

export default function AiExplain({ jobId }: { jobId: number }) {
  const [text, setText] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function explain() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ text: string; model: string }>(`/api/ai/explain/${jobId}`, { method: "POST" });
      setText(result.text);
      setModel(result.model);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not get an explanation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title flex items-center gap-2">
          <WandSparkles size={18} className="text-brand" aria-hidden />
          Does this job fit me?
        </h2>
        {!text ? (
          <button type="button" onClick={explain} disabled={busy} className="btn btn-secondary btn-sm">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <WandSparkles size={16} aria-hidden />}
            {busy ? "Thinking…" : "Explain with AI"}
          </button>
        ) : null}
      </div>
      {text ? (
        <>
          <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>
          <p className="hint">Written by AI ({model}) from this job text and your CV profile. It can be wrong — check the original post.</p>
        </>
      ) : !error ? (
        <p className="text-sm text-muted">Get a short AI summary of what matches your CV, what&apos;s missing, and a tip for applying.</p>
      ) : null}
      {error ? <p className="alert alert-error">{error}</p> : null}
    </section>
  );
}
