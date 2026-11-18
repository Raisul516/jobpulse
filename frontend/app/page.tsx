"use client";

import { Loader2, Search, SearchX, ShieldCheck, Sparkles, Briefcase } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import JobCard from "./components/JobCard";
import { apiFetch } from "./lib/api";
import { saveJob, unsaveJob } from "./lib/saved";
import { Job } from "./types/job";

// useSearchParams() reads filters from the address (e.g. a notification opens "/?sort=best-match").
// Next.js wants it inside a <Suspense> boundary; the skeleton shows for the split second before.
export default function Home() {
  return (
    <Suspense fallback={<JobsSkeleton />}>
      <JobsPage />
    </Suspense>
  );
}

function JobsSkeleton() {
  return (
    <main className="page space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-36 animate-pulse p-5">
          <div className="flex gap-4">
            <div className="h-11 w-11 rounded-xl bg-surface-2" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-1/2 rounded bg-surface-2" />
              <div className="h-3 w-1/3 rounded bg-surface-2" />
              <div className="h-3 w-2/3 rounded bg-surface-2" />
            </div>
          </div>
        </div>
      ))}
    </main>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Briefcase; label: string; value: string | number; tone: string }) {
  return (
    <div className="card flex items-center gap-3 p-3 sm:p-4">
      {/* icon only where there's room; on phones the three boxes sit side by side */}
      <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${tone}`}>
        <Icon size={20} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-none sm:text-2xl">{value}</p>
        <p className="mt-1 text-xs leading-tight text-muted">{label}</p>
      </div>
    </div>
  );
}

function JobsPage() {
  const query = useSearchParams();
  const [search, setSearch] = useState(() => query.get("search") ?? "");
  const [location, setLocation] = useState(() => query.get("location") ?? "All");
  const [jobType, setJobType] = useState(() => query.get("jobType") ?? "All");
  const [category, setCategory] = useState(() => query.get("category") ?? "All");
  const [sort, setSort] = useState(() => query.get("sort") ?? "newest");
  const [matchesOnly, setMatchesOnly] = useState(() => query.get("matchesOnly") === "true");
  const [locations, setLocations] = useState<string[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [reloadKey, setReloadKey] = useState(0);
  // The last finished request: which URL it was for, and what came back.
  const [result, setResult] = useState<{ key: string; jobs: Job[]; error: string; hasPreferences: boolean } | null>(null);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState("");

  // Build the request URL from the current filters (plain calculation, no state needed).
  const params = new URLSearchParams();
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
  if (location !== "All") params.set("location", location);
  if (jobType !== "All") params.set("jobType", jobType);
  if (category !== "All") params.set("category", category);
  if (sort !== "newest") params.set("sort", sort);
  if (matchesOnly) params.set("matchesOnly", "true");
  const requestPath = `/api/jobs?${params.toString()}`;
  const requestKey = `${requestPath}#${reloadKey}`; // reloadKey forces a retry with the same URL

  // "Loading" = the last finished request isn't the one we want now.
  const loading = result?.key !== requestKey;
  const jobs = result?.jobs ?? [];
  const error = loading ? "" : result.error;
  // Keep the last known answer while a new request loads, so the hint doesn't flicker.
  const hasPreferences = result?.hasPreferences ?? true;

  // Load the location list once, from the jobs that actually exist.
  useEffect(() => {
    apiFetch("/api/jobs/locations")
      .then((response) => (response.ok ? response.json() : { locations: [] }))
      .then((body: { locations: string[] }) => setLocations(body.locations))
      .catch(() => setLocations([]));
  }, [reloadKey]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch(requestPath, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        return response.json() as Promise<{ jobs: Job[]; count: number; hasPreferences: boolean }>;
      })
      .then((body) => {
        setResult({ key: requestKey, jobs: body.jobs, error: "", hasPreferences: body.hasPreferences });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          key: requestKey,
          hasPreferences: true,
          jobs: [],
          error: "Could not load jobs. Start the backend with npm run dev in the backend folder.",
        });
      });

    return () => controller.abort();
  }, [requestPath, requestKey]);

  // Save / unsave a job, then update just that card (no need to reload the whole list).
  async function toggleSave(job: Job) {
    setBusyJobId(job.id);
    setSaveError("");
    try {
      const nowSaved = job.savedStatus === null;
      if (nowSaved) await saveJob(job.id);
      else await unsaveJob(job.id);
      setResult((old) =>
        old && {
          ...old,
          jobs: old.jobs.map((j) => (j.id === job.id ? { ...j, savedStatus: nowSaved ? "saved" : null } : j)),
        }
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the job.");
    } finally {
      setBusyJobId(null);
    }
  }

  function clearFilters() {
    setSearch("");
    setLocation("All");
    setJobType("All");
    setCategory("All");
    setMatchesOnly(false);
  }

  const showInitialLoading = loading && jobs.length === 0 && !error;
  const matchCount = jobs.filter((j) => j.match?.isMatch).length;
  const eligibleCount = jobs.filter((j) => j.match?.eligibility?.status === "pass").length;
  const filtersActive = search || location !== "All" || jobType !== "All" || category !== "All" || matchesOnly;

  return (
    <main className="page">
      <div className="mb-6">
        <h1 className="page-title">Find your next job</h1>
        <p className="page-sub">Jobs from your sources, matched against your CV and preferences.</p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat icon={Briefcase} label={filtersActive ? "Jobs shown" : "Open jobs"} value={showInitialLoading ? "…" : jobs.length} tone="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" />
        <Stat icon={Sparkles} label="Match you" value={showInitialLoading ? "…" : matchCount} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" />
        <Stat icon={ShieldCheck} label="You're eligible for" value={showInitialLoading ? "…" : eligibleCount} tone="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" />
      </div>

      {!hasPreferences ? (
        <div className="alert alert-info mb-6">
          Upload your CV or tell JobPulse what you&apos;re looking for to see a match score on every job.{" "}
          <Link href="/profile" className="link">
            Upload CV →
          </Link>{" "}
          <Link href="/preferences" className="link">
            Set preferences →
          </Link>
        </div>
      ) : null}

      <div className="card mb-6 space-y-3 p-4">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            placeholder="Search by job title or company"
            aria-label="Search by job title or company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" className="input">
            <option value="All">All locations</option>
            {locations.map((place) => (
              <option key={place} value={place}>
                {place}
              </option>
            ))}
          </select>

          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="input">
            <option value="All">All categories</option>
            <option value="Government">Government</option>
            <option value="Private">Private</option>
            <option value="Bank">Bank</option>
            <option value="NGO">NGO</option>
            <option value="Internship">Internship</option>
          </select>

          <select value={jobType} onChange={(e) => setJobType(e.target.value)} aria-label="Job type" className="input">
            <option value="All">All job types</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Internship">Internship</option>
            <option value="Contract">Contract</option>
          </select>

          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="input">
            <option value="newest">Newest first</option>
            <option value="best-match">Best match first</option>
            <option value="deadline">Deadline: soonest</option>
            <option value="salary-high">Salary: high to low</option>
            <option value="salary-low">Salary: low to high</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMatchesOnly((m) => !m)}
            disabled={!hasPreferences}
            aria-pressed={matchesOnly}
            className={`chip inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50 ${matchesOnly ? "chip-active" : ""}`}
          >
            <Sparkles size={14} aria-hidden />
            Only my matches
          </button>
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="btn btn-ghost btn-sm text-muted">
              Clear filters
            </button>
          ) : null}
          {loading && !showInitialLoading ? (
            <span className="ml-auto flex items-center gap-1.5 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Updating…
            </span>
          ) : null}
        </div>
      </div>

      {saveError ? <p className="alert alert-error mb-4">{saveError}</p> : null}

      {error ? (
        <div className="alert alert-error mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="btn btn-secondary btn-sm">
            Try again
          </button>
        </div>
      ) : null}

      {showInitialLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-36 animate-pulse" />
          ))}
        </div>
      ) : null}

      {!error && !showInitialLoading ? (
        jobs.length > 0 ? (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onToggleSave={toggleSave} busy={busyJobId === job.id} />
            ))}
            <p className="pt-2 text-center text-xs text-muted">
              Jobs marked &quot;Demo listing&quot; are sample data, not real vacancies.
            </p>
          </div>
        ) : (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <SearchX size={36} className="text-muted" aria-hidden />
            <p className="font-medium">No jobs found</p>
            <p className="text-sm text-muted">Try a different search, or clear a filter.</p>
            {filtersActive ? (
              <button type="button" onClick={clearFilters} className="btn btn-secondary btn-sm">
                Clear filters
              </button>
            ) : null}
          </div>
        )
      ) : null}
    </main>
  );
}
