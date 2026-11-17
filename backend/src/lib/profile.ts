// Your profile: built from your CV, but only what you confirmed.
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { cvUploads, EducationEntry, userProfiles } from "../db/schema";
import { embedTexts, ParsedCv } from "./aiService";

export type ProfileInput = {
  fullName: string | null;
  dateOfBirth: string | null;
  skills: string[];
  education: EducationEntry[];
  experienceYears: number | null;
  summary: string | null;
  cvUploadId: number | null;
};

const profileColumns = {
  fullName: userProfiles.fullName,
  dateOfBirth: userProfiles.dateOfBirth,
  skills: userProfiles.skills,
  education: userProfiles.education,
  experienceYears: userProfiles.experienceYears,
  summary: userProfiles.summary,
  confirmedAt: userProfiles.confirmedAt,
  hasEmbedding: userProfiles.embedding, // turned into a true/false below; never sent as numbers
};

export async function getProfile(userId: number) {
  const [row] = await db.select(profileColumns).from(userProfiles).where(eq(userProfiles.userId, userId));
  if (!row) return null;
  return { ...row, hasEmbedding: row.hasEmbedding !== null };
}

// The numbers used for matching, kept separate so they're never sent to the browser.
export async function getProfileForMatching(userId: number) {
  const [row] = await db
    .select({ skills: userProfiles.skills, embedding: userProfiles.embedding })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId));
  return row ?? null;
}

export async function getLatestUpload(userId: number) {
  const [row] = await db
    .select({
      id: cvUploads.id,
      fileName: cvUploads.fileName,
      extracted: cvUploads.extracted,
      warnings: cvUploads.warnings,
      createdAt: cvUploads.createdAt,
    })
    .from(cvUploads)
    .where(eq(cvUploads.userId, userId))
    .orderBy(desc(cvUploads.createdAt))
    .limit(1);
  return row ?? null;
}

export async function saveUpload(userId: number, fileName: string, parsed: ParsedCv) {
  const [row] = await db
    .insert(cvUploads)
    .values({ userId, fileName, text: parsed.text, extracted: parsed.fields, warnings: parsed.warnings })
    .returning({
      id: cvUploads.id,
      fileName: cvUploads.fileName,
      extracted: cvUploads.extracted,
      warnings: cvUploads.warnings,
      createdAt: cvUploads.createdAt,
    });
  return row;
}

// What the profile "means", as one paragraph, for the embedding.
export function profileText(p: Pick<ProfileInput, "summary" | "skills" | "education" | "experienceYears">): string {
  const education = p.education.map((e) => [e.degree, e.subject].filter(Boolean).join(" ")).join("; ");
  return [
    p.summary,
    p.skills.length ? `Skills: ${p.skills.join(", ")}` : "",
    education ? `Education: ${education}` : "",
    p.experienceYears !== null ? `${p.experienceYears} years of experience` : "",
  ]
    .filter(Boolean)
    .join(". ");
}

export async function confirmProfile(userId: number, input: ProfileInput) {
  // If the AI service is off, the profile is still saved; the embedding is added next time you save.
  let embedding: number[] | null = null;
  let embeddingError: string | null = null;
  const text = profileText(input);
  if (text) {
    try {
      [embedding] = await embedTexts([text]);
    } catch (err) {
      embeddingError = err instanceof Error ? err.message : "AI service error";
    }
  }

  const values = { ...input, embedding, confirmedAt: new Date() };
  await db
    .insert(userProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userProfiles.userId, set: values });

  return { profile: await getProfile(userId), embeddingError };
}

// "Delete my CV data": profile and every uploaded CV text.
export async function deleteProfile(userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));
    await tx.delete(cvUploads).where(eq(cvUploads.userId, userId));
  });
}
