import type { SupabaseClient } from "@supabase/supabase-js";
import { isR2Path, r2Key, r2ReadUrl } from "@/lib/r2";

/** Signed playback (or download) URL for a recording, wherever it is stored. Call only after access checks. */
export async function videoUrl(
  supabase: SupabaseClient,
  path: string,
  expires: number,
  downloadName?: string,
): Promise<string | null> {
  if (isR2Path(path)) return r2ReadUrl(r2Key(path), expires, downloadName);
  const { data } = await supabase.storage
    .from("recordings")
    .createSignedUrl(path, expires, downloadName ? { download: downloadName } : undefined);
  return data?.signedUrl ?? null;
}
