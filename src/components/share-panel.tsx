"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
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
  requests: AccessRequest[];
  videoId: string;
  visibility: "link" | "private";
  hasPassword: boolean;
  allowDownload: boolean;
  expiresAt: string | null;
  requireSignin: boolean;
  emails: string[];
  description: string | null;
}

export default function SharePanel(p: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [visibility, setVisibility] = useState(p.visibility);
  const [hasPassword, setHasPassword] = useState(p.hasPassword);
  const [allowDownload, setAllowDownload] = useState(p.allowDownload);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expires, setExpires] = useState(p.expiresAt ? p.expiresAt.slice(0, 10) : "");
  const [signin, setSignin] = useState(p.requireSignin);
  const [emails, setEmails] = useState<string[]>(p.emails);
  const [newEmail, setNewEmail] = useState("");
  const [reqs, setReqs] = useState<AccessRequest[]>(p.requests);
  const [desc, setDesc] = useState(p.description ?? "");

  const embed = `<iframe src="${typeof window === "undefined" ? "" : window.location.origin}/embed/${p.videoId}" width="640" height="360" style="border:0" allow="fullscreen" allowfullscreen></iframe>`;

  function say(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
  }

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

  async function changeVisibility(v: "link" | "private") {
    if (await update({ visibility: v }, "vis")) setVisibility(v);
  }
  async function toggleDownload(v: boolean) {
    if (await update({ allow_download: v }, "dl")) setAllowDownload(v);
  }

  async function savePassword(clear: boolean) {
    const pw = clear ? "" : password;
    if (!clear && (pw.length < 4 || pw.length > 100)) return say("err", "Use 4 to 100 characters.");
    setBusy("pw");
    const { error } = await supabase.rpc("set_video_password", { vid: p.videoId, pw });
    setBusy(null);
    if (error) return say("err", "Could not update the password.");
    setHasPassword(!clear);
    setPassword("");
    say("ok", clear ? "Password removed" : "Password set");
  }

  async function saveExpiry(value: string) {
    setExpires(value);
    await update({ expires_at: value ? new Date(`${value}T23:59:59`).toISOString() : null }, "exp");
  }
  async function toggleSignin(v: boolean) {
    if (await update({ require_signin: v }, "si")) setSignin(v);
  }
  async function addEmail(e: React.FormEvent) {
    e.preventDefault();
    const em = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return say("err", "Enter a valid email address.");
    if (emails.includes(em)) return setNewEmail("");
    const { error } = await supabase.from("video_shares").insert({ video_id: p.videoId, email: em });
    if (error) return say("err", "Could not add that email.");
    setEmails((l) => [...l, em]);
    setNewEmail("");
    say("ok", "Saved");
  }
  async function removeEmail(em: string) {
    const { error } = await supabase.from("video_shares").delete().eq("video_id", p.videoId).eq("email", em);
    if (!error) setEmails((l) => l.filter((x) => x !== em));
  }
  async function decide(r: AccessRequest, approve: boolean) {
    setBusy(r.id);
    if (approve) {
      const { error: shareErr } = await supabase.from("video_shares").upsert({ video_id: p.videoId, email: r.email.toLowerCase() });
      if (shareErr) {
        setBusy(null);
        return say("err", "Could not grant access.");
      }
      setEmails((l) => (l.includes(r.email.toLowerCase()) ? l : [...l, r.email.toLowerCase()]));
      if (visibility === "private") {
        if (await update({ visibility: "link" }, "vis")) setVisibility("link");
      }
    }
    const { error } = await supabase.from("video_access_requests").update({ status: approve ? "approved" : "declined" }).eq("id", r.id);
    setBusy(null);
    if (error) return say("err", "Could not update the request.");
    setReqs((l) => l.map((x) => (x.id === r.id ? { ...x, status: approve ? "approved" : "declined" } : x)));
    say("ok", approve ? `${r.email} can now watch after signing in` : "Declined");
  }

  async function saveDesc() {
    await update({ description: desc.trim() || null }, "desc");
  }

  return (
    <div className="space-y-6 text-sm">
      {reqs.some((r) => r.status === "pending") && (
        <div className="rounded-lg border border-brand/40 bg-brand-soft p-4">
          <p className="font-medium">Access requests</p>
          <ul className="mt-2 divide-y divide-border">
            {reqs
              .filter((r) => r.status === "pending")
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
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
          {visibility === "private" && <p className="mt-2 text-xs text-muted">Approving switches the video to link access, limited to the people you have approved.</p>}
        </div>
      )}

      <fieldset>
        <legend className="font-medium">Who can watch</legend>
        <div className="mt-2 flex gap-2">
          {(["link", "private"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={visibility === v}
              disabled={busy === "vis"}
              onClick={() => changeVisibility(v)}
              className={`h-9 rounded-lg border px-3 ${
                visibility === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-border-strong bg-surface text-muted hover:text-foreground"
              }`}
            >
              {v === "link" ? "Anyone with the link" : "Only me"}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="sp-desc" className="font-medium">
          Description
        </label>
        <textarea id="sp-desc" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={saveDesc} maxLength={600} rows={2} placeholder="Shown under the title" className="field mt-2 resize-none" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sp-exp" className="font-medium">
            Link expires
          </label>
          <div className="mt-2 flex gap-2">
            <input id="sp-exp" type="date" value={expires} min={new Date().toISOString().slice(0, 10)} onChange={(e) => saveExpiry(e.target.value)} className="field" />
            {expires && (
              <button type="button" className="btn btn-ghost" onClick={() => saveExpiry("")}>
                Clear
              </button>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2.5 self-end pb-2">
          <input type="checkbox" checked={signin} onChange={(e) => toggleSignin(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Viewers must sign in
        </label>
      </div>

      <form onSubmit={addEmail}>
        <label htmlFor="sp-email" className="font-medium">
          Share with specific people
        </label>
        <div className="mt-2 flex gap-2">
          <input id="sp-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@company.com" className="field max-w-xs" />
          <button type="submit" className="btn btn-secondary">
            Add
          </button>
        </div>
        {emails.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {emails.map((em) => (
              <li key={em} className="flex items-center gap-1.5 rounded-full bg-surface-muted py-1 pl-3 pr-1.5 text-xs">
                {em}
                <button type="button" aria-label={`Remove ${em}`} onClick={() => removeEmail(em)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-border">
                  x
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted">With no emails added, anyone with the link can watch. Once you add one, only those people can, after signing in.</p>
        )}
      </form>

      <div>
        <label htmlFor="sp-pw" className="font-medium">
          Password {hasPassword && <span className="ml-1 text-xs font-normal text-success">on</span>}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="sp-pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={100}
            placeholder={hasPassword ? "Set a new password" : "Add a password"}
            className="field max-w-xs"
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

      <label className="flex items-center gap-2.5">
        <input type="checkbox" checked={allowDownload} onChange={(e) => toggleDownload(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
        Let viewers download the video
      </label>

      <div>
        <p className="font-medium">Embed</p>
        <div className="mt-2 flex items-start gap-2">
          <code className="block flex-1 overflow-x-auto whitespace-pre rounded-lg border border-border bg-background p-3 font-mono text-xs">{embed}</code>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(embed);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch {}
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {visibility === "private" && <p className="mt-1 text-xs text-muted">Embeds only play for you while the video is private.</p>}
      </div>

      <p role="status" className={`min-h-5 text-sm ${msg?.kind === "err" ? "text-record" : "text-success"}`}>
        {msg?.text}
      </p>
    </div>
  );
}
