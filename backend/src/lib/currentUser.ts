// JobPulse has exactly one user: you (the owner). Every "my saved jobs / my CV" query goes through here.
// The owner is the account with a password; before you create your account it's the first user row
// (created on first use), and creating the account just gives that same row an email and password.
import { asc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";

const LOCAL_EMAIL = "me@jobpulse.local";
let cachedId: number | undefined;

async function findOwner(): Promise<number | undefined> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(sql`${users.passwordHash} IS NULL`, asc(users.id)) // the account with a password first
    .limit(1);
  return user?.id;
}

export async function currentUserId(): Promise<number> {
  if (cachedId !== undefined) return cachedId;
  let id = await findOwner();
  if (id === undefined) {
    await db.insert(users).values({ email: LOCAL_EMAIL, name: "Local user" }).onConflictDoNothing();
    id = await findOwner();
  }
  cachedId = id!;
  return cachedId;
}
