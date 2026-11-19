import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/drive";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("drive_connections").select("refresh_token_enc").eq("user_id", user.id).maybeSingle();
  if (data?.refresh_token_enc) await revokeToken(data.refresh_token_enc);
  await supabase.from("drive_connections").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
