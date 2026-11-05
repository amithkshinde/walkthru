"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function VideoCardActions({
  id,
  storagePath,
}: {
  id: string;
  storagePath: string | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v/${id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  async function remove() {
    if (!window.confirm("Delete this recording? This can't be undone.")) return;
    setDeleting(true);
    const supabase = createClient();
    if (storagePath) await supabase.storage.from("recordings").remove([storagePath]);
    await supabase.from("videos").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={deleting}
        aria-label="Delete recording"
        className="rounded-lg p-1.5 text-muted hover:bg-record-soft hover:text-record disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
