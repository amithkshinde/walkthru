import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, MessageSquare, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/app-nav";
import VideoCardActions from "@/components/video-card-actions";
import { formatTime, timeAgo } from "@/lib/format";

export const instant = false;
export const metadata = { title: "Library — Walkthru" };

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/library");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, storage_path, duration_seconds, status, view_count, created_at, comments(count)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const items = (videos ?? []).map((v) => ({
    ...v,
    url: v.storage_path
      ? supabase.storage.from("recordings").getPublicUrl(v.storage_path).data.publicUrl
      : null,
    commentCount: (v.comments as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));

  return (
    <>
      <AppNav email={user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Library</h1>
            <p className="mt-1 text-sm text-muted">
              {items.length === 0 ? "Nothing here yet." : `${items.length} recording${items.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-surface px-6 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
              <Video className="h-6 w-6 text-brand" />
            </div>
            <h2 className="mt-5 text-lg font-semibold">Record your first video</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Capture your screen and camera, then share one link. Viewers can comment at exact moments.
            </p>
            <Link
              href="/record"
              className="mt-6 rounded-xl bg-record px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Start recording
            </Link>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((v) => (
              <li key={v.id} className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
                <Link href={`/v/${v.id}`} className="relative block aspect-video bg-black">
                  {v.url && v.status === "ready" ? (
                    <video
                      src={`${v.url}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-white/60">
                      {v.status === "failed" ? "Upload failed" : "Uploading…"}
                    </div>
                  )}
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
                    {formatTime(v.duration_seconds)}
                  </span>
                </Link>
                <div className="p-4">
                  <Link href={`/v/${v.id}`} className="line-clamp-1 font-medium hover:text-brand">
                    {v.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                    <span>{timeAgo(v.created_at)}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> {v.view_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" /> {v.commentCount}
                    </span>
                  </div>
                  <div className="mt-3 border-t border-border pt-3">
                    <VideoCardActions id={v.id} storagePath={v.storage_path} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
