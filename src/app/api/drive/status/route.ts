import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { driveConfigured } from "@/lib/drive";

export async function GET() {
  const configured = driveConfigured();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !configured) return NextResponse.json({ configured, connected: false, enabled: false });
  const { data } = await supabase.from("drive_connections").select("enabled").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ configured, connected: !!data, enabled: !!data?.enabled });
}

/** Turns "save new recordings to my Drive" on or off. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { error } = await supabase.from("drive_connections").update({ enabled: body.enabled }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
