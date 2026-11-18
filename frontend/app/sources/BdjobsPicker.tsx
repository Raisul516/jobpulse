"use client";

// "Add bdjobs.com": pick the job categories you care about. JobPulse then checks bdjobs' newest jobs
// every 3 hours and keeps only these categories (bdjobs has ~6,000 open jobs; you don't want them all).
// The category list is only loaded when you open this section, so we don't call bdjobs on every visit.
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { JobCategory } from "../types/job";

type BdCategory = { id: number; name: string; newestCount: number };

type Props = {
  onAdded: (source: unknown, message: { text: string; kind: "ok" | "warn" | "error" }) => void;
};

const JOBPULSE_CATEGORIES: JobCategory[] = ["Private", "Bank", "NGO", "Government", "Internship"];

export default function BdjobsPicker({ onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<BdCategory[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [category, setCategory] = useState<JobCategory>("Private");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function openPicker() {
    setOpen(true);
    if (categories) return;
    setLoading(true);
    setError("");
    try {
      const body = await api<{ categories: BdCategory[] }>("/api/sources/bdjobs/categories");
      setCategories(body.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bdjobs categories.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function add() {
    if (selected.length === 0) return;
    setAdding(true);
    setError("");
    try {
      const ids = [...selected].sort((a, b) => a - b).join(",");
      const body = await api<{ source: unknown; summary: { message: string }; warning?: string }>("/api/sources", {
        method: "POST",
        body: { url: `https://bdjobs.com/h/jobs?jobpulseCategories=${ids}`, category },
      });
      onAdded(body.source, {
        text: `Added bdjobs.com. ${body.summary.message}. New jobs in these categories will be checked every 3 hours.`,
        kind: "ok",
      });
      setSelected([]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">bdjobs.com</h2>
          <p className="text-sm text-muted">
            Bangladesh&apos;s biggest job site. Choose categories — JobPulse reads bdjobs&apos; public list of newest jobs
            every 3 hours and keeps only these.
          </p>
        </div>
        {!open ? (
          <button type="button" onClick={openPicker} className="btn btn-secondary btn-sm">
            <Plus size={16} aria-hidden /> Choose categories
          </button>
        ) : null}
      </div>

      {open ? (
        <>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Loading categories from bdjobs.com…
            </p>
          ) : null}

          {categories ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={selected.includes(c.id)}
                  className={`chip ${selected.includes(c.id) ? "chip-active" : ""}`}
                  // aria-label: a title alone would replace the button's name for screen readers
                  aria-label={`${c.name} (${c.newestCount} of the 50 newest jobs)`}
                  title={`${c.newestCount} of the 50 newest jobs are in this category`}
                >
                  {c.name}
                  {c.newestCount ? <span className="ml-1 opacity-70">· {c.newestCount}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {categories ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                Show these jobs as
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as JobCategory)}
                  className="input w-auto py-1"
                >
                  {JOBPULSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <span className="hint">(Bank and NGO categories are set automatically)</span>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
                  Cancel
                </button>
                <button type="button" onClick={add} disabled={adding || selected.length === 0} className="btn btn-primary btn-sm">
                  {adding ? "Adding…" : `Add ${selected.length || ""} categor${selected.length === 1 ? "y" : "ies"}`}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <p className="alert alert-error">{error}</p> : null}
    </section>
  );
}
