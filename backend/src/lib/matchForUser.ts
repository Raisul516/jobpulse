// "How well does each of these jobs fit this user?" — used by the job list AND the notifier,
// so both always agree on what counts as a match.
import { checkEligibility, extractRequirements } from "./eligibility";
import { similarities } from "./jobEmbeddings";
import { MatchableJob, matchJob, MatchResult, Preferences } from "./matching";
import { getPreferences, StoredPreferences } from "./preferences";
import { getProfileForMatching } from "./profile";

// Used when you uploaded a CV but haven't set preferences: no filters, default threshold.
export const DEFAULT_PREFERENCES: Preferences = {
  keywords: [],
  excludeKeywords: [],
  categories: [],
  jobTypes: [],
  locations: [],
  minSalary: null,
  matchThreshold: 70,
};

type ScorableJob = MatchableJob & { id: number; deadline: string | null };

export async function addMatches<T extends ScorableJob>(userId: number, jobs: T[]) {
  const [savedPrefs, profile] = await Promise.all([getPreferences(userId), getProfileForMatching(userId)]);
  // null = you have set neither preferences nor a CV, so there's nothing to match against
  const prefs = savedPrefs ?? (profile ? DEFAULT_PREFERENCES : null);
  const similarity = profile?.embedding
    ? await similarities(profile.embedding, jobs.map((j) => j.id))
    : new Map<number, number>();

  const withMatch = jobs.map((job) => {
    let match: MatchResult | null = null;
    if (prefs) {
      const cv = profile
        ? {
            skills: profile.skills,
            similarity: similarity.get(job.id) ?? null,
            // the job's mandatory requirements, checked against your confirmed profile
            eligibility: checkEligibility(extractRequirements(`${job.title}\n${job.description ?? ""}`), profile, {
              deadline: job.deadline,
              isGovernment: job.category === "Government",
            }),
          }
        : undefined;
      match = matchJob(job, prefs, cv);
    }
    return { ...job, match };
  });

  return {
    jobs: withMatch,
    hasPreferences: prefs !== null,
    hasCvProfile: profile !== null,
    savedPrefs: savedPrefs as StoredPreferences | null,
  };
}
