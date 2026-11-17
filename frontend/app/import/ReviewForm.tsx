"use client";

// Shows what JobPulse guessed from a pasted link, lets the user correct it,
// and only then saves it as a job (or links it to an existing one).
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError, ExtractedJob, FieldError, FoundBy, JobImport, PossibleDuplicate } from "../lib/api";
import { JobCategory, JobType } from "../types/job";

const JOB_TYPES: JobType[] = ["Full-time", "Part-time", "Internship", "Contract"];
const CATEGORIES: JobCategory[] = ["Government", "Private", "Bank", "NGO", "Internship"];

// Form values are all strings (that's what inputs give us); we convert when sending.
type FormValues = {
  title: string;
  company: string;
  location: string;
  jobType: string;
  category: string;
  salaryMin: string;
  salaryMax: string;
  deadline: string;
  applyUrl: string;
  description: string;
};

function initialValues(extracted: ExtractedJob | null, sourceUrl: string): FormValues {
  const e = extracted ?? {};
  return {
    title: e.title?.value ?? "",
    company: e.company?.value ?? "",
    location: e.location?.value ?? "",
    jobType: e.jobType?.value ?? "",
    category: e.category?.value ?? "",
    salaryMin: e.salaryMin?.value?.toString() ?? "",
    salaryMax: e.salaryMax?.value?.toString() ?? "",
    deadline: e.deadline?.value ?? "",
    applyUrl: e.applyUrl?.value ?? sourceUrl,
    description: e.description?.value ?? "",
  };
}

const HINTS: Record<FoundBy | "missing", { text: string; className: string }> = {
  structured: { text: "Found in the page's job data", className: "text-green-700" },
  meta: { text: "From the page title — please check", className: "text-amber-700" },
  text: { text: "Guessed from the text — check carefully", className: "text-amber-700" },
  missing: { text: "Not found — please fill in", className: "text-red-700" },
};

function Hint({ foundBy }: { foundBy?: FoundBy }) {
  const hint = HINTS[foundBy ?? "missing"];
  return <span className={`text-xs ${hint.className}`}>{hint.text}</span>;
}

type Props = {
  item: JobImport;
  onDone: (message: string) => void;
};

