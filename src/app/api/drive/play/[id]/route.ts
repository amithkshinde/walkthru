import { NextResponse } from "next/server";
import { resolveVideoAccess, UUID, fileSlug } from "@/lib/video-access";
import { accessTokenFor, fetchMedia } from "@/lib/drive";

export const maxDuration = 300;

/**
 * Streams a recording that lives in its owner's Google Drive. The same access rules as the watch page
 * apply (password, expiry, sign-in, restricted); the owner's Drive token never leaves the server.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { supabase, access } = await resolveVideoAccess(id);
  if (access !== "open") return NextResponse.json({ error: "Not allowed" }, { status: access === "missing" ? 404 : 403 });

  const { data: rows } = await supabase.rpc("drive_connection_for_video", { vid: id });
  const row = (rows as { refresh_token_enc: string; file_id: string }[] | null)?.[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wantsDownload = new URL(request.url).searchParams.get("dl") === "1";
  let disposition: string | null = null;
  if (wantsDownload) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: video } = await supabase.from("videos").select("owner_id, title, storage_path, allow_download").eq("id", id).maybeSingle();
    if (!video || !(video.allow_download || (user && user.id === video.owner_id))) {
      return NextResponse.json({ error: "Downloads are turned off" }, { status: 403 });
    }
    disposition = `attachment; filename="${fileSlug(video.title, "x.webm").replace(/"/g, "")}"`;
  }

  const token = await accessTokenFor(row.refresh_token_enc);
  if (!token) return NextResponse.json({ error: "The owner's Google Drive connection has expired" }, { status: 502 });

  const upstream = await fetchMedia(token, row.file_id, request.headers.get("range"));
  if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: "Could not read the file from Drive" }, { status: 502 });

  const headers = new Headers({ "accept-ranges": "bytes", "cache-control": "private, max-age=600" });
  for (const h of ["content-type", "content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.get("content-type")?.startsWith("video/")) headers.set("content-type", "video/webm");
  if (disposition) headers.set("content-disposition", disposition);
  return new Response(upstream.body, { status: upstream.status, headers });
}
