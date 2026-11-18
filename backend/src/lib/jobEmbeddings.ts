// Gives every open job an embedding (its meaning as numbers) so it can be compared with your CV.
// Runs in small batches in the background; if the AI service is off, it simply tries again later.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { jobs } from "../db/schema";
import { aiServiceIsUp, embedTexts } from "./aiService";

const BATCH = 32;

export function jobText(job: { title: string; company: string; description: string | null }): string {
  // Title twice: it says the most about the job, the description is often long and generic
  return `${job.title}. ${job.title} at ${job.company}. ${job.description ?? ""}`.slice(0, 2000);
}

let running = false;

export async function embedMissingJobs(): Promise<number> {
  if (running || !(await aiServiceIsUp())) return 0;
  running = true;
  let done = 0;
  try {
    while (true) {
      const batch = await db
        .select({ id: jobs.id, title: jobs.title, company: jobs.company, description: jobs.description })
        .from(jobs)
        .where(and(eq(jobs.status, "open"), isNull(jobs.embedding)))
        .limit(BATCH);
      if (batch.length === 0) break;

      const vectors = await embedTexts(batch.map(jobText));
      for (let i = 0; i < batch.length; i++) {
        await db.update(jobs).set({ embedding: vectors[i] }).where(eq(jobs.id, batch[i].id));
      }
      done += batch.length;
    }
  } catch (err) {
    console.error("[embeddings] failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
  if (done) {
    console.log(`[embeddings] embedded ${done} job(s)`);
    // new jobs can now be scored against your CV -> check whether any should notify you
    void import("./notifier").then((m) => m.runNotifier()).catch((err) => console.error("[notify] failed:", err));
  }
  return done;
}

// When a job's text changes, its old embedding is wrong: clear it so it's recomputed.
export async function clearJobEmbeddings(jobIds: number[]): Promise<void> {
  if (jobIds.length) await db.update(jobs).set({ embedding: null }).where(inArray(jobs.id, jobIds));
}

// Cosine similarity (-1..1) between a profile embedding and each job that has one.
export async function similarities(profileEmbedding: number[], jobIds: number[]): Promise<Map<number, number>> {
  if (jobIds.length === 0) return new Map();
  const vector = JSON.stringify(profileEmbedding); // pgvector accepts "[0.1,0.2,...]"
  const rows = await db
    .select({ id: jobs.id, similarity: sql<number>`1 - (${jobs.embedding} <=> ${vector}::vector)` })
    .from(jobs)
    .where(and(inArray(jobs.id, jobIds), sql`${jobs.embedding} IS NOT NULL`));
  return new Map(rows.map((r) => [r.id, Number(r.similarity)]));
}

export function startEmbeddingTimer(): void {
  const run = () => void embedMissingJobs();
  setTimeout(run, 5_000).unref();
  // every 10 minutes (EMBED_INTERVAL_MINUTES changes it; new collected jobs are embedded right away anyway)
  setInterval(run, (Number(process.env.EMBED_INTERVAL_MINUTES) || 10) * 60 * 1000).unref();
}
