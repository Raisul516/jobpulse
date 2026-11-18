// Login API.
//   GET  /api/auth/status  -> { setupRequired, user }
//   POST /api/auth/setup   { email, password, name? }  (only while no account exists)
//   POST /api/auth/login   { email, password }
//   POST /api/auth/logout
// Plus requireAuth: the guard every other /api route sits behind.
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import {
  AuthError,
  checkLogin,
  clearedCookie,
  clearFailures,
  createSession,
  deleteSession,
  loginBlocked,
  MIN_PASSWORD_LENGTH,
  readCookie,
  recordFailure,
  SESSION_COOKIE,
  sessionCookie,
  setupOwner,
  setupRequired,
  userForSession,
} from "../lib/auth";

export const authRouter = Router();

const email = z.string().trim().toLowerCase().email("Please enter a valid email").max(200);
const setupSchema = z.object({
  email,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
  name: z.string().trim().max(100).optional(),
});
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

function validationError(res: Response, error: z.ZodError) {
  res.status(400).json({
    error: error.issues[0]?.message ?? "Please check the form",
    fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? "unknown";

authRouter.get("/status", async (req, res) => {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  const user = token ? await userForSession(token) : null;
  res.json({ setupRequired: await setupRequired(), user });
});

authRouter.post("/setup", async (req, res) => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    const userId = await setupOwner(parsed.data.email, parsed.data.password, parsed.data.name || null);
    const token = await createSession(userId, req.get("user-agent") ?? null);
    res.setHeader("Set-Cookie", sessionCookie(token));
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

authRouter.post("/login", async (req, res) => {
  const ip = clientIp(req);
  const waitMinutes = loginBlocked(ip);
  if (waitMinutes) {
    res.status(429).json({ error: `Too many failed attempts. Try again in ${waitMinutes} minute(s).` });
    return;
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const userId = await checkLogin(parsed.data.email, parsed.data.password);
  if (!userId) {
    recordFailure(ip);
    // same message for wrong email and wrong password: don't reveal which emails exist
    res.status(401).json({ error: "Wrong email or password." });
    return;
  }
  clearFailures(ip);
  const token = await createSession(userId, req.get("user-agent") ?? null);
  res.setHeader("Set-Cookie", sessionCookie(token));
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (token) await deleteSession(token);
  res.setHeader("Set-Cookie", clearedCookie());
  res.json({ ok: true });
});

// Guard for every other /api route: no valid session -> 401 (the website then shows the login page).
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  const user = token ? await userForSession(token) : null;
  if (!user) {
    const setup = await setupRequired();
    res.status(401).json({
      error: setup ? "Create your JobPulse account first." : "Please log in.",
      code: setup ? "setup_required" : "login_required",
    });
    return;
  }
  next();
}
