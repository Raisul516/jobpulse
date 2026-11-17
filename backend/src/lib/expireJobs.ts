// Marks open jobs whose deadline has passed (in Bangladesh time) as "expired".
// Runs when the server starts and then every hour.
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { jobs } from "../db/schema";
import { todayInDhaka } from "./today";

export async function expireOldJobs(): Promise<number> {
  const rows = await db
    .update(jobs)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(jobs.status, "open"), lt(jobs.deadline, todayInDhaka)))
    .returning({ id: jobs.id });
  return rows.length;
}

const ONE_HOUR = 60 * 60 * 1000;

export function startExpiryTimer(): void {
  const run = () =>
    expireOldJobs()
      .then((count) => {
        if (count > 0) console.log(`Marked ${count} job(s) as expired.`);
      })
      .catch((err) => console.error("Could not expire old jobs:", err));
  void run();
  setInterval(run, ONE_HOUR).unref(); // unref: don't keep the process alive just for this timer
}
