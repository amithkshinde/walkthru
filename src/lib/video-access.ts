import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type Access = "missing" | "private" | "locked" | "open" | "expired" | "signin" | "restricted";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const unlockCookie = (id: string) => `wt_unlock_${id}`;

/** Works out what the current visitor may see, using the unlock cookie if present. */
export async function resolveVideoAccess(id: string) {
  const store = await cookies();
  const raw = store.get(unlockCookie(id))?.value;
  const token = raw && /^[0-9a-f]{64}$/.test(raw) ? raw : undefined;
  const supabase = await createClient(token);
  const { data } = await supabase.rpc("video_access", { vid: id });
  return { supabase, token, access: ((data as string | null) ?? "missing") as Access };
}

export function fileSlug(title: string, path: string) {
  const ext = path.endsWith(".mp4") ? "mp4" : "webm";
  const base = title.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").slice(0, 60) || "walkthru";
  return `${base}.${ext}`;
}
