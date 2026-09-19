"use client";

/**
 * src/app/(auth)/login/auth-form.tsx
 *
 * Google + email/password, sign-in and sign-up in one card.
 *
 * Sign-up outcomes:
 *   - "Confirm email" ON in Supabase (default): no session yet → show "check your inbox".
 *   - "Confirm email" OFF: a session comes back → go straight to the app.
 *
 * New users get their free credits from the database trigger in supabase/part4.sql.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";
type Busy = null | "password" | "google";

const input =
  "w-full rounded-lg border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:border-accent";

export default function AuthForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function handleGoogle() {
    setBusy("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    // On success the browser leaves for Google, so there's nothing more to do.
    if (error) {
      setError(error.message);
      setBusy(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("password");
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setBusy(null);
        return;
      }
      router.replace(next);
      router.refresh(); // re-run Server Components with the new session
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
      return;
    }
    if (data.session) {
      router.replace(next);
      router.refresh();
      return;
    }
    setNotice("Check your inbox for a confirmation link, then sign in.");
    setBusy(null);
  }

  const signup = mode === "signup";

  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="block h-5 w-[11px] rounded-[3px] bg-accent" />
        <span className="font-display text-lg font-semibold tracking-tight">
          Short Studio
        </span>
      </div>
      <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
        {signup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {signup
          ? "Start with free credits. No card needed."
          : "Sign in to keep creating."}
      </p>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy !== null}
        className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm font-medium transition-colors hover:border-muted disabled:opacity-60"
      >
        {busy === "google" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <GoogleMark />
        )}
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={signup ? "new-password" : "current-password"}
            placeholder={signup ? "Password (8+ characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-ink">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy === "password" && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {signup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {signup ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(signup ? "signin" : "signup");
            setError(null);
            setNotice(null);
          }}
          className="font-medium text-ink underline underline-offset-2"
        >
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}

/** lucide-react has no brand icons, so the Google "G" is inlined. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.64 12.2c0-.82-.07-1.6-.21-2.36H12v4.47h6.52a5.57 5.57 0 0 1-2.42 3.66v3.04h3.92c2.29-2.11 3.62-5.22 3.62-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.92-3.04c-1.08.72-2.46 1.15-4.03 1.15-3.1 0-5.73-2.09-6.67-4.9H1.29v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.33 14.31A7.2 7.2 0 0 1 4.95 12c0-.8.14-1.58.38-2.31V6.6H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.4l4.04-3.09z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.6l4.04 3.09C6.27 6.86 8.9 4.77 12 4.77z" />
    </svg>
  );
}
