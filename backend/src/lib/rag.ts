// RAG = Retrieval-Augmented Generation.
//   Retrieval:  find the right facts in OUR database (jobs, your CV profile, match checks).
//   Generation: give only those facts to the LLM (in the ai-service) and let it write the answer.
// The LLM never sees the whole database, and it may only recommend jobs we sent it.
import { createHash } from "node:crypto";
import { askAboutJobs, AiServiceError, embedTexts, explainMatch, LlmProfile } from "./aiService";
import { findJobById, findJobsBySimilarity } from "./jobQueries";
import { addMatches } from "./matchForUser";
import { getProfile, getProfileForMatching } from "./profile";
import { Job } from "../types/job";

// ---------- protect the free LLM quota ----------
// At most 20 LLM calls per 10 minutes (in memory). Free tiers allow roughly this much.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS = 20;
let calls: number[] = [];

function takeLlmCall(): void {
  const now = Date.now();
  calls = calls.filter((t) => now - t < WINDOW_MS);
  if (calls.length >= MAX_CALLS) {
    throw new AiServiceError("You've asked a lot in a short time. Please wait a few minutes.", 429);
  }
  calls.push(now);
}

// ---------- small cache: same job + same profile + same match = same explanation ----------
const cache = new Map<string, { text: string; model: string }>();
const CACHE_SIZE = 200;

function remember(key: string, value: { text: string; model: string }) {
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

async function profileForLlm(userId: number): Promise<LlmProfile> {
  const profile = await getProfile(userId);
  if (!profile) return null;
  return {
    skills: profile.skills,
    experienceYears: profile.experienceYears,
    education: profile.education,
    summary: profile.summary,
  };
}

// What the LLM gets about a job (no internal fields like savedStatus).
function jobFacts(job: Job & { match?: { score: number } | null }) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    jobType: job.jobType,
    category: job.category,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    deadline: job.deadline,
    description: job.description,
    matchScore: job.match?.score ?? null,
  };
}

// ---------- 1. "Why does this job match me?" ----------

export async function explainJob(userId: number, jobId: number) {
  const job = await findJobById(jobId, userId);
  if (!job) return null;
  const [[withMatch], profile] = await Promise.all([addMatches(userId, [job]).then((r) => r.jobs), profileForLlm(userId)]);
  const facts = jobFacts(withMatch);
  const match = withMatch.match
    ? { score: withMatch.match.score, reasons: withMatch.match.reasons, eligibility: withMatch.match.eligibility }
    : null;

  const key = createHash("sha256").update(JSON.stringify([userId, facts, profile, match])).digest("hex");
  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true };

  takeLlmCall();
  const result = await explainMatch(facts, profile, match);
  remember(key, result);
  return { ...result, cached: false };
}

// ---------- 2. "Ask JobPulse" ----------

const BY_QUESTION = 8;
const BY_PROFILE = 4;

export async function askJobPulse(userId: number, question: string) {
  // Retrieval: jobs closest in meaning to the question, plus a few closest to your CV
  // (so "which jobs suit me?" works even though that sentence says nothing about skills).
  const [[questionVector], matching, profile] = await Promise.all([
    embedTexts([question]),
    getProfileForMatching(userId),
    profileForLlm(userId),
  ]);
  const found = new Map<number, Job>();
  for (const job of await findJobsBySimilarity(questionVector, userId, BY_QUESTION)) found.set(job.id, job);
  if (matching?.embedding) {
    for (const job of await findJobsBySimilarity(matching.embedding, userId, BY_PROFILE)) found.set(job.id, job);
  }
  const { jobs } = await addMatches(userId, [...found.values()]);
  if (jobs.length === 0) {
    return { answer: "There are no open jobs with AI search data yet. Add sources or wait for the next collection.", jobs: [], recommended: [] };
  }

  // Generation
  takeLlmCall();
  const result = await askAboutJobs(question, jobs.map(jobFacts), profile);

  // recommended jobs first (in the LLM's order), then the rest of what we found
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const recommended = result.jobIds.map((id) => byId.get(id)!).filter(Boolean);
  const others = jobs.filter((j) => !result.jobIds.includes(j.id));
  return { answer: result.answer, model: result.model, recommended, jobs: [...recommended, ...others] };
}
