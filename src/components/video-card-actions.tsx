"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function VideoCardActions({
  id,
  storagePath,
  thumbnailPath,
  folderId,
  folders,
}: {
  id: string;
  storagePath: string | null;
  thumbnailPath: string | null;
  folderId: string | null;
  folders: { id: string; name: string }[];
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
    const files = [storagePath, thumbnailPath].filter((x): x is string => !!x);
    if (files.length) await supabase.storage.from("recordings").remove(files);
    await supabase.from("videos").delete().eq("id", id);
    router.refresh();
  }

  async function move(value: string) {
    const supabase = createClient();
    await supabase.from("videos").update({ folder_id: value || null }).eq("id", id);
    router.refresh();
  }

  return (
    <div className="-mr-1.5 flex shrink-0 items-center">
      {folders.length > 0 && (
        <select
          aria-label="Move to folder"
          value={folderId ?? ""}
          onChange={(e) => move(e.target.value)}
          className="mr-1 h-8 max-w-24 rounded-lg border border-transparent bg-transparent px-1 text-xs text-muted hover:border-border-strong"
        >
          <option value="">No folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Link copied" : "Copy link"}
        title={copied ? "Link copied" : "Copy link"}
        className="btn btn-ghost h-8 w-8 px-0"
      >
        {copied ? <Check className="anim-pop h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
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
