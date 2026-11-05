import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Viewer, { type Chapter, type Comment, type Reaction } from "@/components/viewer";

type Params = { params: Promise<{ id: string }> };

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Walkthru" };
  const supabase = await createClient();
  const { data } = await supabase.from("videos").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ? `${data.title} — Walkthru` : "Walkthru" };
}

export default async function VideoPage({ params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: video } = await supabase
    .from("videos")
    .select(
      "id, owner_id, title, storage_path, duration_seconds, view_count, created_at, summary, transcript, chapters, ai_status",
    )
    .eq("id", id)
    .maybeSingle();

  if (!video || !video.storage_path) notFound();

  const [{ data: comments }, { data: reactions }] = await Promise.all([
    supabase
      .from("comments")
      .select("id, author_id, author_name, body, timestamp_seconds, created_at")
      .eq("video_id", id)
      .order("timestamp_seconds", { ascending: true }),
    supabase.from("reactions").select("id, emoji, timestamp_seconds").eq("video_id", id),
  ]);

  const url = supabase.storage.from("recordings").getPublicUrl(video.storage_path).data.publicUrl;
  const userName = user ? (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? null : null;

  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href={user ? "/library" : "/"} className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-3 w-3 rounded-full bg-record" />
            Walkthru
          </Link>
          <Link
            href={user ? "/record" : "/login"}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
          >
            {user ? "New recording" : "Record your own"}
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <Viewer
          video={{
            id: video.id,
            title: video.title,
            url,
            duration_seconds: video.duration_seconds,
            view_count: video.view_count,
            created_at: video.created_at,
            summary: video.summary,
            transcript: video.transcript,
            chapters: (video.chapters as Chapter[] | null) ?? [],
            ai_status: video.ai_status,
          }}
          initialComments={(comments as Comment[] | null) ?? []}
          initialReactions={(reactions as Reaction[] | null) ?? []}
          userId={user?.id ?? null}
          userName={userName}
          isOwner={!!user && user.id === video.owner_id}
        />
      </main>
    </>
  );
}
