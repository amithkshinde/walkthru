"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Loader2, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTime, timeAgo } from "@/lib/format";

// Supabase free plan: 1 GB of file storage per project. Cloudflare R2 free tier: 10 GB.
const SUPABASE_BYTES = 1_000_000_000;
const R2_BYTES = 10_000_000_000;

interface Item {
  id: string;
  title: string;
  storage_path: string | null;
  thumbnail_path: string | null;
  duration_seconds: number;
  created_at: string;
}

const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.round(n / 1e6)} MB`);

export default function StoragePanel({ userId, items }: { userId: string; items: Item[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [sizes, setSizes] = useState<Map<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [r2On, setR2On] = useState(false);
  const [drive, setDrive] = useState<{ configured: boolean; connected: boolean; enabled: boolean } | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const map = new Map<string, number>();
    let offset = 0;
    for (;;) {
      const { data, error: err } = await supabase.storage.from("recordings").list(userId, { limit: 100, offset });
      if (err) {
        setError("Could not read storage usage.");
        break;
      }
      for (const f of data ?? []) map.set(`${userId}/${f.name}`, Number((f.metadata as { size?: number } | null)?.size ?? 0));
      if (!data || data.length < 100) break;
      offset += 100;
    }
    try {
      const res = await fetch("/api/r2/usage");
      if (res.ok) {
        const j = (await res.json()) as { enabled: boolean; sizes: Record<string, number> };
        setR2On(j.enabled);
        for (const [k, v] of Object.entries(j.sizes)) map.set(k, v);
      }
    } catch {}
    try {
      const res = await fetch("/api/drive/status");
      if (res.ok) setDrive(await res.json());
    } catch {}
    setSizes(map);
    setLoading(false);
  }

  function open() {
    dialogRef.current?.showModal();
    setPicked(new Set());
    load();
  }

  const sizeOf = (i: Item) => (sizes?.get(i.storage_path ?? "") ?? 0) + (sizes?.get(i.thumbnail_path ?? "") ?? 0);
  const total = sizes ? [...sizes.entries()].filter(([k]) => !k.startsWith("r2:")).reduce((a, [, b]) => a + b, 0) : 0;
  const r2Total = sizes ? [...sizes.entries()].filter(([k]) => k.startsWith("r2:")).reduce((a, [, b]) => a + b, 0) : 0;
  const rows = useMemo(() => [...items].sort((a, b) => sizeOf(b) - sizeOf(a)), [items, sizes]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickedBytes = rows.filter((r) => picked.has(r.id)).reduce((a, r) => a + sizeOf(r), 0);
  const pct = Math.min(100, (total / SUPABASE_BYTES) * 100);
  const r2Pct = Math.min(100, (r2Total / R2_BYTES) * 100);

  async function setDriveEnabled(enabled: boolean) {
    setDriveBusy(true);
    const res = await fetch("/api/drive/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => null);
    if (res?.ok) setDrive((d) => (d ? { ...d, enabled } : d));
    else setError("Could not change the Google Drive setting.");
    setDriveBusy(false);
  }

  async function disconnectDrive() {
    if (!window.confirm("Disconnect Google Drive? Recordings already saved in your Drive will stop playing until you reconnect.")) return;
    setDriveBusy(true);
    const res = await fetch("/api/drive/disconnect", { method: "POST" }).catch(() => null);
    if (res?.ok) setDrive((d) => (d ? { ...d, connected: false, enabled: false } : d));
    else setError("Could not disconnect Google Drive.");
    setDriveBusy(false);
  }

  async function removePicked() {
    const chosen = rows.filter((r) => picked.has(r.id));
    if (!chosen.length) return;
    if (!window.confirm(`Delete ${chosen.length} recording${chosen.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setDeleting(true);
    const res = await fetch("/api/videos/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chosen.map((r) => r.id) }),
    }).catch(() => null);
    setDeleting(false);
    if (!res?.ok) return setError("Some recordings could not be deleted.");
    setPicked(new Set());
    await load();
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={open} className="btn btn-secondary btn-sm">
        <HardDrive className="h-4 w-4" aria-hidden /> Storage
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="storage-title"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
        className="m-auto max-h-[90dvh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-foreground shadow-panel backdrop:bg-black/50"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="storage-title" className="text-xl font-semibold tracking-tight">
              Storage
            </h2>
            <button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="btn btn-ghost h-8 w-8 px-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading && !sizes ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Measuring
            </p>
          ) : (
            <>
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={SUPABASE_BYTES} aria-valuenow={total}>
                  <div className={`h-full rounded-full transition-[width] ${pct > 85 ? "bg-record" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-sm text-muted">
                  {mb(total)} of {mb(SUPABASE_BYTES)} used in Supabase (older recordings)
                </p>
              </div>
              {r2On && (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="R2 storage used" aria-valuemin={0} aria-valuemax={R2_BYTES} aria-valuenow={r2Total}>
                    <div className={`h-full rounded-full transition-[width] ${r2Pct > 85 ? "bg-record" : "bg-brand"}`} style={{ width: `${r2Pct}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {mb(r2Total)} of {mb(R2_BYTES)} used in Cloudflare R2 (new recordings)
                  </p>
                </div>
              )}

              {drive?.configured && (
                <div className="mt-5 rounded-xl border border-border p-4">
                  <p className="text-sm font-medium">Google Drive</p>
                  {drive.connected ? (
                    <>
                      <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={drive.enabled}
                          disabled={driveBusy}
                          onChange={(e) => setDriveEnabled(e.target.checked)}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        Save new recordings to my Google Drive
                      </label>
                      <p className="mt-1.5 text-xs text-muted">Files go in a &ldquo;Walkthru recordings&rdquo; folder. They don&apos;t count toward Walkthru&apos;s storage, only your Drive&apos;s.</p>
                      <button type="button" onClick={disconnectDrive} disabled={driveBusy} className="btn btn-ghost btn-sm mt-2 -ml-2.5">
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-muted">Store new recordings in your own Google Drive instead of Walkthru&apos;s storage. Walkthru can only see files it creates.</p>
                      <a href="/api/drive/connect" className="btn btn-secondary btn-sm mt-3">
                        Connect Google Drive
                      </a>
                    </>
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="anim-alert mt-3 text-sm text-record">
                  {error}
                </p>
              )}

              {rows.length === 0 ? (
                <p className="mt-6 text-sm text-muted">No recordings.</p>
              ) : (
                <>
                  <p className="mt-5 text-sm font-medium">Largest first</p>
                  <ul className="mt-2 divide-y divide-border">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <label className="flex cursor-pointer items-center gap-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={picked.has(r.id)}
                            onChange={(e) =>
                              setPicked((p) => {
                                const n = new Set(p);
                                if (e.target.checked) n.add(r.id);
                                else n.delete(r.id);
                                return n;
                              })
                            }
                            className="h-4 w-4 accent-[var(--brand)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{r.title}</span>
                            <span className="text-xs text-muted">
                              {timeAgo(r.created_at)} · {formatTime(r.duration_seconds)}
                            </span>
                          </span>
                          <span className="font-mono text-xs tabular-nums text-muted">{mb(sizeOf(r))}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted">{picked.size > 0 ? `${picked.size} selected, frees ${mb(pickedBytes)}` : "Select recordings to delete"}</p>
                    <button type="button" onClick={removePicked} disabled={picked.size === 0 || deleting} className="btn btn-record btn-sm">
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
