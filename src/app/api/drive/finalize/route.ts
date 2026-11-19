import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/video-access";
import { DRIVE_PREFIX, accessTokenFor, fileInfo } from "@/lib/drive";

/** Confirms the file really exists in the owner's Drive, then points the recording at it. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; fileId?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  if (!UUID.test(id) || !/^[\w-]{10,100}$/.test(fileId)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { data: conn } = await supabase.from("drive_connections").select("refresh_token_enc").eq("user_id", user.id).maybeSingle();
  const access = conn ? await accessTokenFor(conn.refresh_token_enc) : null;
  if (!access) return NextResponse.json({ error: "Google Drive is not connected" }, { status: 409 });
  const info = await fileInfo(access, fileId);
  if (!info || info.trashed) return NextResponse.json({ error: "The file was not found in Drive" }, { status: 404 });

  const { data, error } = await supabase
    .from("videos")
    .update({ storage_path: `${DRIVE_PREFIX}${fileId}` })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id");
  if (error || !data?.length) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
