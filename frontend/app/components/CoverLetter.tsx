"use client";

// AI cover letter for one job. The AI gets the job and your CV profile (not your name);
// it signs with a placeholder, and your name from My profile is filled in here, in the browser.
import { Check, Copy, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../lib/api";

type Result = { text: string; model: string; namePlaceholder: string };

export default function CoverLetter({ jobId, jobTitle, company }: { jobId: number; jobTitle: string; company: string }) {
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const [tone, setTone] = useState<"formal" | "friendly">("formal");
  const [notes, setNotes] = useState("");
  const [letter, setLetter] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function write() {
    setBusy(true);
    setError("");
    try {
      const [result, profile] = await Promise.all([
        api<Result>(`/api/ai/cover-letter/${jobId}`, { method: "POST", body: { language, tone, notes } }),
        api<{ profile: { fullName: string | null } | null }>("/api/profile").catch(() => ({ profile: null })),
      ]);
      const name = profile.profile?.fullName?.trim();
      setLetter(name ? result.text.split(result.namePlaceholder).join(name) : result.text);
      setModel(result.model);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not write the cover letter.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the text and copy it yourself.");
    }
  }

  function download() {
    const blob = new Blob([letter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Cover letter - ${jobTitle} - ${company}.txt`.replace(/[\\/:*?"<>|]+/g, " ");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card space-y-4 p-5">
      <h2 className="section-title flex items-center gap-2">
        <FileText size={18} className="text-brand" aria-hidden />
        Cover letter
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "bn")} className="input">
            <option value="en">English</option>
            <option value="bn">বাংলা (Bangla)</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Tone</span>
          <select value={tone} onChange={(e) => setTone(e.target.value as "formal" | "friendly")} className="input">
            <option value="formal">Formal</option>
            <option value="friendly">Friendly</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Anything to add? (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={800}
          rows={2}
          placeholder="e.g. I did a 3-month internship at ABC Ltd. I can join immediately."
          className="input"
        />
      </label>

      <button type="button" onClick={write} disabled={busy} className="btn btn-primary">
        {busy ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : letter ? (
          <RefreshCw size={16} aria-hidden />
        ) : (
          <FileText size={16} aria-hidden />
        )}
        {busy ? "Writing…" : letter ? "Write again" : "Write cover letter"}
      </button>

      {error ? <p className="alert alert-error">{error}</p> : null}

      {letter ? (
        <div className="space-y-2">
          <textarea
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            rows={14}
            aria-label="Your cover letter"
            className="input font-[inherit] leading-relaxed"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
              {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={download} className="btn btn-secondary btn-sm">
              <Download size={16} aria-hidden />
              Download .txt
            </button>
          </div>
          <p className="hint">
            Written by AI ({model}) from this job and your CV profile. Read it and fix anything wrong before sending — you can edit it above.
          </p>
        </div>
      ) : null}
    </section>
  );
}
