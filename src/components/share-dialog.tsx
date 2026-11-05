"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Globe, Link2, Loader2, Lock, Settings2, Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface AccessRequest {
  id: string;
  email: string;
  name: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

interface Props {
  videoId: string;
  title: string;
  ownerEmail: string | null;
  visibility: "link" | "private";
  linkRestricted: boolean;
  hasPassword: boolean;
  allowDownload: boolean;
  expiresAt: string | null;
  requireSignin: boolean;
  emails: string[];
  requests: AccessRequest[];
}

export default function ShareDialog(p: Props) {
  const supabase = useMemo(() => createClient(), []);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [restricted, setRestricted] = useState(p.linkRestricted || p.visibility === "private");
  const [emails, setEmails] = useState<string[]>(p.emails);
  const [reqs, setReqs] = useState<AccessRequest[]>(p.requests);
  const [newEmail, setNewEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(p.hasPassword);
  const [password, setPassword] = useState("");
  const [allowDownload, setAllowDownload] = useState(p.allowDownload);
  const [expires, setExpires] = useState(p.expiresAt ? p.expiresAt.slice(0, 10) : "");
  const [signin, setSignin] = useState(p.requireSignin);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  const pending = reqs.filter((r) => r.status === "pending");

  useEffect(() => {
    if (!msg || msg.kind === "err") return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const say = (kind: "ok" | "err", text: string) => setMsg({ kind, text });

  async function update(patch: Record<string, unknown>, key: string) {
    setBusy(key);
    const { error } = await supabase.from("videos").update(patch).eq("id", p.videoId);
    setBusy(null);
    if (error) {
      say("err", "Could not save that change.");
      return false;
    }
    say("ok", "Saved");
    return true;
  }

  async function setGeneral(value: "restricted" | "anyone") {
    const r = value === "restricted";
    if (await update({ link_restricted: r, visibility: "link" }, "gen")) setRestricted(r);
  }

  async function grant(email: string) {
    const em = email.trim().toLowerCase();
    const { error } = await supabase.from("video_shares").upsert({ video_id: p.videoId, email: em });
    if (error) {
      say("err", "Could not add that person.");
      return false;
    }
    // People can only open the link once the video is visible and gated to the list.
    if (!restricted || p.visibility === "private") {
      if (restricted && !(await update({ link_restricted: true, visibility: "link" }, "gen"))) return false;
    }
    setEmails((l) => (l.includes(em) ? l : [...l, em]));
    return true;
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const em = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return say("err", "Enter a valid email address.");
    if (await grant(em)) {
      setNewEmail("");
      say("ok", `${em} can now open the link`);
    }
  }

  async function removePerson(em: string) {
    const { error } = await supabase.from("video_shares").delete().eq("video_id", p.videoId).eq("email", em);
    if (!error) setEmails((l) => l.filter((x) => x !== em));
    else say("err", "Could not remove access.");
  }

  async function decide(r: AccessRequest, approve: boolean) {
    setBusy(r.id);
    if (approve && !(await grant(r.email))) {
      setBusy(null);
      return;
    }
    const { error } = await supabase.from("video_access_requests").update({ status: approve ? "approved" : "declined" }).eq("id", r.id);
    setBusy(null);
    if (error) return say("err", "Could not update the request.");
    setReqs((l) => l.map((x) => (x.id === r.id ? { ...x, status: approve ? "approved" : "declined" } : x)));
    say("ok", approve ? `${r.email} can now open the link` : "Request declined");
  }

  async function savePassword(clear: boolean) {
    const pw = clear ? "" : password;
    if (!clear && (pw.length < 4 || pw.length > 100)) return say("err", "Use 4 to 100 characters for the password.");
    setBusy("pw");
    const { error } = await supabase.rpc("set_video_password", { vid: p.videoId, pw });
    setBusy(null);
    if (error) return say("err", "Could not update the password.");
    setHasPassword(!clear);
    setPassword("");
    say("ok", clear ? "Password removed" : "Password set");
  }

  async function copy(kind: "link" | "embed") {
    const text =
      kind === "link"
        ? `${window.location.origin}/v/${p.videoId}`
        : `<iframe src="${window.location.origin}/embed/${p.videoId}" width="640" height="360" style="border:0" allow="fullscreen" allowfullscreen></iframe>`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {}
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="btn btn-primary relative">
        <Share2 className="h-4 w-4" aria-hidden /> Share
        {pending.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-record px-1 text-[11px] font-semibold text-white">
            {pending.length}
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="share-title"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
        className="m-auto max-h-[90dvh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-foreground shadow-panel backdrop:bg-black/50"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="share-title" className="min-w-0 truncate text-xl font-semibold tracking-tight">
              Share &ldquo;{p.title}&rdquo;
            </h2>
            <button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="btn btn-ghost h-8 w-8 shrink-0 px-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={addPerson} className="mt-4 flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Add people by email"
              aria-label="Add people by email"
              className="field"
            />
            <button type="submit" disabled={!newEmail.trim()} className="btn btn-secondary">
              Add
            </button>
          </form>

          {pending.length > 0 && (
            <div className="mt-5 rounded-lg border border-brand/40 bg-brand-soft p-4">
              <h3 className="text-sm font-medium">Requests to open this video</h3>
              <ul className="mt-1 divide-y divide-border">
                {pending.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {r.name ? `${r.name} ` : ""}
                        <span className="text-muted">{r.email}</span>
                      </p>
                      {r.message && <p className="mt-0.5 text-xs text-muted">{r.message}</p>}
                    </div>
                    <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)} className="btn btn-primary btn-sm">
                      Approve
                    </button>
                    <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)} className="btn btn-ghost btn-sm">
                      Decline
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h3 className="mt-6 text-base font-medium">People with access</h3>
          <ul className="mt-2 divide-y divide-border">
            <li className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand" aria-hidden>
                {(p.ownerEmail ?? "Y")[0].toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">You</p>
                {p.ownerEmail && <p className="truncate text-muted">{p.ownerEmail}</p>}
              </div>
              <span className="text-sm text-subtle">Owner</span>
            </li>
            {emails.map((em) => (
              <li key={em} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-muted text-sm font-semibold text-muted" aria-hidden>
                  {em[0].toUpperCase()}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm">{em}</p>
                <span className="text-sm text-subtle">Can view</span>
                <button type="button" onClick={() => removePerson(em)} aria-label={`Remove ${em}`} className="btn btn-ghost h-8 w-8 px-0">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {emails.length === 0 && restricted && <p className="pb-1 text-sm text-muted">Only you can open this video right now.</p>}

          <h3 className="mt-6 text-base font-medium">General access</h3>
          <div className="mt-3 flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${restricted ? "bg-surface-muted" : "bg-brand-soft"}`}>
              {restricted ? <Lock className="h-4 w-4 text-muted" aria-hidden /> : <Globe className="h-4 w-4 text-brand" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="general-access" className="sr-only">
                General access
              </label>
              <select
                id="general-access"
                value={restricted ? "restricted" : "anyone"}
                disabled={busy === "gen"}
                onChange={(e) => setGeneral(e.target.value as "restricted" | "anyone")}
                className="-ml-2 h-9 rounded-lg border border-transparent bg-transparent px-2 text-[15px] font-medium hover:bg-surface-muted"
              >
                <option value="restricted">Restricted</option>
                <option value="anyone">Anyone with the link</option>
              </select>
              <p className="text-sm text-muted">
                {restricted ? "Only people with access can open with the link" : "Anyone on the internet with the link can watch"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 border-t border-border pt-6 text-sm">
          {restricted && (
          <div>
            <label htmlFor="sd-pw" className="font-medium">
              Password {hasPassword && <span className="ml-1 text-xs font-normal text-success">on</span>}
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="sd-pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={100}
                placeholder={hasPassword ? "Set a new password" : "Add a password"}
                className="field min-w-0 flex-1"
              />
              <button type="button" onClick={() => savePassword(false)} disabled={busy === "pw" || !password} className="btn btn-secondary">
                {busy === "pw" && <Loader2 className="h-4 w-4 animate-spin" />} {hasPassword ? "Change" : "Set"}
              </button>
              {hasPassword && (
                <button type="button" onClick={() => savePassword(true)} disabled={busy === "pw"} className="btn btn-ghost">
                  Remove
                </button>
              )}
            </div>
          </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="sd-exp" className="font-medium">
                Link expires
              </label>
              <input
                id="sd-exp"
                type="date"
                value={expires}
                min={new Date().toISOString().slice(0, 10)}
                onChange={async (e) => {
                  setExpires(e.target.value);
                  await update({ expires_at: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null }, "exp");
                }}
                className="field mt-2"
              />
            </div>
            {expires && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  setExpires("");
                  await update({ expires_at: null }, "exp");
                }}
              >
                Clear
              </button>
            )}
          </div>

          </div>

          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="mt-5 flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" aria-hidden /> Link settings
          </button>

          {moreOpen && (
            <div className="anim-fade mt-4 space-y-5 rounded-lg border border-border bg-background p-4 text-sm">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={signin}
                  onChange={async (e) => {
                    if (await update({ require_signin: e.target.checked }, "si")) setSignin(e.target.checked);
                  }}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Viewers must sign in
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={async (e) => {
                    if (await update({ allow_download: e.target.checked }, "dl")) setAllowDownload(e.target.checked);
                  }}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Let viewers download the video
              </label>

              <button type="button" onClick={() => copy("embed")} className="btn btn-secondary btn-sm">
                {copied === "embed" ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === "embed" ? "Embed code copied" : "Copy embed code"}
              </button>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" onClick={() => copy("link")} className="btn btn-secondary">
              {copied === "link" ? <Check className="anim-pop h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <p role="status" className={`min-w-0 flex-1 truncate text-right text-sm ${msg?.kind === "err" ? "text-record" : "text-success"}`}>
              {msg?.text}
            </p>
            <button type="button" onClick={() => dialogRef.current?.close()} className="btn btn-primary">
              Done
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
