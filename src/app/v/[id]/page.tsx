import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveVideoAccess, fileSlug, UUID } from "@/lib/video-access";
import Logo from "@/components/logo";
import UnlockForm from "@/components/unlock-form";
import Viewer, { type AiOutputs, type Chapter, type Comment, type Reaction, type ViewRow } from "@/components/viewer";

type Params = { params: Promise<{ id: string }> };

export const instant = false;

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Walkthru" };
  const supabase = await createClient();
  const { data } = await supabase.from("videos").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ? `${data.title} | Walkthru` : "Walkthru" };
}

function Shell({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo href={signedIn ? "/library" : "/"} />
          <Link href={signedIn ? "/record" : "/login?next=/record"} className="btn btn-primary btn-sm">
            {signedIn ? "New recording" : "Start recording"}
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}

export default async function VideoPage({ params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase, token, access } = await resolveVideoAccess(id);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = !!user;

  if (access === "missing") notFound();

  if (access === "expired" || access === "signin" || access === "restricted") {
    const copy = {
      expired: ["This link has expired", "The owner set this video to stop being available. Ask them for a new link."],
      signin: ["Sign in to watch", "The owner only shares this video with signed-in viewers."],
      restricted: ["You don't have access", `This video is shared with specific people${user?.email ? `, and ${user.email} isn't one of them` : ""}.`],
    }[access];
    return (
      <Shell signedIn={signedIn}>
        <div className="mx-auto mt-20 w-full max-w-sm px-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{copy[0]}</h1>
          <p className="mt-1.5 text-sm text-muted">{copy[1]}</p>
          {access === "signin" && (
            <Link href={`/login?next=/v/${id}`} className="btn btn-primary mt-5">
              Sign in
            </Link>
          )}
        </div>
      </Shell>
    );
  }

  if (access === "private") {
    return (
      <Shell signedIn={signedIn}>
        <div className="mx-auto mt-20 w-full max-w-sm px-4 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-muted">
            <EyeOff className="h-5 w-5 text-muted" aria-hidden />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">This video is private</h1>
          <p className="mt-1.5 text-sm text-muted">Only its owner can watch it. Ask them to share it with you.</p>
        </div>
      </Shell>
    );
  }

  if (access === "locked") {
    return (
      <Shell signedIn={signedIn}>
        <div className="mx-auto mt-16 w-full max-w-sm px-4">
          <div className="panel p-6 shadow-panel">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft">
              <Lock className="h-4 w-4 text-brand" aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">This video is password protected</h1>
            <p className="mt-1 text-sm text-muted">Enter the password the owner shared with you.</p>
            <UnlockForm id={id} />
          </div>
        </div>
      </Shell>
    );
  }

  const { data: video } = await supabase
    .from("videos")
    .select(
      "id, owner_id, title, storage_path, duration_seconds, view_count, created_at, summary, transcript, chapters, ai_status, visibility, cta_label, cta_url, allow_download, ai_outputs, description, expires_at, require_signin, folder_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!video || !video.storage_path) notFound();

  const isOwner = !!user && user.id === video.owner_id;

  const bucket = supabase.storage.from("recordings");
  const [{ data: playUrl }, { data: dlUrl }, { data: comments }, { data: reactions }] = await Promise.all([
    bucket.createSignedUrl(video.storage_path, 60 * 60 * 6),
    video.allow_download || isOwner
      ? bucket.createSignedUrl(video.storage_path, 60 * 60 * 6, { download: fileSlug(video.title, video.storage_path) })
      : Promise.resolve({ data: null }),
    supabase
      .from("comments")
      .select("id, author_id, author_name, body, timestamp_seconds, created_at, parent_id")
      .eq("video_id", id)
      .order("timestamp_seconds", { ascending: true }),
    supabase.from("reactions").select("id, emoji, timestamp_seconds").eq("video_id", id),
  ]);

  if (!playUrl?.signedUrl) {
    return (
      <Shell signedIn={signedIn}>
        <div className="mx-auto mt-20 w-full max-w-sm px-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight">This video can&apos;t be played right now</h1>
          <p className="mt-1.5 text-sm text-muted">Reload the page. If it keeps happening, ask the owner to re-share it.</p>
        </div>
      </Shell>
    );
  }

  let views: ViewRow[] = [];
  let hasPassword = false;
  let shareEmails: string[] = [];
  if (isOwner) {
    const [{ data: viewRows }, { data: pw }, { data: shares }] = await Promise.all([
      supabase
        .from("video_views")
        .select("id, viewer_name, watched_seconds, created_at, updated_at")
        .eq("video_id", id)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase.rpc("video_has_password", { vid: id }),
      supabase.from("video_shares").select("email").eq("video_id", id),
    ]);
    shareEmails = (shares ?? []).map((r) => r.email as string);
    views = (viewRows as ViewRow[] | null) ?? [];
    hasPassword = !!pw;
  }

  const userName = user ? ((user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? null) : null;

  return (
    <Shell signedIn={signedIn}>
      <Viewer
        video={{
          id: video.id,
          title: video.title,
          url: playUrl.signedUrl,
          downloadUrl: dlUrl?.signedUrl ?? null,
          duration_seconds: video.duration_seconds,
          view_count: video.view_count,
          created_at: video.created_at,
          summary: video.summary,
          transcript: video.transcript,
          chapters: (video.chapters as Chapter[] | null) ?? [],
          ai_status: video.ai_status,
          visibility: video.visibility as "link" | "private",
          cta_label: video.cta_label,
          cta_url: video.cta_url,
          allow_download: video.allow_download,
          ai_outputs: (video.ai_outputs as AiOutputs | null) ?? {},
          description: video.description,
          expires_at: video.expires_at,
          require_signin: video.require_signin,
        }}
        shareEmails={shareEmails}
        initialComments={(comments as Comment[] | null) ?? []}
        initialReactions={(reactions as Reaction[] | null) ?? []}
        userId={user?.id ?? null}
        userName={userName}
        isOwner={isOwner}
        unlockToken={token ?? null}
        hasPassword={hasPassword}
        views={views}
      />
    </Shell>
  );
}
