"use client";

import { useState } from "react";
import { Check, Copy, Download, Loader2, RefreshCw } from "lucide-react";
import Markdown from "@/components/markdown";

export interface AiOutput {
  content: string;
  generated_at: string;
  used_claude: boolean;
}
export type AiOutputs = Partial<Record<"notes" | "mom" | "sop" | "ticket" | "doc", AiOutput>>;

const KINDS = [
  { id: "notes", label: "Notes" },
  { id: "mom", label: "Minutes of meeting" },
  { id: "sop", label: "Step-by-step guide" },
  { id: "ticket", label: "Ticket" },
  { id: "doc", label: "Document" },
] as const;

export default function AiDocs({
  videoId,
  title,
  hasTranscript,
  isOwner,
  initial,
}: {
  videoId: string;
  title: string;
  hasTranscript: boolean;
  isOwner: boolean;
  initial: AiOutputs;
}) {
  const [outputs, setOutputs] = useState<AiOutputs>(initial);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("notes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const current = outputs[kind];

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = (await res.json()) as { output?: AiOutput; error?: string };
      if (!res.ok || !json.output) throw new Error(json.error ?? "Could not generate");
      setOutputs((o) => ({ ...o, [kind]: json.output }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  function download() {
    if (!current) return;
    const blob = new Blob([current.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = title.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").slice(0, 50) || "walkthru";
    a.download = `${slug}-${kind}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Output type">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
            className={`h-8 rounded-full border px-3 text-[13px] transition-colors ${
              kind === k.id
                ? "border-brand bg-brand-soft font-medium text-brand"
                : "border-border-strong bg-surface text-muted hover:text-foreground"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {current ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" onClick={download} className="btn btn-secondary btn-sm">
                <Download className="h-3.5 w-3.5" /> Download .md
              </button>
              {isOwner && (
                <button type="button" onClick={generate} disabled={busy} className="btn btn-ghost btn-sm">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Regenerate
                </button>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <Markdown source={current.content} />
            </div>
            {!current.used_claude && (
              <p className="mt-2 text-xs text-muted">
                Basic output. Add an Anthropic API key to the server for fuller, better written documents.
              </p>
            )}
          </>
        ) : !hasTranscript ? (
          <p className="text-muted">This recording has no transcript, so there is nothing to build a document from.</p>
        ) : isOwner ? (
          <button type="button" onClick={generate} disabled={busy} className="btn btn-primary btn-sm">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "Writing" : `Generate ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}`}
          </button>
        ) : (
          <p className="text-muted">The owner has not generated this yet.</p>
        )}
        {error && (
          <p role="alert" className="anim-alert mt-2 text-sm text-record">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
