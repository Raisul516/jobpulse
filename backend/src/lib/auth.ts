// Login for JobPulse.
//
// JobPulse is a personal app: ONE owner account. The first visit asks you to set an email and
// password ("setup"); that account takes over the data that already exists. After that, sign-up is closed.
//
// Passwords: hashed with scrypt (built into Node) and a random salt — never stored as typed.
// Sessions: a random token in an HttpOnly cookie (JavaScript in the page can't read it);
//           the database only keeps the token's SHA-256.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { currentUserId } from "./currentUser";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

// ---------- passwords ----------

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltText, hashText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length, SCRYPT);
  // constant-time comparison, so response time doesn't leak how much of the hash matched
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---------- sessions ----------

export const SESSION_COOKIE = "jp_session";
export const SESSION_DAYS = 30;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export async function createSession(userId: number, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: userAgent?.slice(0, 300) ?? null,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return token;
}

export async function userForSession(token: string): Promise<{ id: number; email: string; name: string | null } | null> {
  const [row] = await db
    .select({ sessionId: sessions.id, lastSeenAt: sessions.lastSeenAt, id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, sql`now()`)))
    .limit(1);
  if (!row) return null;
  // note activity at most once an hour (not on every request)
  if (Date.now() - row.lastSeenAt.getTime() > 3_600_000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId));
  }
  return { id: row.id, email: row.email, name: row.name };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
}

// ---------- owner account ----------

export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// true until the owner has set a password
export async function setupRequired(): Promise<boolean> {
  const [owner] = await db.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash)).limit(1);
  return !owner;
}

// First run: give the existing local user (who owns all the data) an email and password.
export async function setupOwner(email: string, password: string, name: string | null): Promise<number> {
  if (!(await setupRequired())) throw new AuthError("An account already exists. Please log in.", 409);
  const userId = await currentUserId();
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken && taken.id !== userId) throw new AuthError("This email is already used.", 409);
  await db
    .update(users)
    .set({ email, name, passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId));
  return userId;
}

export async function checkLogin(email: string, password: string): Promise<number | null> {
  const [user] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.email, email));
  // still run a hash when the user doesn't exist, so "wrong email" and "wrong password" take the same time
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86));
  return user && user.passwordHash && ok ? user.id : null;
}

// ---------- brute-force protection ----------
// Max 10 failed logins per address per 15 minutes (kept in memory; resets when the server restarts).

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

export function loginBlocked(ip: string): number {
  const entry = failures.get(ip);
  if (!entry || entry.resetAt < Date.now()) return 0;
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.resetAt - Date.now()) / 60_000) : 0;
}

export function recordFailure(ip: string): void {
  const entry = failures.get(ip);
  if (!entry || entry.resetAt < Date.now()) failures.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  else entry.count++;
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}

// ---------- cookies ----------

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Secure (HTTPS-only) cookies once the site is online; plain http://localhost needs them off.
const SECURE_COOKIES = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

export function sessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 86_400}`,
    ...(SECURE_COOKIES ? ["Secure"] : []),
  ].join("; ");
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_COOKIES ? "; Secure" : ""}`;
}
