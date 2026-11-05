"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/logo";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const next = new URLSearchParams(window.location.search).get("next") || "/library";

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      window.location.href = next;
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    if (data.session) {
      window.location.href = next;
      return;
    }
    setNotice("Check your email to confirm your account, then sign in.");
    setBusy(false);
  }

  const signin = mode === "signin";

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10 sm:justify-center">
      <div className="w-full max-w-[22rem]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="panel p-6 shadow-panel">
          <h1 key={mode} className="anim-fade text-xl font-semibold tracking-tight">
            {signin ? "Sign in to Walkthru" : "Create your account"}
          </h1>
          <p key={`${mode}-sub`} className="anim-fade mt-1 text-sm text-muted">
            {signin ? "Pick up where you left off." : "Record and share your first video in a minute."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={signin ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
                aria-describedby={signin ? undefined : "password-hint"}
              />
              {!signin && (
                <p id="password-hint" className="anim-fade mt-1.5 text-xs text-muted">
                  Use at least 6 characters.
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="anim-alert rounded-lg bg-record-soft px-3 py-2 text-sm text-record">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="anim-alert rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
                {notice}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Please wait" : signin ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          {signin ? "New to Walkthru?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(signin ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="font-medium text-brand hover:underline"
          >
            {signin ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
