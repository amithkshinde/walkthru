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
    <div className="-mr-1.5 flex shrink-0 items-center">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Link copied" : "Copy link"}
        title={copied ? "Link copied" : "Copy link"}
        className="btn btn-ghost h-8 w-8 px-0"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={deleting}
        aria-label="Delete recording"
        title="Delete recording"
        className="btn btn-ghost h-8 w-8 px-0 hover:!bg-record-soft hover:!text-record"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
