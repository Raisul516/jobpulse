"use client";

// "Preferences": what kind of job you want. Used for the match score on every job
// and (next step) for deciding which new jobs to send to your phone.
import { FormEvent, useEffect, useState } from "react";
import NotificationSettings from "../components/NotificationSettings";
import { api, ApiError, FieldError } from "../lib/api";
import { JobCategory, JobType } from "../types/job";

type Preferences = {
  keywords: string[];
  excludeKeywords: string[];
  categories: JobCategory[];
  jobTypes: JobType[];
  locations: string[];
  minSalary: number | null;
  matchThreshold: number;
  notifyEnabled: boolean;
};

const CATEGORIES: JobCategory[] = ["Government", "Private", "Bank", "NGO", "Internship"];
const JOB_TYPES: JobType[] = ["Full-time", "Part-time", "Internship", "Contract"];
const COMMON_LOCATIONS = ["Dhaka", "Chattogram", "Rajshahi", "Khulna", "Sylhet", "Barishal", "Rangpur", "Mymensingh", "Gazipur", "Remote"];

const EMPTY: Preferences = {
  keywords: [],
  excludeKeywords: [],
  categories: [],
  jobTypes: [],
  locations: [],
  minSalary: null,
  matchThreshold: 70,
  notifyEnabled: true,
};

// "react, node.js ,  software engineer" -> ["react", "node.js", "software engineer"]
const splitList = (text: string) => text.split(",").map((w) => w.trim()).filter(Boolean);

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences>(EMPTY);
  // Keyword boxes are edited as plain text, turned into lists when saving.
  const [keywordText, setKeywordText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  useEffect(() => {
    api<{ preferences: Preferences | null }>("/api/preferences")
      .then((body) => {
        const p = body.preferences ?? EMPTY;
        setPrefs(p);
        setKeywordText(p.keywords.join(", "));
        setExcludeText(p.excludeKeywords.join(", "));
        setLoaded(true);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load preferences."));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    setFieldErrors([]);
    try {
      const body = await api<{ preferences: Preferences }>("/api/preferences", {
        method: "PUT",
        body: { ...prefs, keywords: splitList(keywordText), excludeKeywords: splitList(excludeText) },
      });
      setPrefs(body.preferences);
      setKeywordText(body.preferences.keywords.join(", "));
      setExcludeText(body.preferences.excludeKeywords.join(", "));
      setMessage("Saved. Match scores on the job list now use these preferences.");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (name: string) => fieldErrors.find((f) => f.path.startsWith(name))?.message;
  const inputClass = "input";
  const chip = (active: boolean) =>
    `chip ${active ? "chip-active" : ""}`;

  if (!loaded) {
    return <main className="page-narrow">{error ? <p className="text-red-600">{error}</p> : "Loading…"}</main>;
  }

  // Locations: common Bangladeshi ones plus anything already saved
  const locationOptions = [...new Set([...COMMON_LOCATIONS, ...prefs.locations])];

  return (
    <main className="page-narrow">
      <h1 className="page-title">Preferences</h1>
      <p className="page-sub mb-6">
        What kind of job are you looking for? JobPulse gives every job a match score from these.
        Leave a section empty to accept anything.
      </p>

      <div className="mb-6">
        <NotificationSettings />
      </div>

      <form onSubmit={save} className="space-y-6">
        <section className="space-y-2">
          <label className="block">
            <span className="font-medium">Keywords</span>
            <span className="block text-sm text-muted">
              Skills or job titles, separated by commas. A keyword in the job title counts most.
            </span>
            <input
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              placeholder="software engineer, react, trainee, node.js, প্রোগ্রামার"
              className={`${inputClass} mt-1`}
            />
          </label>
          {fieldError("keywords") ? <p className="text-sm text-red-600">{fieldError("keywords")}</p> : null}

          <label className="block">
            <span className="font-medium">Skip jobs whose title has</span>
            <span className="block text-sm text-muted">Comma-separated, e.g. senior, lead, sales</span>
            <input
              value={excludeText}
              onChange={(e) => setExcludeText(e.target.value)}
              placeholder="senior, lead, sales"
              className={`${inputClass} mt-1`}
            />
          </label>
        </section>

        <fieldset className="space-y-2">
          <legend className="font-medium">Categories</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={prefs.categories.includes(c)}
                onClick={() => setPrefs({ ...prefs, categories: toggle(prefs.categories, c) })}
                className={chip(prefs.categories.includes(c))}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{prefs.categories.length ? "" : "None selected = all categories"}</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-medium">Job types</legend>
          <div className="flex flex-wrap gap-2">
            {JOB_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={prefs.jobTypes.includes(t)}
                onClick={() => setPrefs({ ...prefs, jobTypes: toggle(prefs.jobTypes, t) })}
                className={chip(prefs.jobTypes.includes(t))}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{prefs.jobTypes.length ? "" : "None selected = all job types"}</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-medium">Locations</legend>
          <div className="flex flex-wrap gap-2">
            {locationOptions.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={prefs.locations.includes(l)}
                onClick={() => setPrefs({ ...prefs, locations: toggle(prefs.locations, l) })}
                className={chip(prefs.locations.includes(l))}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{prefs.locations.length ? "" : "None selected = anywhere"}</p>
        </fieldset>

        <section className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-medium">Minimum salary (BDT / month)</span>
            <input
              type="number"
              min={0}
              value={prefs.minSalary ?? ""}
              onChange={(e) => setPrefs({ ...prefs, minSalary: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="No minimum"
              className={`${inputClass} mt-1`}
            />
            <span className="block text-sm text-muted">Jobs that don&apos;t state a salary are still shown.</span>
          </label>

          <label className="block">
            <span className="font-medium">Match threshold: {prefs.matchThreshold}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={prefs.matchThreshold}
              onChange={(e) => setPrefs({ ...prefs, matchThreshold: Number(e.target.value) })}
              className="w-full mt-3"
            />
            <span className="block text-sm text-muted">
              70% ≈ one of your keywords is in the job title. Higher = fewer, closer matches.
            </span>
          </label>
        </section>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.notifyEnabled}
            onChange={(e) => setPrefs({ ...prefs, notifyEnabled: e.target.checked })}
          />
          Notify me about new matching jobs (deadline reminders for saved jobs are always sent)
        </label>

        {error ? <p className="text-red-600">{error}</p> : null}
        {message ? <p className="alert alert-success">{message}</p> : null}

        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </form>
    </main>
  );
}
