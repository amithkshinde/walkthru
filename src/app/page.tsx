import Link from "next/link";
import { Link2, MessageSquare, Sparkles, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const FEATURES = [
  {
    icon: Video,
    title: "Record in one click",
    body: "Capture your screen, your camera, or both. No install. Your video is uploaded and shareable the moment you stop.",
  },
  {
    icon: MessageSquare,
    title: "Feedback at the exact moment",
    body: "Viewers comment on a precise timestamp. Every comment is pinned to the timeline, so nothing gets lost in a thread.",
  },
  {
    icon: Sparkles,
    title: "AI summaries and chapters",
    body: "Your speech is transcribed as you record. Get a short summary and jump-to chapters without lifting a finger.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-block h-3 w-3 rounded-full bg-record" />
            Walkthru
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link
                href="/library"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
              >
                Open library
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground">
                  Sign in
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-4 pb-16 pt-20 text-center sm:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-record" /> Async video, minus the noise
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
            Show it, don&apos;t schedule&nbsp;it.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Record your screen and camera, share a link, and collect timestamped feedback. Built for designers and
            teams who&apos;d rather talk through work than type it out.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href={user ? "/record" : "/login?next=/record"}
              className="flex items-center gap-2 rounded-xl bg-record px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-white" /> Start recording
            </Link>
            <Link
              href={user ? "/library" : "/login"}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-sm font-medium hover:border-brand/50"
            >
              <Link2 className="h-4 w-4" /> {user ? "Your library" : "Sign in"}
            </Link>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-24">
          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="rounded-card border border-border bg-surface p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
                    <Icon className="h-5 w-5 text-brand" />
                  </div>
                  <h2 className="mt-4 font-semibold">{f.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        © {new Date().getFullYear()} Walkthru
      </footer>
    </>
  );
}
