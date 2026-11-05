"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  videoId: string;
  visibility: "link" | "private";
  hasPassword: boolean;
  allowDownload: boolean;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export default function SharePanel(p: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [visibility, setVisibility] = useState(p.visibility);
  const [hasPassword, setHasPassword] = useState(p.hasPassword);
  const [allowDownload, setAllowDownload] = useState(p.allowDownload);
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState(p.ctaLabel ?? "");
  const [url, setUrl] = useState(p.ctaUrl ?? "");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function saveCta(e: React.FormEvent) {
    e.preventDefault();
    const l = label.trim();
    const u = url.trim();
    if (!l && !u) {
      await update({ cta_label: null, cta_url: null }, "cta");
      return;
    }
    if (!l || l.length > 40) return say("err", "Button text must be 1 to 40 characters.");
    if (!/^https?:\/\//i.test(u) || u.length > 500) return say("err", "Link must start with http:// or https://");
    await update({ cta_label: l, cta_url: u }, "cta");
  }

  return (
    <div className="space-y-6 text-sm">
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

      <form onSubmit={saveCta} className="space-y-2">
        <p className="font-medium">Call to action</p>
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Button text" aria-label="Button text" className="field" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://example.com" aria-label="Button link" className="field" />
          <button type="submit" disabled={busy === "cta"} className="btn btn-secondary">
            Save
          </button>
        </div>
        <p className="text-xs text-muted">Shown under the video and when it ends. Leave both empty to remove it.</p>
      </form>

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
