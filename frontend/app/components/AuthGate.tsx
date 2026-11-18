"use client";

// Wraps the whole site. Until you're logged in it shows:
//   - "Create your account" the very first time (no account exists yet), or
//   - the login form.
// If the session runs out while you're using the site, the API answers 401 and this switches back to login.
import { Loader2, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { api, ApiError, UNAUTHORIZED_EVENT } from "../lib/api";

type Status = { setupRequired: boolean; user: { id: number; email: string; name: string | null } | null };

const MIN_PASSWORD = 10;

function AuthForm({ mode, onDone }: { mode: "setup" | "login"; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "setup" && password !== repeat) {
      setError("The two passwords are different.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        body: mode === "setup" ? { email, password, name: name || undefined } : { email, password },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src="/icon-192.png" alt="" width={48} height={48} className="rounded-xl" />
          <h1 className="text-xl font-bold">{mode === "setup" ? "Create your JobPulse account" : "Log in to JobPulse"}</h1>
          <p className="text-sm text-muted">
            {mode === "setup"
              ? "Your CV, applications and preferences will be linked to this account. Only you can sign up."
              : "Your personal job tracker."}
          </p>
        </div>

        {mode === "setup" ? (
          <label className="block">
            <span className="label">Name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="input" />
          </label>
        ) : null}
        <label className="block">
          <span className="label">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="input" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input
            type="password"
            required
            minLength={mode === "setup" ? MIN_PASSWORD : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "setup" ? "new-password" : "current-password"}
            className="input"
          />
          {mode === "setup" ? <span className="hint">At least {MIN_PASSWORD} characters.</span> : null}
        </label>
        {mode === "setup" ? (
          <label className="block">
            <span className="label">Repeat password</span>
            <input
              type="password"
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              className="input"
            />
          </label>
        ) : null}

        {error ? <p className="alert alert-error">{error}</p> : null}

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <LockKeyhole size={16} aria-hidden />}
          {mode === "setup" ? "Create account" : "Log in"}
        </button>
      </form>
    </main>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");

  const check = useCallback(() => {
    api<Status>("/api/auth/status")
      .then((s) => {
        setStatus(s);
        setError("");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not reach the JobPulse server."));
  }, []);

  useEffect(() => {
    check();
    // a request somewhere on the page got "401 Please log in" -> ask again
    window.addEventListener(UNAUTHORIZED_EVENT, check);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, check);
  }, [check]);

  if (error && !status) {
    return (
      <main className="page-narrow">
        <div className="alert alert-error flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={check} className="btn btn-secondary btn-sm">
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!status) {
    return (
      <main className="flex flex-1 items-center justify-center py-20 text-muted">
        <Loader2 className="animate-spin" aria-label="Loading" />
      </main>
    );
  }
  if (status.setupRequired) return <AuthForm mode="setup" onDone={check} />;
  if (!status.user) return <AuthForm mode="login" onDone={check} />;
  return <>{children}</>;
}
