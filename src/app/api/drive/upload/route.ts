import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/video-access";
import { accessTokenFor, driveConfigured, startUpload } from "@/lib/drive";

const MAX_UPLOAD = 2_000_000_000;

/** Opens a resumable upload in the owner's Drive; the browser then sends the file straight to Google. */
export async function POST(request: Request) {
  if (!driveConfigured()) return NextResponse.json({ error: "Google Drive is not set up" }, { status: 501 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: unknown; mime?: unknown; size?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const mime = typeof body.mime === "string" && body.mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD) return NextResponse.json({ error: "Recording is too large" }, { status: 413 });
  const title = (typeof body.title === "string" ? body.title : "Recording").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "Recording";

  const { data: conn } = await supabase.from("drive_connections").select("refresh_token_enc, folder_id").eq("user_id", user.id).maybeSingle();
  if (!conn) return NextResponse.json({ error: "Google Drive is not connected" }, { status: 409 });
  const access = await accessTokenFor(conn.refresh_token_enc);
  if (!access) return NextResponse.json({ error: "Google Drive access expired. Reconnect it in Storage." }, { status: 409 });

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const sessionUri = await startUpload(access, {
    name: `${title} (${id.slice(0, 8)}).${mime === "video/mp4" ? "mp4" : "webm"}`,
    mime,
    size,
    folderId: conn.folder_id,
    origin,
  });
  if (!sessionUri) return NextResponse.json({ error: "Could not start the Drive upload" }, { status: 502 });
  return NextResponse.json({ sessionUri, contentType: mime });
}
