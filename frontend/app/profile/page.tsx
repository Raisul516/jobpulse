"use client";

// "My profile": upload your CV, check what JobPulse read from it, and confirm.
// Nothing from the CV is used for matching until you press "Confirm profile".
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { API_URL, api, ApiError, FieldError } from "../lib/api";

type Level = "PhD" | "Masters" | "Bachelor" | "Diploma" | "HSC" | "SSC";
type Education = {
  level: Level;
  degree: string;
  subject: string | null;
  institution: string | null;
  result: string | null;
  year: number | null;
};

type Profile = {
  fullName: string | null;
  dateOfBirth: string | null;
  skills: string[];
  education: Education[];
  experienceYears: number | null;
  summary: string | null;
  confirmedAt: string;
  hasEmbedding: boolean;
};

type Upload = {
  id: number;
  fileName: string;
  extracted: Record<string, { value: unknown; foundBy: string }>;
  warnings: string[];
  createdAt: string;
};

// What the form edits (strings for text boxes, converted when saving)
type Form = {
  fullName: string;
  dateOfBirth: string;
  skillsText: string;
  education: Education[];
  experienceYears: string;
  summary: string;
  cvUploadId: number | null;
};

const LEVELS: Level[] = ["PhD", "Masters", "Bachelor", "Diploma", "HSC", "SSC"];
const EMPTY_EDUCATION: Education = { level: "Bachelor", degree: "", subject: null, institution: null, result: null, year: null };

function formFromProfile(p: Profile | null): Form {
  return {
    fullName: p?.fullName ?? "",
    dateOfBirth: p?.dateOfBirth ?? "",
    skillsText: (p?.skills ?? []).join(", "),
    education: p?.education ?? [],
    experienceYears: p?.experienceYears?.toString() ?? "",
    summary: p?.summary ?? "",
    cvUploadId: null,
  };
}

