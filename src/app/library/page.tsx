import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, MessageSquare, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/app-nav";
import VideoCardActions from "@/components/video-card-actions";
import { formatTime, timeAgo } from "@/lib/format";

export const instant = false;
export const metadata = { title: "Library | Walkthru" };

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

  const paths = (videos ?? []).map((v) => v.storage_path).filter((x): x is string => !!x);
  const signed = paths.length ? await supabase.storage.from("recordings").createSignedUrls(paths, 60 * 60) : { data: [] };
  const urlByPath = new Map((signed.data ?? []).map((r) => [r.path, r.signedUrl]));

  const items = (videos ?? []).map((v) => ({
    ...v,
    url: (v.storage_path && urlByPath.get(v.storage_path)) || null,
    commentCount: (v.comments as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));

  return (
    <>
      <AppNav email={user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
            {items.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                {items.length} recording{items.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="panel flex flex-col items-center px-6 py-20 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft">
              <Video className="h-5 w-5 text-brand" aria-hidden />
            </div>
            <h2 className="mt-5 text-lg font-semibold">No recordings yet</h2>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
              Record your screen and camera, then share one link. Viewers can comment at exact moments.
            </p>
            <Link href="/record" className="btn btn-primary mt-6">
              Start recording
            </Link>
          </div>
        ) : (
          <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((v, i) => (
              <li
                key={v.id}
                className="anim-rise"
                style={{ "--d": `${Math.min(i, 8) * 45}ms` } as React.CSSProperties}
              >
                <Link
                  href={`/v/${v.id}`}
                  className="group relative block aspect-video overflow-hidden rounded-card border border-border bg-[#14161c]"
                >
                  {v.url && v.status === "ready" ? (
                    <video
                      src={`${v.url}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-white/70">
                      {v.status === "failed" ? "Upload failed" : "Uploading"}
                    </div>
                  )}
                  <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white">
                    {formatTime(v.duration_seconds)}
                  </span>
                </Link>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/v/${v.id}`}
                      className="line-clamp-1 text-[15px] font-medium hover:text-brand"
                    >
                      {v.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                      <span>{timeAgo(v.created_at)}</span>
                      <span className="flex items-center gap-1" title="Views">
                        <Eye className="h-3.5 w-3.5" aria-hidden /> {v.view_count}
                        <span className="sr-only">views</span>
                      </span>
                      <span className="flex items-center gap-1" title="Comments">
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {v.commentCount}
                        <span className="sr-only">comments</span>
                      </span>
                    </div>
                  </div>
                  <VideoCardActions id={v.id} storagePath={v.storage_path} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
