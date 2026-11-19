import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessTokenFor, createFolder, driveConfigured, encryptToken, exchangeCode } from "@/lib/drive";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { origin, searchParams } = url;
  const back = (q: string) => {
    const res = NextResponse.redirect(`${origin}/library?drive=${q}`);
    res.cookies.set("wt_drive_state", "", { path: "/api/drive", maxAge: 0 });
    return res;
  };

  const cookieState = request.headers.get("cookie")?.match(/(?:^|;\s*)wt_drive_state=([0-9a-f]+)/)?.[1];
  if (searchParams.get("error")) return back("denied");
  const code = searchParams.get("code");
  if (!code || !cookieState || cookieState !== searchParams.get("state") || !driveConfigured()) return back("error");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/library`);

  const tokens = await exchangeCode(origin, code);
  if (!tokens?.refresh_token) return back("error");
  const encrypted = encryptToken(tokens.refresh_token);

  const access = await accessTokenFor(encrypted);
  const folderId = access ? await createFolder(access, "Walkthru recordings") : null;
  const { error } = await supabase
    .from("drive_connections")
    .upsert({ user_id: user.id, refresh_token_enc: encrypted, folder_id: folderId, email: user.email ?? null, enabled: true }, { onConflict: "user_id" });
  return back(error ? "error" : "connected");
}
