"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function AppNav({ email }: { email?: string | null }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/library" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-3 w-3 rounded-full bg-record" />
          Walkthru
        </Link>
        <div className="flex items-center gap-3">
          {email && <span className="hidden text-sm text-muted sm:inline">{email}</span>}
          <Link
            href="/record"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" /> New recording
          </Link>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
