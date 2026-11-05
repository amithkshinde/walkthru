"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import Markdown from "@/components/markdown";
import { formatTime } from "@/lib/format";

type Msg = { role: "user" | "assistant"; content: string; refs?: number[] };

const SUGGESTIONS = ["Summarize this in 3 bullets", "What decisions were made?", "List the action items", "What questions are still open?"];

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
  const [messages, setMessages] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, busy]);

  if (!hasTranscript) return <p className="text-muted">This recording has no transcript to chat about.</p>;
  if (!signedIn) return <p className="text-muted">Sign in to chat about this video.</p>;

  async function send(text: string) {
    const content = text.trim().slice(0, 300);
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setQ("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content: c }) => ({ role, content: c })) }),
      });
      const json = (await res.json()) as { answer?: string; refs?: number[]; error?: string };
      if (!res.ok || !json.answer) throw new Error(json.error ?? "Could not answer");
      setMessages((m) => [...m, { role: "assistant", content: json.answer!, refs: json.refs }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="max-h-96 space-y-4 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="text-muted">Ask anything about this recording. Answers come from its transcript.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-[13px] text-muted hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="anim-fade flex justify-end">
              <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[15px] text-on-brand">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="anim-fade flex gap-2.5">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft" aria-hidden>
                <Sparkles className="h-3.5 w-3.5 text-brand" />
              </span>
              <div className="min-w-0 max-w-[90%]">
                <Markdown source={m.content} onSeek={onSeek} />
                {m.refs && m.refs.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    Jump to
                    {m.refs.map((t) => (
                      <button key={t} type="button" onClick={() => onSeek(t)} className="rounded bg-surface-muted px-1.5 py-0.5 font-mono tabular-nums text-brand hover:bg-brand hover:text-on-brand">
                        {formatTime(t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking
          </p>
        )}
        <div ref={endRef} />
      </div>
      {error && (
        <p role="alert" className="anim-alert mt-3 text-sm text-record">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
        className="mt-4 flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="Ask about this video" aria-label="Message" className="field" />
        <button type="submit" disabled={busy || !q.trim()} className="btn btn-primary">
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
      {messages.length > 0 && (
        <button type="button" onClick={() => setMessages([])} className="mt-2 self-start text-xs text-muted hover:text-foreground">
          Clear chat
        </button>
      )}
    </div>
  );
}
