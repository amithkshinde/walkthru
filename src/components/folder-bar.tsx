"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function FolderBar({
  folders,
  active,
  q,
}: {
  folders: { id: string; name: string }[];
  active: string | null;
  q: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const href = (folder: string | null) => {
    const p = new URLSearchParams();
    if (folder) p.set("folder", folder);
    if (q) p.set("q", q);
    const qs = p.toString();
    return `/library${qs ? `?${qs}` : ""}`;
  };
  const chip = (on: boolean) =>
    `h-8 shrink-0 rounded-full border px-3 text-[13px] leading-8 ${
      on ? "border-brand bg-brand-soft font-medium text-brand" : "border-border-strong bg-surface text-muted hover:text-foreground"
    }`;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase.from("folders").insert({ owner_id: user.id, name: n.slice(0, 60) });
    if (err) return setError("Could not create the folder.");
    setName("");
    setAdding(false);
    setError(null);
    router.refresh();
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <Link href={href(null)} className={chip(!active)}>
        All
      </Link>
      <Link href={href("none")} className={chip(active === "none")}>
        No folder
      </Link>
      {folders.map((f) => (
        <Link key={f.id} href={href(f.id)} className={chip(active === f.id)}>
          {f.name}
        </Link>
      ))}
      {adding ? (
        <form onSubmit={create} className="flex items-center gap-1.5">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Folder name" aria-label="Folder name" className="field h-8 w-40 py-0" />
          <button type="submit" className="btn btn-secondary btn-sm">
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost btn-sm">
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn btn-ghost btn-sm">
          <FolderPlus className="h-4 w-4" /> New folder
        </button>
      )}
      <form action="/library" className="ml-auto flex items-center">
        {active && <input type="hidden" name="folder" value={active} />}
        <label className="relative">
          <span className="sr-only">Search recordings</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search" className="field h-8 w-44 py-0 pl-8" />
        </label>
      </form>
      {error && <p role="alert" className="w-full text-sm text-record">{error}</p>}
    </div>
  );
}
