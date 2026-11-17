// Until login is built, JobPulse has exactly one user: you.
// Every "my saved jobs" query goes through this function, so adding real login later
// only means changing this one place (it will read the user from the request instead).
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";

const LOCAL_EMAIL = "me@jobpulse.local";
let cachedId: number | undefined;

export async function currentUserId(): Promise<number> {
  if (cachedId !== undefined) return cachedId;
  await db.insert(users).values({ email: LOCAL_EMAIL, name: "Local user" }).onConflictDoNothing();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, LOCAL_EMAIL));
  cachedId = user.id;
  return cachedId;
}
