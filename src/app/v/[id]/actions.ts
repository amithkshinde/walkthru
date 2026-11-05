"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UUID, unlockCookie } from "@/lib/video-access";

export async function unlockVideo(id: string, _prev: { error?: string } | null, formData: FormData) {
  if (!UUID.test(id)) return { error: "This link is not valid." };
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter the password." };

  const supabase = await createClient();
  const { data } = await supabase.rpc("unlock_video", { vid: id, pw: password });
  if (!data || typeof data !== "string") return { error: "That password is wrong. Try again." };

  (await cookies()).set(unlockCookie(id), data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(`/v/${id}`);
}
