"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/logo";

export default function AppNav({ email }: { email?: string | null }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo href="/library" />
        <div className="flex items-center gap-2">
          {email && <span className="mr-2 hidden text-[13px] text-muted md:inline">{email}</span>}
          <Link href="/record" className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New recording
          </Link>
          <button type="button" onClick={signOut} className="btn btn-ghost btn-sm" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
