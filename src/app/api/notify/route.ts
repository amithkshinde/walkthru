import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { UUID } from "@/lib/video-access";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Emails the owner about a new comment. Needs RESEND_API_KEY and SUPABASE_SERVICE_ROLE_KEY; otherwise a no-op. */
export async function POST(request: Request) {
  const resend = process.env.RESEND_API_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!resend || !service || !url) return NextResponse.json({ ok: true, sent: false });

  let commentId = "";
  try {
    const body = (await request.json()) as { commentId?: unknown };
    if (typeof body.commentId === "string") commentId = body.commentId;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!UUID.test(commentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = createAdmin(url, service, { auth: { persistSession: false } });
  const { data: c } = await admin
    .from("comments")
    .select("id, video_id, author_id, author_name, body, created_at")
    .eq("id", commentId)
    .maybeSingle();
  if (!c || Date.now() - new Date(c.created_at).getTime() > 2 * 60_000) return NextResponse.json({ ok: true, sent: false });

  const { data: v } = await admin.from("videos").select("id, title, owner_id").eq("id", c.video_id).maybeSingle();
  if (!v || v.owner_id === c.author_id) return NextResponse.json({ ok: true, sent: false });

  // Throttle: skip if another comment landed on this video in the previous 2 minutes.
  const since = new Date(new Date(c.created_at).getTime() - 2 * 60_000).toISOString();
  const { count } = await admin
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("video_id", v.id)
    .neq("id", c.id)
    .gte("created_at", since)
    .lte("created_at", c.created_at);
  if ((count ?? 0) > 0) return NextResponse.json({ ok: true, sent: false });

  const { data: owner } = await admin.auth.admin.getUserById(v.owner_id);
  const to = owner?.user?.email;
  if (!to) return NextResponse.json({ ok: true, sent: false });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const link = `${origin}/v/${v.id}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resend}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "Walkthru <onboarding@resend.dev>",
      to,
      subject: `${c.author_name} commented on ${v.title}`.slice(0, 150),
      html: `<p><strong>${esc(c.author_name)}</strong> commented on <a href="${link}">${esc(v.title)}</a>:</p><blockquote>${esc(c.body)}</blockquote><p><a href="${link}">Open the video</a></p>`,
    }),
  });
  return NextResponse.json({ ok: true, sent: res.ok });
}
