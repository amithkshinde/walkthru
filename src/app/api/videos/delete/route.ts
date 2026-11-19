import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/video-access";
import { isR2Path, r2Delete, r2Key } from "@/lib/r2";

/** Deletes the owner's recordings: files in R2 or Supabase, the thumbnail, then the database rows. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let ids: string[] = [];
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 100);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!ids.length) return NextResponse.json({ error: "Nothing to delete" }, { status: 400 });

  const { data: videos } = await supabase
    .from("videos")
    .select("id, storage_path, thumbnail_path")
    .eq("owner_id", user.id)
    .in("id", ids);
  if (!videos?.length) return NextResponse.json({ ok: true, deleted: 0 });

  const r2Keys = videos.flatMap((v) => (isR2Path(v.storage_path) ? [r2Key(v.storage_path)] : []));
  const supaFiles = videos.flatMap((v) => [v.storage_path && !isR2Path(v.storage_path) ? v.storage_path : null, v.thumbnail_path]).filter((x): x is string => !!x);

  if (r2Keys.length) await r2Delete(r2Keys);
  if (supaFiles.length) await supabase.storage.from("recordings").remove(supaFiles);
  const { error } = await supabase
    .from("videos")
    .delete()
    .eq("owner_id", user.id)
    .in("id", videos.map((v) => v.id));
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: videos.length });
}
