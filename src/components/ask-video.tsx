"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { formatTime } from "@/lib/format";

export default function AskVideo({
  videoId,
  hasTranscript,
  signedIn,
  onSeek,
}: {
  videoId: string;
  hasTranscript: boolean;
  signedIn: boolean;
  onSeek: (t: number) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ answer: string; refs: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasTranscript) return <p className="text-muted">This recording has no transcript to ask about.</p>;
  if (!signedIn) return <p className="text-muted">Sign in to ask questions about this video.</p>;

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = (await res.json()) as { answer?: string; refs?: number[]; error?: string };
      if (!res.ok || !json.answer) throw new Error(json.error ?? "Could not answer");
      setResult({ answer: json.answer, refs: json.refs ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={ask} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="What did they decide about pricing?" aria-label="Ask about this video" className="field" />
        <button type="submit" disabled={busy || !q.trim()} className="btn btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Ask
        </button>
      </form>
      {error && (
        <p role="alert" className="anim-alert mt-3 text-sm text-record">
          {error}
        </p>
      )}
      {result && (
        <div className="anim-fade mt-4 rounded-lg border border-border bg-background p-4">
          <p className="max-w-prose whitespace-pre-line text-[15px] leading-relaxed">{result.answer}</p>
          {result.refs.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              Jump to
              {result.refs.map((t) => (
                <button key={t} type="button" onClick={() => onSeek(t)} className="rounded bg-surface-muted px-1.5 py-0.5 font-mono tabular-nums text-brand hover:bg-brand hover:text-on-brand">
                  {formatTime(t)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
