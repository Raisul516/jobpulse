// Read and save the user's job preferences.
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { userPreferences } from "../db/schema";

type Row = typeof userPreferences.$inferSelect;
export type StoredPreferences = Omit<Row, "userId">;
export type PreferencesInput = Omit<typeof userPreferences.$inferInsert, "userId" | "updatedAt">;

// null = the user hasn't set preferences yet (then we don't show match scores at all).
export async function getPreferences(userId: number): Promise<StoredPreferences | null> {
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  if (!row) return null;
  const { userId: _ignored, ...prefs } = row;
  return prefs;
}

export async function savePreferences(userId: number, prefs: PreferencesInput): Promise<StoredPreferences> {
  const values = { ...prefs, updatedAt: new Date() };
  const [row] = await db
    .insert(userPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userPreferences.userId, set: values })
    .returning();
  const { userId: _ignored, ...saved } = row;
  return saved;
}
