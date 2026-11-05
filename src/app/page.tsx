import Link from "next/link";
import { Eye, MessageSquare, Play, Sparkles, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Logo from "@/components/logo";

export const instant = false;

const POINTS = [
  {
    icon: MessageSquare,
    title: "Comments on the timeline",
    body: "Viewers pause and comment. Each note is pinned to a timestamp and marked on the timeline, so you can jump straight to it.",
  },
  {
    icon: Video,
    title: "Nothing to install",
    body: "Recording runs in the browser. Anyone with the link can watch and comment without signing up.",
  },
  {
    icon: Sparkles,
    title: "Summary and chapters",
    body: "Your speech is transcribed while you record, then turned into a short summary and chapters viewers can jump between.",
  },
];

const PREVIEW_COMMENTS = [
  { name: "Priya Nair", time: "0:14", body: "Can the empty state link to the import flow instead?", active: true },
  { name: "Marcus Webb", time: "0:42", body: "Spacing between these two rows feels tighter than the rest.", active: false },
  { name: "Ayesha Rahman", time: "1:08", body: "Love this. Ship it.", active: false },
];

const MARKERS = [12, 36, 58];

function ProductPreview() {
  return (
    <div
      className="settle-in overflow-hidden rounded-2xl border border-border bg-surface shadow-panel"
      style={{ "--d": "240ms" } as React.CSSProperties}
      role="img"
      aria-label="Example of the Walkthru viewer: a recording with timestamped comments beside it"
    >
      <div className="grid md:grid-cols-[1fr_15rem]">
        <div className="p-3">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-[#14161c]">
            <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,#2a3350_0%,#14161c_60%)]" />
            <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white">
              <span className="rec-dot h-1.5 w-1.5 rounded-full bg-[#ff6b7d]" style={{ "--ring-c": "rgb(255 107 125 / 0.6)" } as React.CSSProperties} /> Onboarding review
            </div>
            <div className="absolute inset-x-6 top-1/2 grid -translate-y-1/2 gap-2">
              <div className="h-3 w-2/5 rounded bg-white/15" />
              <div className="h-3 w-3/5 rounded bg-white/10" />
              <div className="h-3 w-1/3 rounded bg-white/10" />
            </div>
            <span className="absolute bottom-3 left-3 grid h-8 w-8 place-items-center rounded-full bg-white text-[#14161c]">
              <Play className="h-3.5 w-3.5 fill-current" />
            </span>
          </div>
          <div className="relative mt-3 h-4">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-muted" />
            <div className="loop-playhead absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-brand" style={{ "--d": "900ms" } as React.CSSProperties} />
            {MARKERS.map((m, i) => (
              <span
                key={m}
                style={{ left: `${m}%`, "--d": `${900 + Math.round((m / 100) * 12000) - 360}ms` } as React.CSSProperties}
                className="loop-marker absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-record"
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span className="font-medium text-foreground">Onboarding review</span>
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> 18 views
            </span>
          </div>
        </div>

        <ul className="divide-y divide-border border-t border-border md:border-l md:border-t-0">
          {PREVIEW_COMMENTS.map((c, i) => (
            <li
              key={c.time}
              style={{ "--d": "900ms" } as React.CSSProperties}
              className={`${["loop-row-a", "loop-row-b", "loop-row-c"][i]} px-3.5 py-3`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{c.name}</span>
                <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-brand">
                  {c.time}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-muted">{c.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const recordHref = user ? "/record" : "/login?next=/record";

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            {user ? (
              <Link href="/library" className="btn btn-primary btn-sm">
                Open library
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link href="/login?next=/record" className="btn btn-primary btn-sm">
                  Start recording
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:pb-28 lg:pt-24">
          <div>
            <h1 className="anim-rise text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Review work by showing it.
            </h1>
            <p className="anim-rise mt-5 max-w-md text-lg leading-relaxed text-muted" style={{ "--d": "80ms" } as React.CSSProperties}>
              Record your screen, share one link, and collect comments pinned to the moment they apply to.
            </p>
            <div className="anim-rise mt-8 flex flex-wrap items-center gap-3" style={{ "--d": "160ms" } as React.CSSProperties}>
              <Link href={recordHref} className="btn btn-lg btn-primary">
                <span className="rec-dot h-2 w-2 rounded-full bg-record ring-2 ring-white/40" style={{ "--ring-c": "rgb(255 255 255 / 0.5)" } as React.CSSProperties} />
                Start recording
              </Link>
              {!user && (
                <Link href="/login" className="btn btn-lg btn-secondary">
                  Sign in
                </Link>
              )}
            </div>
          </div>
          <ProductPreview />
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:py-24">
            <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
              Everything a review needs, nothing it doesn&apos;t.
            </h2>
            <ul className="divide-y divide-border">
              {POINTS.map((p) => {
                const Icon = p.icon;
                return (
                  <li key={p.title} className="flex gap-4 py-6 first:pt-0 last:pb-0">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                    <div>
                      <h3 className="font-medium">{p.title}</h3>
                      <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-muted">{p.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Record your first walkthrough.</h2>
          <Link href={recordHref} className="btn btn-lg btn-primary">
            Start recording
          </Link>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 text-[13px] text-muted sm:px-6">
          <span>© {new Date().getFullYear()} Walkthru</span>
        </div>
      </footer>
    </>
  );
}
