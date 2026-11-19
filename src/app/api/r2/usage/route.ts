import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { r2Configured, r2Sizes } from "@/lib/r2";

/** File sizes in R2 for the signed-in user, keyed by storage_path. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) return NextResponse.json({ enabled: false, sizes: {} });
  const sizes = await r2Sizes(`${user.id}/`);
  return NextResponse.json({ enabled: true, sizes: Object.fromEntries(sizes) });
}
