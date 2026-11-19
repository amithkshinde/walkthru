import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/video-access";
import { R2_PREFIX, r2Configured, r2UploadUrl } from "@/lib/r2";

const MAX_UPLOAD = 2_000_000_000;

/** Tells the recorder whether R2 uploads are available. */
export async function GET() {
  return NextResponse.json({ enabled: r2Configured() });
}

/** Hands the signed-in owner a short-lived URL to upload one recording straight to R2. */
export async function POST(request: Request) {
  if (!r2Configured()) return NextResponse.json({ error: "R2 is not set up" }, { status: 501 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: unknown; mime?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const mime = typeof body.mime === "string" && body.mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD) {
    return NextResponse.json({ error: "Recording is too large" }, { status: 413 });
  }

  const key = `${user.id}/${id}.${mime === "video/mp4" ? "mp4" : "webm"}`;
  const url = await r2UploadUrl(key, mime);
  if (!url) return NextResponse.json({ error: "R2 is not set up" }, { status: 501 });
  return NextResponse.json({ url, path: `${R2_PREFIX}${key}`, contentType: mime });
}
