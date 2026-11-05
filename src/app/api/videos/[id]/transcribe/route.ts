import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/video-access";
import { formatTime } from "@/lib/format";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "Server transcription is not set up" }, { status: 501 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: video } = await supabase.from("videos").select("owner_id, storage_path, status").eq("id", id).maybeSingle();
  if (!video || video.owner_id !== user.id || !video.storage_path || video.status !== "ready") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: signed } = await supabase.storage.from("recordings").createSignedUrl(video.storage_path, 60 * 30);
  if (!signed?.signedUrl) return NextResponse.json({ error: "Could not read the video" }, { status: 500 });

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&detect_language=true",
    {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ url: signed.signedUrl }),
    },
  );
  if (!res.ok) return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  const json = (await res.json()) as { results?: { utterances?: { start: number; transcript: string }[] } };
  const transcript = (json.results?.utterances ?? [])
    .filter((u) => u.transcript?.trim())
    .map((u) => `[${formatTime(u.start)}] ${u.transcript.trim()}`)
    .join("\n");
  if (!transcript) return NextResponse.json({ error: "No speech was found" }, { status: 422 });
  return NextResponse.json({ transcript });
}
