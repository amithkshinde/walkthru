"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, Link2, Loader2, MessageSquare, Send, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTime, timeAgo } from "@/lib/format";

export interface Comment {
  id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  timestamp_seconds: number;
  created_at: string;
}
export interface Reaction {
  id: string;
  emoji: string;
  timestamp_seconds: number;
}
export interface Chapter {
  start: number;
  title: string;
}
export interface ViewerVideo {
  id: string;
  title: string;
  url: string;
  duration_seconds: number;
  view_count: number;
  created_at: string;
  summary: string | null;
  transcript: string | null;
  chapters: Chapter[];
  ai_status: "none" | "processing" | "done" | "failed";
}

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀"];
type Tab = "summary" | "chapters" | "transcript";

function parseStamp(s: string): number {
  return s.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

export default function Viewer({
  video: initialVideo,
  initialComments,
  initialReactions,
  userId,
  userName,
  isOwner,
}: {
  video: ViewerVideo;
  initialComments: Comment[];
  initialReactions: Reaction[];
  userId: string | null;
  userName: string | null;
  isOwner: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [video, setVideo] = useState(initialVideo);
  const [comments, setComments] = useState(initialComments);
  const [reactions, setReactions] = useState(initialReactions);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(initialVideo.duration_seconds);
  const [body, setBody] = useState("");
  const [name, setName] = useState(userName ?? "");
  const [stamp, setStamp] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  const [views, setViews] = useState(initialVideo.view_count);
  const counted = useRef(false);

  useEffect(() => {
    if (!userName) {
      try {
        const saved = localStorage.getItem("walkthru:name");
        if (saved) setName(saved);
      } catch {}
    }
  }, [userName]);

  // Poll for AI results while they're being generated.
  useEffect(() => {
    if (video.ai_status !== "processing") return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("videos")
        .select("summary, transcript, chapters, ai_status")
        .eq("id", video.id)
        .single();
      if (data) {
        setVideo((v) => ({ ...v, ...(data as Partial<ViewerVideo>) }));
      }
    }, 4000);
    return () => clearInterval(t);
  }, [video.ai_status, video.id, supabase]);

  const seek = useCallback((t: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = t;
    el.play().catch(() => {});
  }, []);

  function onPlay() {
    if (counted.current) return;
    counted.current = true;
    try {
      const key = `walkthru:viewed:${video.id}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    supabase.rpc("increment_view", { p_video_id: video.id }).then(({ error }) => {
      if (!error) setViews((v) => v + 1);
    });
  }

  function captureStamp() {
    if (stamp === null) setStamp(videoRef.current?.currentTime ?? 0);
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    const authorName = (userName ?? name).trim() || "Guest";
    const { data, error } = await supabase
      .from("comments")
      .insert({
        video_id: video.id,
        author_id: userId,
        author_name: authorName,
        body: text,
        timestamp_seconds: stamp ?? videoRef.current?.currentTime ?? 0,
      })
      .select("id, author_id, author_name, body, timestamp_seconds, created_at")
      .single();
    setPosting(false);
    if (error || !data) return;
    if (!userName) {
      try {
        localStorage.setItem("walkthru:name", authorName);
      } catch {}
    }
    setComments((c) => [...c, data as Comment].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
    setBody("");
    setStamp(null);
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (!error) setComments((c) => c.filter((x) => x.id !== id));
  }

  async function react(emoji: string) {
    const t = videoRef.current?.currentTime ?? 0;
    const tempId = `tmp-${Date.now()}`;
    setReactions((r) => [...r, { id: tempId, emoji, timestamp_seconds: t }]);
    const { data, error } = await supabase
      .from("reactions")
      .insert({ video_id: video.id, emoji, timestamp_seconds: t })
      .select("id")
      .single();
    if (error) setReactions((r) => r.filter((x) => x.id !== tempId));
    else if (data) setReactions((r) => r.map((x) => (x.id === tempId ? { ...x, id: data.id } : x)));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  const reactionCounts = useMemo(() => {
    const m = new Map<string, number>();
    reactions.forEach((r) => m.set(r.emoji, (m.get(r.emoji) ?? 0) + 1));
    return m;
  }, [reactions]);

  const transcriptLines = useMemo(() => {
    if (!video.transcript) return [];
    return video.transcript
      .split("\n")
      .map((line) => {
        const m = line.match(/^\[(\d+(?::\d+)*)\]\s*(.*)$/);
        return m ? { t: parseStamp(m[1]), text: m[2] } : { t: null as number | null, text: line };
      })
      .filter((l) => l.text.trim());
  }, [video.transcript]);

  const safeDuration = duration > 0 ? duration : 1;
  const hasAi = !!video.summary || video.chapters.length > 0 || transcriptLines.length > 0;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
      <section className="min-w-0">
        <div className="overflow-hidden rounded-card bg-black shadow-panel">
          <video
            ref={videoRef}
            src={video.url}
            controls
            playsInline
            preload="metadata"
            onPlay={onPlay}
            onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
            className="aspect-video w-full"
          />
        </div>

        {/* Comment markers on the timeline */}
        <div className="relative mt-3 h-5" aria-label="Comment markers">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-muted" />
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
            style={{ width: `${Math.min(100, (now / safeDuration) * 100)}%` }}
          />
          {comments.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => seek(c.timestamp_seconds)}
              title={`${c.author_name} at ${formatTime(c.timestamp_seconds)}`}
              aria-label={`Jump to comment by ${c.author_name} at ${formatTime(c.timestamp_seconds)}`}
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-record transition-transform hover:scale-125"
              style={{ left: `${Math.min(100, (c.timestamp_seconds / safeDuration) * 100)}%` }}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{video.title}</h1>
            <div className="mt-1.5 flex items-center gap-3 text-sm text-muted">
              <span>{timeAgo(video.created_at)}</span>
              <span className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" aria-hidden /> {views} view{views === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <button type="button" onClick={copyLink} className="btn btn-secondary">
            {copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Reactions">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-sm transition-[background-color,transform] hover:bg-surface-muted active:scale-95"
            >
              <span className="text-base leading-none">{emoji}</span>
              {(reactionCounts.get(emoji) ?? 0) > 0 && (
                <span className="text-xs font-medium tabular-nums text-muted">{reactionCounts.get(emoji)}</span>
              )}
            </button>
          ))}
        </div>

        {/* AI panel */}
        <div className="panel mt-8">
          <div role="tablist" aria-label="AI notes" className="flex items-center gap-1 border-b border-border px-3 pt-2">
            <span className="mr-2 flex items-center gap-1.5 px-1 pb-2.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-brand" aria-hidden /> AI notes
            </span>
            {(["summary", "chapters", "transcript"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 pb-2.5 text-sm capitalize transition-colors ${
                  tab === t
                    ? "border-brand font-medium text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="p-5 text-sm">
            {video.ai_status === "processing" ? (
              <p className="flex items-center gap-2 text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating summary and chapters
              </p>
            ) : !hasAi ? (
              <p className="max-w-prose leading-relaxed text-muted">
                This recording has no transcript. Transcripts are captured live while recording in Chrome or Edge with
                the microphone on.
              </p>
            ) : tab === "summary" ? (
              video.summary ? (
                <p className="max-w-prose whitespace-pre-line text-[15px] leading-relaxed">{video.summary}</p>
              ) : (
                <p className="text-muted">No summary yet.</p>
              )
            ) : tab === "chapters" ? (
              video.chapters.length > 0 ? (
                <ul className="-mx-2 space-y-0.5">
                  {video.chapters.map((c, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => seek(c.start)}
                        className="flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-muted"
                      >
                        <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-brand">{formatTime(c.start)}</span>
                        <span>{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No chapters yet.</p>
              )
            ) : transcriptLines.length > 0 ? (
              <ul className="-mx-2 max-h-72 space-y-0.5 overflow-y-auto">
                {transcriptLines.map((l, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={l.t === null}
                      onClick={() => l.t !== null && seek(l.t)}
                      className="flex w-full items-baseline gap-3 rounded-lg px-2 py-1 text-left hover:bg-surface-muted"
                    >
                      {l.t !== null && (
                        <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-brand">{formatTime(l.t)}</span>
                      )}
                      <span>{l.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No transcript available.</p>
            )}
          </div>
        </div>
      </section>

      {/* Comments */}
      <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <div className="panel overflow-hidden shadow-panel">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
            <MessageSquare className="h-4 w-4" aria-hidden /> Comments
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
              {comments.length}
            </span>
          </div>

          <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto">
            {comments.length === 0 && (
              <li className="px-4 py-10 text-center text-sm leading-relaxed text-muted">
                No comments yet. Pause the video and leave feedback at the exact moment.
              </li>
            )}
            {comments.map((c, i) => {
              const next = comments[i + 1]?.timestamp_seconds ?? Infinity;
              const active = now >= c.timestamp_seconds && now < Math.min(next, c.timestamp_seconds + 8);
              const canDelete = isOwner || (userId !== null && c.author_id === userId);
              return (
                <li key={c.id} className={`px-4 py-3 transition-colors ${active ? "bg-brand-soft" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.author_name}</span>
                      <button
                        type="button"
                        onClick={() => seek(c.timestamp_seconds)}
                        className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-brand hover:bg-brand hover:text-on-brand"
                      >
                        {formatTime(c.timestamp_seconds)}
                      </button>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        aria-label="Delete comment"
                        className="rounded p-1 text-subtle hover:bg-record-soft hover:text-record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed">{c.body}</p>
                </li>
              );
            })}
          </ul>

          <form onSubmit={postComment} className="space-y-2.5 border-t border-border bg-surface-muted/40 p-4">
            {!userName && (
              <>
                <label htmlFor="c-name" className="sr-only">
                  Your name
                </label>
                <input
                  id="c-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="Your name"
                  className="field"
                />
              </>
            )}
            <label htmlFor="c-body" className="sr-only">
              Comment
            </label>
            <textarea
              id="c-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={captureStamp}
              maxLength={2000}
              rows={3}
              placeholder="Comment at this moment"
              className="field resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs tabular-nums text-muted">at {formatTime(stamp ?? now)}</span>
              <button type="submit" disabled={posting || !body.trim()} className="btn btn-primary btn-sm">
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post
              </button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
