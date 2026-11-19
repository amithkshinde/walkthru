import type { SupabaseClient } from "@supabase/supabase-js";
import { isR2Path, r2Key, r2ReadUrl } from "@/lib/r2";
import { isDrivePath } from "@/lib/drive";

/** Signed playback (or download) URL for a recording, wherever it is stored. Call only after access checks. */
export async function videoUrl(
  supabase: SupabaseClient,
  path: string,
  expires: number,
  downloadName?: string,
  videoId?: string,
): Promise<string | null> {
  // Drive recordings stream through our own route, which re-checks access on every request.
  if (isDrivePath(path)) return videoId ? `/api/drive/play/${videoId}${downloadName ? "?dl=1" : ""}` : null;
  if (isR2Path(path)) return r2ReadUrl(r2Key(path), expires, downloadName);
  const { data } = await supabase.storage
    .from("recordings")
    .createSignedUrl(path, expires, downloadName ? { download: downloadName } : undefined);
  return data?.signedUrl ?? null;
}
