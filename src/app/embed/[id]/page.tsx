import { notFound } from "next/navigation";
import { resolveVideoAccess, UUID } from "@/lib/video-access";

export const instant = false;
export const metadata = { title: "Walkthru video", robots: { index: false } };

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, access } = await resolveVideoAccess(id);
  if (access === "missing") notFound();

  if (access !== "open") {
    return (
      <div className="grid min-h-dvh place-items-center bg-black p-6 text-center text-sm text-white/80">
        <p>
          {access === "locked" ? "This video is password protected." : "This video is private."}{" "}
          <a className="underline" href={`/v/${id}`} target="_blank" rel="noopener noreferrer">
            Open on Walkthru
          </a>
        </p>
      </div>
    );
  }

  const { data: video } = await supabase.from("videos").select("storage_path").eq("id", id).maybeSingle();
  const signed = video?.storage_path
    ? await supabase.storage.from("recordings").createSignedUrl(video.storage_path, 60 * 60 * 6)
    : null;
  if (!signed?.data?.signedUrl) notFound();

  return (
    <video
      src={signed.data.signedUrl}
      controls
      playsInline
      preload="metadata"
      className="h-dvh w-full bg-black object-contain"
    />
  );
}