function formFromUpload(u: Upload): Form {
  const e = u.extracted;
  const v = <T,>(key: string, fallback: T) => (e[key]?.value as T) ?? fallback;
  return {
    fullName: v("fullName", ""),
    dateOfBirth: v("dateOfBirth", ""),
    skillsText: v<string[]>("skills", []).join(", "),
    education: v<Education[]>("education", []),
    experienceYears: v<number | null>("experienceYears", null)?.toString() ?? "",
    summary: v("summary", ""),
    cvUploadId: u.id,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [aiServiceUp, setAiServiceUp] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [isDraft, setIsDraft] = useState(false); // true = showing fresh guesses from a CV, not yet confirmed
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "warn" | "error" } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  useEffect(() => {
    api<{ profile: Profile | null; latestUpload: Upload | null; aiServiceUp: boolean }>("/api/profile")
      .then((body) => {
        setProfile(body.profile);
        setUpload(body.latestUpload);
        setAiServiceUp(body.aiServiceUp);
        // A CV uploaded after the last confirmation is still waiting for review: show its draft.
        const pendingDraft =
          body.latestUpload && (!body.profile || new Date(body.latestUpload.createdAt) > new Date(body.profile.confirmedAt));
        setForm(pendingDraft ? formFromUpload(body.latestUpload!) : formFromProfile(body.profile));
        setIsDraft(Boolean(pendingDraft));
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Could not load your profile."));
  }, []);

  async function uploadCv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      // multipart upload: our api() helper only sends JSON, so use fetch directly here
      const data = new FormData();
      data.append("cv", file);
      const response = await fetch(`${API_URL}/api/profile/cv`, { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Upload failed (${response.status})`);
      const u = body.upload as Upload;
      setUpload(u);
      setForm(formFromUpload(u));
      setIsDraft(true);
      setMessage({
        text: u.warnings.length
          ? `Read ${u.fileName}. ${u.warnings.join(" ")}`
          : `Read ${u.fileName}. Check everything below, fix anything wrong, then press "Confirm profile".`,
        kind: u.warnings.length ? "warn" : "ok",
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Upload failed.", kind: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setFieldErrors([]);
    try {
      const body = await api<{ profile: Profile; embeddingError: string | null }>("/api/profile", {
        method: "PUT",
        body: {
          fullName: form.fullName,
          dateOfBirth: form.dateOfBirth || null,
          skills: form.skillsText.split(",").map((s) => s.trim()).filter(Boolean),
          education: form.education.filter((e) => e.degree.trim()),
          experienceYears: form.experienceYears === "" ? null : Number(form.experienceYears),
          summary: form.summary,
          cvUploadId: form.cvUploadId,
        },
      });
      setProfile(body.profile);
      setForm(formFromProfile(body.profile));
      setIsDraft(false);
      setMessage(
        body.embeddingError
          ? { text: `Profile saved, but CV similarity isn't available yet: ${body.embeddingError}`, kind: "warn" }
          : { text: "Profile confirmed. Every job now shows how well it matches your CV.", kind: "ok" }
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields);
        setMessage({ text: err.message, kind: "error" });
      } else {
        setMessage({ text: "Something went wrong.", kind: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteAll() {
    if (!window.confirm("Delete your profile and every CV you uploaded? Matching will stop using your CV.")) return;
    try {
      await api("/api/profile", { method: "DELETE" });
      setProfile(null);
      setUpload(null);
      setForm(formFromProfile(null));
      setIsDraft(false);
      setMessage({ text: "Your profile and uploaded CV text were deleted.", kind: "ok" });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Could not delete.", kind: "error" });
    }
  }

  function updateEducation(index: number, changes: Partial<Education>) {
    setForm((f) => f && { ...f, education: f.education.map((e, i) => (i === index ? { ...e, ...changes } : e)) });
  }

  const inputClass = "w-full border rounded-md px-3 py-2 bg-white text-black";
  const messageClass = { ok: "bg-green-100 text-green-900", warn: "bg-amber-100 text-amber-900", error: "bg-red-100 text-red-900" };
  const hint = (key: string) =>
    isDraft ? (
      upload?.extracted[key] ? (
        <span className="text-xs text-amber-700">Read from your CV — please check</span>
      ) : (
        <span className="text-xs text-red-700">Not found in your CV</span>
      )
    ) : null;
  const errorFor = (path: string) => fieldErrors.find((f) => f.path.startsWith(path))?.message;

  if (loadError) return <main className="max-w-3xl mx-auto p-6 text-red-600">{loadError}</main>;
  if (!form) return <main className="max-w-3xl mx-auto p-6">Loading…</main>;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">My profile</h1>
        <p className="text-sm">
          Upload your CV and JobPulse compares every job with it. Your CV is read on this computer only — it isn&apos;t
          sent to any outside service.
        </p>
      </div>

      {!aiServiceUp ? (
        <p className="rounded-md bg-amber-100 text-amber-900 p-3 text-sm">
          The AI service isn&apos;t running, so CVs can&apos;t be read right now. Start it (see README → ai-service) and reload
          this page.
        </p>
      ) : null}

      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Upload your CV</h2>
        <p className="text-sm">PDF or Word (.docx), up to 5 MB. Scanned images can&apos;t be read yet.</p>
        <label className={`inline-block rounded-md bg-blue-600 text-white px-4 py-2 cursor-pointer ${uploading || !aiServiceUp ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading ? "Reading your CV…" : upload ? "Upload a newer CV" : "Choose CV file"}
          <input type="file" accept=".pdf,.docx" onChange={uploadCv} className="sr-only" disabled={uploading || !aiServiceUp} />
        </label>
        {upload ? <p className="text-sm text-gray-500">Last uploaded: {upload.fileName} ({formatDate(upload.createdAt)})</p> : null}
      </section>

      {message ? <p className={`rounded-md p-3 ${messageClass[message.kind]}`}>{message.text}</p> : null}

      {isDraft ? (
        <p className="rounded-md bg-blue-100 text-blue-900 p-3 text-sm">
          This is a <strong>draft</strong> read from your CV. It isn&apos;t used for matching until you confirm it.
        </p>
      ) : profile ? (
        <p className="text-sm text-green-600">✓ Confirmed {formatDate(profile.confirmedAt)}{profile.hasEmbedding ? "" : " (CV similarity not computed yet)"}</p>
      ) : null}

      <form onSubmit={confirm} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="flex justify-between gap-2 text-sm font-medium">Full name {hint("fullName")}</span>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="flex justify-between gap-2 text-sm font-medium">Date of birth {hint("dateOfBirth")}</span>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              className={inputClass}
            />
            <span className="text-xs text-gray-500">Used later to check age limits in government circulars.</span>
          </label>
        </div>

        <label className="block">
          <span className="flex justify-between gap-2 text-sm font-medium">Skills (comma-separated) {hint("skills")}</span>
          <textarea
            value={form.skillsText}
            onChange={(e) => setForm({ ...form, skillsText: e.target.value })}
            rows={3}
            className={inputClass}
          />
          {errorFor("skills") ? <span className="text-sm text-red-600">{errorFor("skills")}</span> : null}
        </label>

        <fieldset className="space-y-3">
          <legend className="flex justify-between gap-2 w-full text-sm font-medium">Education {hint("education")}</legend>
          {form.education.map((e, i) => (
            <div key={i} className="border rounded-md p-3 grid gap-2 sm:grid-cols-6">
              <select
                value={e.level}
                onChange={(ev) => updateEducation(i, { level: ev.target.value as Level })}
                aria-label="Level"
                className={`${inputClass} sm:col-span-1`}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                value={e.degree}
                onChange={(ev) => updateEducation(i, { degree: ev.target.value })}
                placeholder="Degree, e.g. BSc in CSE"
                aria-label="Degree"
                className={`${inputClass} sm:col-span-3`}
              />
              <input
                value={e.result ?? ""}
                onChange={(ev) => updateEducation(i, { result: ev.target.value || null })}
                placeholder="CGPA / GPA"
                aria-label="Result"
                className={`${inputClass} sm:col-span-1`}
              />
              <input
                type="number"
                value={e.year ?? ""}
                onChange={(ev) => updateEducation(i, { year: ev.target.value ? Number(ev.target.value) : null })}
                placeholder="Year"
                aria-label="Year"
                className={`${inputClass} sm:col-span-1`}
              />
              <input
                value={e.subject ?? ""}
                onChange={(ev) => updateEducation(i, { subject: ev.target.value || null })}
                placeholder="Subject"
                aria-label="Subject"
                className={`${inputClass} sm:col-span-2`}
              />
              <input
                value={e.institution ?? ""}
                onChange={(ev) => updateEducation(i, { institution: ev.target.value || null })}
                placeholder="Institution"
                aria-label="Institution"
                className={`${inputClass} sm:col-span-3`}
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, education: form.education.filter((_, j) => j !== i) })}
                className="rounded-md border px-2 py-1 text-sm sm:col-span-1"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm({ ...form, education: [...form.education, { ...EMPTY_EDUCATION }] })}
            className="rounded-md border px-3 py-1 text-sm"
          >
            + Add education
          </button>
          {errorFor("education") ? <p className="text-sm text-red-600">{errorFor("education")}</p> : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="flex justify-between gap-2 text-sm font-medium">Years of experience</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={form.experienceYears}
              onChange={(e) => setForm({ ...form, experienceYears: e.target.value })}
              className={inputClass}
            />
            {hint("experienceYears")}
          </label>
          <label className="block sm:col-span-2">
            <span className="flex justify-between gap-2 text-sm font-medium">Summary / career objective {hint("summary")}</span>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              rows={3}
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="rounded-md bg-blue-600 text-white px-4 py-2 disabled:opacity-50">
            {saving ? "Saving…" : isDraft ? "Confirm profile" : "Save changes"}
          </button>
          {profile || upload ? (
            <button type="button" onClick={deleteAll} className="rounded-md border border-red-400 text-red-600 px-4 py-2">
              Delete my CV data
            </button>
          ) : null}
        </div>
      </form>
    </main>
  );
}
