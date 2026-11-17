// Decides WHAT to notify you about, and sends it (lib/push.ts does the sending).
//
//   new_match        a job added in the last 7 days that matches you (score ≥ threshold, filters ok,
//                    not ineligible) and that you haven't been told about yet
//   deadline_3_days  a job you SAVED (not applied yet) closes within 3 days
//   deadline_1_day   … closes today or tomorrow
//
// Runs every 30 minutes and right after new jobs get their embeddings.
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { jobs, notificationLog, pushSubscriptions, savedJobs } from "../db/schema";
import { currentUserId } from "./currentUser";
import { findJobs } from "./jobQueries";
import { addMatches } from "./matchForUser";
import { getPreferences } from "./preferences";
import { PushMessage, pushConfigured, sendToUser } from "./push";
import { todayInDhaka } from "./today";

type Kind = (typeof notificationLog.$inferInsert)["kind"];

export type NotifierSummary = { newMatches: number; deadlineReminders: number; skipped?: string };

const NEW_JOB_WINDOW_DAYS = 7;
const MAX_SINGLE = 3; // more new matches than this at once -> one summary notification

async function alreadyNotified(userId: number, kind: Kind, jobIds: number[]): Promise<Set<number>> {
  if (jobIds.length === 0) return new Set();
  const rows = await db
    .select({ jobId: notificationLog.jobId })
    .from(notificationLog)
    .where(and(eq(notificationLog.userId, userId), eq(notificationLog.kind, kind), inArray(notificationLog.jobId, jobIds)));
  return new Set(rows.map((r) => r.jobId));
}

async function remember(userId: number, kind: Kind, jobIds: number[]) {
  if (jobIds.length) {
    await db
      .insert(notificationLog)
      .values(jobIds.map((jobId) => ({ userId, jobId, kind })))
      .onConflictDoNothing();
  }
}

function dhakaToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysUntil(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dhakaToday()}T00:00:00Z`)) / 86_400_000);
}

// ---------- new matches ----------

async function notifyNewMatches(userId: number): Promise<number> {
  // Real (not demo) open jobs added recently
  const recent = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "open"),
        eq(jobs.isDemo, false),
        gte(jobs.createdAt, sql`now() - make_interval(days => ${NEW_JOB_WINDOW_DAYS})`),
        or(isNull(jobs.deadline), gte(jobs.deadline, todayInDhaka))
      )
    );
  const told = await alreadyNotified(userId, "new_match", recent.map((r) => r.id));
  const candidateIds = new Set(recent.map((r) => r.id).filter((id) => !told.has(id)));
  if (candidateIds.size === 0) return 0;

  const all = await findJobs({ search: "", location: "", jobType: null, category: null, sort: "newest" }, userId);
  const { jobs: scored } = await addMatches(userId, all.filter((j) => candidateIds.has(j.id)));
  const matches = scored.filter((j) => j.match?.isMatch).sort((a, b) => (b.match!.score) - (a.match!.score));
  if (matches.length === 0) return 0;

  const messages: PushMessage[] =
    matches.length <= MAX_SINGLE
      ? matches.map((j) => ({
          title: `New match ${j.match!.score}%: ${j.title}`,
          body: [j.company, j.location, j.deadline ? `apply by ${j.deadline}` : null].filter(Boolean).join(" · "),
          url: `/?sort=best-match`,
          tag: `job-${j.id}`,
        }))
      : [
          {
            title: `${matches.length} new jobs match you`,
            body: matches.slice(0, 3).map((j) => `${j.title} (${j.match!.score}%)`).join(", ") + "…",
            url: `/?sort=best-match&matchesOnly=true`,
            tag: "new-matches",
          },
        ];

  let delivered = 0;
  for (const message of messages) delivered += (await sendToUser(userId, message)).sent;
  // Only remember them if at least one device got the message; otherwise try again next time
  if (delivered > 0) await remember(userId, "new_match", matches.map((j) => j.id));
  return delivered > 0 ? matches.length : 0;
}

// ---------- deadline reminders for saved jobs ----------

async function notifyDeadlines(userId: number): Promise<number> {
  const saved = await db
    .select({ id: jobs.id, title: jobs.title, company: jobs.company, deadline: jobs.deadline })
    .from(savedJobs)
    .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .where(
      and(
        eq(savedJobs.userId, userId),
        eq(savedJobs.status, "saved"), // already applied -> no reminder
        gte(jobs.deadline, todayInDhaka),
        sql`${jobs.deadline} <= ${todayInDhaka} + 3`
      )
    );

  let count = 0;
  for (const kind of ["deadline_1_day", "deadline_3_days"] as const) {
    const due = saved.filter((j) => {
      const days = daysUntil(j.deadline!);
      return kind === "deadline_1_day" ? days <= 1 : days > 1 && days <= 3;
    });
    const told = await alreadyNotified(userId, kind, due.map((j) => j.id));
    for (const job of due.filter((j) => !told.has(j.id))) {
      const days = daysUntil(job.deadline!);
      const when = days === 0 ? "today is the last day" : days === 1 ? "last day is tomorrow" : `${days} days left`;
      const { sent } = await sendToUser(userId, {
        title: `Apply soon: ${job.title}`,
        body: `${job.company} — ${when} (${job.deadline}). You saved this job but haven't applied yet.`,
        url: "/saved",
        tag: `deadline-${job.id}`,
      });
      if (sent > 0) {
        await remember(userId, kind, [job.id]);
        count++;
      }
    }
  }
  return count;
}

// ---------- run ----------

let running = false;

export async function runNotifier(): Promise<NotifierSummary> {
  if (!pushConfigured) return { newMatches: 0, deadlineReminders: 0, skipped: "VAPID keys missing in backend/.env" };
  if (running) return { newMatches: 0, deadlineReminders: 0, skipped: "already running" };
  running = true;
  try {
    const userId = await currentUserId();
    const [device] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1);
    if (!device) return { newMatches: 0, deadlineReminders: 0, skipped: "no device has notifications turned on" };

    const prefs = await getPreferences(userId);
    const newMatches = prefs && !prefs.notifyEnabled ? 0 : await notifyNewMatches(userId);
    const deadlineReminders = await notifyDeadlines(userId);
    if (newMatches || deadlineReminders) {
      console.log(`[notify] sent ${newMatches} new match(es), ${deadlineReminders} deadline reminder(s)`);
    }
    return { newMatches, deadlineReminders };
  } finally {
    running = false;
  }
}

export function startNotifierTimer(): void {
  const run = () => runNotifier().catch((err) => console.error("[notify] failed:", err));
  setTimeout(run, 60_000).unref(); // a minute after start, once jobs are embedded
  setInterval(run, 30 * 60 * 1000).unref();
}