export default function ReviewForm({ item, onDone }: Props) {
  const extracted = item.extracted ?? {};
  const [values, setValues] = useState<FormValues>(() => initialValues(item.extracted, item.sourceUrl));
  // "new" = create a new job; a number = same vacancy as that existing job
  const [choice, setChoice] = useState<"new" | number>("new");
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>(item.possibleDuplicates ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // Re-check for duplicates whenever the user changes the title or company.
  useEffect(() => {
    if (!values.title.trim() || !values.company.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ title: values.title, company: values.company });
      api<{ jobs: PossibleDuplicate[] }>(`/api/jobs/similar?${query}`, { signal: controller.signal })
        .then((body) => setDuplicates(body.jobs))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values.title, values.company]);

  // If the job the user picked is no longer in the list, fall back to "new".
  const selected = choice !== "new" && duplicates.some((d) => d.id === choice) ? choice : "new";

  function update(name: keyof FormValues, value: string) {
    setValues((old) => ({ ...old, [name]: value }));
  }

  function errorFor(name: keyof FormValues) {
    return fieldErrors.find((f) => f.path === `job.${name}`)?.message;
  }

  async function approve(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFieldErrors([]);

    const toNumber = (text: string) => (text.trim() === "" ? null : Number(text));
    const body =
      selected === "new"
        ? {
            job: {
              ...values,
              salaryMin: toNumber(values.salaryMin),
              salaryMax: toNumber(values.salaryMax),
              deadline: values.deadline || null,
            },
          }
        : { linkToJobId: selected };

    try {
      const result = await api<{ jobId: number; created: boolean }>(`/api/imports/${item.id}/approve`, {
        method: "POST",
        body,
      });
      onDone(result.created ? `Saved "${values.title}" as a new job.` : "Linked this link to the existing job.");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
      } else {
        setError("Something went wrong.");
      }
      setSaving(false);
    }
  }

  async function reject() {
    setSaving(true);
    try {
      await api(`/api/imports/${item.id}/reject`, { method: "POST" });
      onDone("Import discarded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  const inputClass = "w-full border rounded-md px-3 py-2 bg-white text-black";
  const creatingNew = selected === "new";

  const textInput = (name: keyof FormValues, label: string, type = "text", required = false) => (
    <label className="block">
      <span className="flex flex-wrap justify-between gap-2 text-sm font-medium">
        {label}
        <Hint foundBy={extracted[name]?.foundBy} />
      </span>
      <input
        type={type}
        value={values[name]}
        onChange={(e) => update(name, e.target.value)}
        required={required && creatingNew}
        disabled={!creatingNew}
        min={type === "number" ? 0 : undefined}
        className={inputClass}
      />
      {errorFor(name) ? <span className="text-sm text-red-600">{errorFor(name)}</span> : null}
    </label>
  );

  const selectInput = (name: "jobType" | "category", label: string, options: string[]) => (
    <label className="block">
      <span className="flex flex-wrap justify-between gap-2 text-sm font-medium">
        {label}
        <Hint foundBy={extracted[name]?.foundBy} />
      </span>
      <select
        value={values[name]}
        onChange={(e) => update(name, e.target.value)}
        required={creatingNew}
        disabled={!creatingNew}
        className={inputClass}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {errorFor(name) ? <span className="text-sm text-red-600">{errorFor(name)}</span> : null}
    </label>
  );

  return (
    <form onSubmit={approve} className="border rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Check the details</h2>
        <p className="text-sm break-all">
          From:{" "}
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {item.sourceUrl}
          </a>
        </p>
      </div>

      {item.fetchError ? (
        <p className="rounded-md bg-amber-100 text-amber-900 p-3 text-sm">
          Couldn&apos;t read the page: {item.fetchError} You can still fill in the details yourself.
        </p>
      ) : null}

      {duplicates.length > 0 ? (
        <fieldset className="rounded-md border border-amber-400 p-3 space-y-2">
          <legend className="px-1 font-medium">This might already be in JobPulse</legend>
          <label className="flex gap-2">
            <input type="radio" checked={selected === "new"} onChange={() => setChoice("new")} />
            It&apos;s a different vacancy — save as a new job
          </label>
          {duplicates.map((d) => (
            <label key={d.id} className="flex gap-2">
              <input type="radio" checked={selected === d.id} onChange={() => setChoice(d.id)} />
              <span>
                Same as <strong>{d.title}</strong> at {d.company}
                {d.deadline ? ` (deadline ${d.deadline})` : ""}
                <span className="block text-xs text-gray-500">{d.reason}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className={`grid gap-3 sm:grid-cols-2 ${creatingNew ? "" : "opacity-50"}`}>
        {textInput("title", "Job title", "text", true)}
        {textInput("company", "Company / organisation", "text", true)}
        {textInput("location", "Location", "text", true)}
        {textInput("deadline", "Application deadline", "date")}
        {selectInput("jobType", "Job type", JOB_TYPES)}
        {selectInput("category", "Category", CATEGORIES)}
        {textInput("salaryMin", "Salary from (BDT / month)", "number")}
        {textInput("salaryMax", "Salary to (BDT / month)", "number")}
        <div className="sm:col-span-2">{textInput("applyUrl", "Application link", "url")}</div>
        <label className="block sm:col-span-2">
          <span className="flex flex-wrap justify-between gap-2 text-sm font-medium">
            Description
            <Hint foundBy={extracted.description?.foundBy} />
          </span>
          <textarea
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            disabled={!creatingNew}
            rows={5}
            className={inputClass}
          />
        </label>
      </div>

      {error ? <p className="text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className="rounded-md bg-blue-600 text-white px-4 py-2 disabled:opacity-50">
          {saving ? "Saving…" : creatingNew ? "Save job" : "Link to existing job"}
        </button>
        <button type="button" onClick={reject} disabled={saving} className="rounded-md border px-4 py-2 disabled:opacity-50">
          Discard
        </button>
      </div>
    </form>
  );
}
