"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import JobCard from "./components/JobCard";
import { API_URL } from "./lib/api";
import { Job } from "./types/job";

export default function Home() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All");
  const [jobType, setJobType] = useState("All");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("newest");
  const [locations, setLocations] = useState<string[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // The last finished request: which URL it was for, and what came back.
  const [result, setResult] = useState<{ key: string; jobs: Job[]; error: string } | null>(null);

  // Build the request URL from the current filters (plain calculation, no state needed).
  const params = new URLSearchParams();
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
  if (location !== "All") params.set("location", location);
  if (jobType !== "All") params.set("jobType", jobType);
  if (category !== "All") params.set("category", category);
  if (sort !== "newest") params.set("sort", sort);
  const requestUrl = `${API_URL}/api/jobs?${params.toString()}`;
  const requestKey = `${requestUrl}#${reloadKey}`; // reloadKey forces a retry with the same URL

  // "Loading" = the last finished request isn't the one we want now.
  const loading = result?.key !== requestKey;
  const jobs = result?.jobs ?? [];
  const error = loading ? "" : result.error;

  // Load the location list once, from the jobs that actually exist.
  useEffect(() => {
    fetch(`${API_URL}/api/jobs/locations`)
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

    fetch(requestUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        return response.json() as Promise<{ jobs: Job[]; count: number }>;
      })
      .then((body) => {
        setResult({ key: requestKey, jobs: body.jobs, error: "" });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          key: requestKey,
          jobs: [],
          error: "Could not load jobs. Start the backend with npm run dev in the backend folder.",
        });
      });

    return () => controller.abort();
  }, [requestUrl, requestKey]);

  const controlClass = "border rounded-md px-3 py-2 bg-white text-black";
  const showInitialLoading = loading && jobs.length === 0 && !error;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">JobPulse</h1>
          <p className="text-sm">Jobs marked &quot;Demo listing&quot; are sample data, not real vacancies.</p>
        </div>
        <Link href="/import" className="rounded-md bg-blue-600 text-white px-4 py-2">
          + Add job from link
        </Link>
      </div>

      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:flex-wrap">
        <input
          type="text"
          placeholder="Search by title or company"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${controlClass} flex-1 min-w-48`}
        />

        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={controlClass}
        >
          <option value="All">All locations</option>
          {locations.map((place) => (
            <option key={place} value={place}>
              {place}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={controlClass}
        >
          <option value="All">All categories</option>
          <option value="Government">Government</option>
          <option value="Private">Private</option>
          <option value="Bank">Bank</option>
          <option value="NGO">NGO</option>
          <option value="Internship">Internship</option>
        </select>

        <select
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
          className={controlClass}
        >
          <option value="All">All job types</option>
          <option value="Full-time">Full-time</option>
          <option value="Part-time">Part-time</option>
          <option value="Internship">Internship</option>
          <option value="Contract">Contract</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className={controlClass}
        >
          <option value="newest">Newest first</option>
          <option value="deadline">Deadline: soonest</option>
          <option value="salary-high">Salary: high to low</option>
          <option value="salary-low">Salary: low to high</option>
        </select>
      </div>

      {error ? (
        <div className="mb-4">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="mt-3 border rounded-md px-3 py-2"
          >
            Try again
          </button>
        </div>
      ) : null}

      {showInitialLoading ? <p>Loading jobs...</p> : null}

      {!error && !showInitialLoading ? (
        <>
          <p className="mb-4 text-sm">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"} found
            {loading ? " · Updating..." : ""}
          </p>

          {jobs.length > 0 ? (
            jobs.map((job) => <JobCard key={job.id} job={job} />)
          ) : (
            <p>No jobs found. Try a different search or clear a filter.</p>
          )}
        </>
      ) : null}
    </main>
  );
}
