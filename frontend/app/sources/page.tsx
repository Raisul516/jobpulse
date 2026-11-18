"use client";

// "Sources": company career pages JobPulse checks automatically every few hours.
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { JobCategory } from "../types/job";
import BdjobsPicker from "./BdjobsPicker";

type Source = {
  id: number;
  name: string;
  adapter: string;
  externalKey: string;
  baseUrl: string | null;
  defaultCategory: JobCategory | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  lastRunMessage: string | null;
  lastFoundCount: number | null;
  activeCount: number;
};

const CATEGORIES: JobCategory[] = ["Private", "Bank", "NGO", "Government", "Internship"];

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<JobCategory>("Private");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "warn" | "error" } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    api<{ sources: Source[]; platforms: string[] }>("/api/sources")
      .then((body) => {
        setSources(body.sources);
        setPlatforms(body.platforms);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Could not load sources."));
  }, []);

  function replace(source: Source) {
    setSources((old) => old?.map((s) => (s.id === source.id ? source : s)) ?? null);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setAdding(true);
    setMessage(null);
    try {
      const body = await api<{ source: Source; summary: { message: string }; warning?: string }>("/api/sources", {
        method: "POST",
        body: { url, category },
      });
      setSources((old) => [body.source, ...(old ?? [])]);
      setUrl("");
      setMessage(
        body.warning
          ? { text: `Added ${body.source.name}. ${body.warning}`, kind: "warn" }
          : { text: `Added ${body.source.name}. ${body.summary.message}.`, kind: "ok" }
      );
    } catch (err) {
      const text = err instanceof ApiError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.";
      setMessage({ text, kind: "error" });
    } finally {
      setAdding(false);
    }
  }

  async function runNow(source: Source) {
    setBusyId(source.id);
    setMessage(null);
    try {
      const body = await api<{ source: Source; summary: { ok: boolean; message: string } }>(`/api/sources/${source.id}/run`, {
        method: "POST",
      });
      replace(body.source);
      setMessage({ text: `${source.name}: ${body.summary.message}`, kind: body.summary.ok ? "ok" : "error" });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Something went wrong.", kind: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function update(source: Source, changes: { enabled?: boolean; defaultCategory?: JobCategory }) {
    setBusyId(source.id);
    try {
      const body = await api<{ source: Source }>(`/api/sources/${source.id}`, { method: "PATCH", body: changes });
      replace(body.source);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Something went wrong.", kind: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const messageClass = {
    ok: "alert-success",
    warn: "alert-warn",
    error: "alert-error",
  };

  return (
    <main className="page-narrow space-y-6">
      <div>
        <h1 className="page-title">Sources</h1>
        <p className="page-sub">
          Job sites and company career pages JobPulse checks automatically every 3 hours. New jobs are added to the{" "}
          <Link href="/" className="link">
            job list
          </Link>
          ; anything unclear waits in{" "}
          <Link href="/import" className="link">
            your review list
          </Link>
          .
        </p>
      </div>

      <BdjobsPicker
        onAdded={(source, msg) => {
          setSources((old) => [source as Source, ...(old ?? [])]);
          setMessage(msg);
        }}
      />

      <form onSubmit={add} className="card p-5 space-y-3">
        <h2 className="font-semibold">Add a company career page</h2>
        <p className="text-sm">
          Paste a link to the company&apos;s careers page or any one of its job posts.
          {platforms.length ? ` Works for career pages on ${platforms.join(", ")}.` : ""}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://jobs.smartrecruiters.com/CompanyName/…"
            className="input flex-1"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as JobCategory)}
            aria-label="Category for this company's jobs"
            className="input"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="submit" disabled={adding} className="btn btn-primary">
            {adding ? "Checking…" : "Add"}
          </button>
        </div>
      </form>

      {message ? <p className={`alert ${messageClass[message.kind]}`}>{message.text}</p> : null}
      {loadError ? <p className="text-red-600">{loadError}</p> : null}

      {sources === null && !loadError ? <p>Loading…</p> : null}
      {sources?.length === 0 ? <p>No companies yet. Add one above.</p> : null}

      <ul className="space-y-3">
        {sources?.map((s) => (
          <li key={s.id} className={`card p-5 space-y-2 ${s.enabled ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{s.name}</h2>
                <p className="text-sm">
                  {s.activeCount} open job{s.activeCount === 1 ? "" : "s"} on their site
                  {s.baseUrl ? (
                    <>
                      {" · "}
                      <a href={s.baseUrl} target="_blank" rel="noopener noreferrer" className="link">
                        careers page ↗
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <select
                value={s.defaultCategory ?? "Private"}
                disabled={busyId === s.id}
                onChange={(e) => update(s, { defaultCategory: e.target.value as JobCategory })}
                aria-label={`Category for ${s.name}`}
                className="input w-auto py-1"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <p className={`text-sm ${s.lastRunOk === false ? "text-red-600" : "text-muted"}`}>
              {s.lastRunAt ? `Last checked ${timeAgo(s.lastRunAt)}: ${s.lastRunMessage}` : "Not checked yet"}
            </p>

            <div className="flex flex-wrap gap-3 text-sm">
              <button
                type="button"
                onClick={() => runNow(s)}
                disabled={busyId === s.id || !s.enabled}
                className="btn btn-secondary btn-sm"
              >
                {busyId === s.id ? "Checking…" : "Check now"}
              </button>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  disabled={busyId === s.id}
                  onChange={(e) => update(s, { enabled: e.target.checked })}
                />
                Check automatically
              </label>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
