import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { authUrl, driveConfigured } from "@/lib/drive";

/** Sends the signed-in user to Google to allow Walkthru to save recordings to their Drive. */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/library`);
  if (!driveConfigured()) return NextResponse.redirect(`${origin}/library?drive=unconfigured`);

  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set("wt_drive_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/drive", maxAge: 600 });
  return res;
}
