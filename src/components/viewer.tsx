"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Eye, ExternalLink, Link2, Loader2, MessageSquare, Send, Sparkles, Trash2 } from "lucide-react";
import AiDocs, { type AiOutputs } from "@/components/ai-docs";
import InsightsPanel, { type ViewRow } from "@/components/insights-panel";
import AskVideo from "@/components/ask-video";
import SharePanel from "@/components/share-panel";
import { track } from "@vercel/analytics";
import { createClient } from "@/lib/supabase/client";
import { formatTime, timeAgo } from "@/lib/format";

export interface Comment {
  id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  timestamp_seconds: number;
  created_at: string;
  parent_id: string | null;
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
export type { AiOutputs, ViewRow };
export interface ViewerVideo {
  id: string;
  title: string;
  url: string;
  downloadUrl: string | null;
  visibility: "link" | "private";
  cta_label: string | null;
  cta_url: string | null;
  allow_download: boolean;
  ai_outputs: AiOutputs;
  description: string | null;
  expires_at: string | null;
  require_signin: boolean;
  duration_seconds: number;
  view_count: number;
  created_at: string;
  summary: string | null;
  transcript: string | null;
  chapters: Chapter[];
  ai_status: "none" | "processing" | "done" | "failed";
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀"];
type Tab = "summary" | "chapters" | "transcript" | "ask" | "docs" | "insights" | "share";

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
  unlockToken,
  hasPassword,
  views: viewRows,
  shareEmails,
}: {
  video: ViewerVideo;
  initialComments: Comment[];
  initialReactions: Reaction[];
  userId: string | null;
  userName: string | null;
  isOwner: boolean;
  unlockToken: string | null;
  hasPassword: boolean;
  views: ViewRow[];
  shareEmails: string[];
}) {
  const supabase = useMemo(() => createClient(unlockToken ?? undefined), [unlockToken]);
  const [ended, setEnded] = useState(false);
  const sessionId = useRef<string>("");
  const watchedSet = useRef<Set<number>>(new Set());
  const lastSent = useRef(0);
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
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [speed, setSpeed] = useState(1);
  const [captions, setCaptions] = useState(false);
  const [search, setSearch] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  async function transcribeNow() {
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const r = await fetch(`/api/videos/${video.id}/transcribe`, { method: "POST" });
      const j = (await r.json()) as { transcript?: string; error?: string };
      if (!r.ok || !j.transcript) throw new Error(j.error ?? "Transcription failed");
      setVideo((v) => ({ ...v, ai_status: "processing" }));
      await fetch(`/api/videos/${video.id}/ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: j.transcript }),
      });
      const { data } = await supabase.from("videos").select("summary, transcript, chapters, ai_status").eq("id", video.id).single();
      if (data) setVideo((v) => ({ ...v, ...(data as Partial<ViewerVideo>) }));
    } catch (e) {
      setTranscribeError(e instanceof Error ? e.message : "Transcription failed");
      setVideo((v) => ({ ...v, ai_status: "none" }));
    } finally {
      setTranscribing(false);
    }
  }

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

  // Pick up comments from other viewers without a reload.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const { data } = await supabase
        .from("comments")
        .select("id, author_id, author_name, body, timestamp_seconds, created_at, parent_id")
        .eq("video_id", initialVideo.id)
        .order("timestamp_seconds", { ascending: true });
      if (data) setComments(data as Comment[]);
    }, 8000);
    return () => clearInterval(t);
  }, [supabase, initialVideo.id]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = videoRef.current;
      const target = e.target as HTMLElement | null;
      if (!el || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "k" || (k === " " && target?.tagName !== "BUTTON" && target?.tagName !== "VIDEO")) {
        e.preventDefault();
        if (el.paused) el.play().catch(() => {});
        else el.pause();
      } else if (k === "j") el.currentTime = Math.max(0, el.currentTime - 10);
      else if (k === "l") el.currentTime = el.currentTime + 10;
      else if (k === "m") el.muted = !el.muted;
      else if (k === "c") setCaptions((c) => !c);
      else if (k === "f") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else el.requestFullscreen?.().catch(() => {});
      } else if (k === ">" || (k === "." && e.shiftKey)) setSpeed((s) => Math.min(2, SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)] ?? s));
      else if (k === "<" || (k === "," && e.shiftKey)) setSpeed((s) => SPEEDS[Math.max(0, SPEEDS.indexOf(s) - 1)] ?? s);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sendProgress = useCallback(() => {
    if (isOwner) return;
    const n = watchedSet.current.size;
    if (n === 0 || n === lastSent.current) return;
    lastSent.current = n;
    if (!sessionId.current) sessionId.current = crypto.randomUUID();
    supabase
      .rpc("record_progress", { vid: initialVideo.id, sid: sessionId.current, watched: n, vname: userName ?? (name.trim() || null) })
      .then(() => {});
  }, [isOwner, supabase, initialVideo.id, userName, name]);

  useEffect(() => {
    const t = setInterval(sendProgress, 5000);
    const onHide = () => sendProgress();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [sendProgress]);

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
    track("video_played", { owner: isOwner });
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
        timestamp_seconds: replyTo ? replyTo.timestamp_seconds : (stamp ?? videoRef.current?.currentTime ?? 0),
        parent_id: replyTo?.id ?? null,
      })
      .select("id, author_id, author_name, body, timestamp_seconds, created_at, parent_id")
      .single();
    setPosting(false);
    if (error || !data) return;
    if (!userName) {
      try {
        localStorage.setItem("walkthru:name", authorName);
      } catch {}
    }
    if (!isOwner) {
      fetch("/api/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentId: (data as Comment).id }),
      }).catch(() => {});
    }
    setComments((c) => [...c, data as Comment].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
    setBody("");
    setStamp(null);
    setReplyTo(null);
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

  const captionLine = useMemo(() => {
    let cur: { t: number | null; text: string } | null = null;
    for (const l of transcriptLines) if (l.t !== null && l.t <= now) cur = l;
    return cur && now - (cur.t ?? 0) < 8 ? cur.text : null;
  }, [transcriptLines, now]);
  const visibleTranscript = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? transcriptLines.filter((l) => l.text.toLowerCase().includes(q)) : transcriptLines;
  }, [transcriptLines, search]);
  const topLevel = useMemo(() => comments.filter((c) => !c.parent_id), [comments]);
  const repliesOf = useMemo(() => {
    const m = new Map<string, Comment[]>();
    comments.forEach((c) => {
      if (c.parent_id) m.set(c.parent_id, [...(m.get(c.parent_id) ?? []), c]);
    });
    return m;
  }, [comments]);

  const safeDuration = duration > 0 ? duration : 1;
  const hasAi = !!video.summary || video.chapters.length > 0 || transcriptLines.length > 0;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
      <section className="min-w-0">
        <div className="relative overflow-hidden rounded-card bg-black shadow-panel">
          <video
            ref={videoRef}
            src={video.url}
            controls
            playsInline
            preload="metadata"
            onPlay={onPlay}
            onPlaying={() => setEnded(false)}
            onPause={sendProgress}
            onEnded={() => {
              setEnded(true);
              sendProgress();
            }}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setNow(t);
              if (!e.currentTarget.paused) watchedSet.current.add(Math.floor(t));
            }}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
            className="aspect-video w-full"
          />
          {captions && captionLine && (
            <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-4">
              <p className="max-w-[90%] rounded bg-black/75 px-3 py-1.5 text-center text-sm text-white">{captionLine}</p>
            </div>
          )}
          {ended && video.cta_url && video.cta_label && (
            <div className="anim-fade absolute inset-x-0 top-0 grid place-items-center bg-black/60" style={{ bottom: "3.5rem" }}>
              <a href={video.cta_url} target="_blank" rel="noopener noreferrer" className="btn btn-lg btn-primary">
                {video.cta_label} <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          )}
        </div>

        {/* Comment markers on the timeline */}
        <div className="relative mt-3 h-5" aria-label="Comment markers">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-muted" />
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
            style={{ width: `${Math.min(100, (now / safeDuration) * 100)}%` }}
          />
          {topLevel.map((c) => (
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
            {video.description && <p className="mt-1 max-w-prose text-sm text-muted">{video.description}</p>}
            <div className="mt-1.5 flex items-center gap-3 text-sm text-muted">
              <span>{timeAgo(video.created_at)}</span>
              <span className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" aria-hidden /> {views} view{views === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {video.cta_url && video.cta_label && /^https?:\/\//i.test(video.cta_url) && (
              <a href={video.cta_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                {video.cta_label} <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            )}
            {video.downloadUrl && (
              <a href={video.downloadUrl} className="btn btn-secondary">
                <Download className="h-4 w-4" aria-hidden /> Download
              </a>
            )}
            <button type="button" onClick={copyLink} className="btn btn-secondary">
              {copied ? <Check className="anim-pop h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Playback">
          <label className="flex items-center gap-2 text-sm text-muted">
            Speed
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-pressed={captions}
            disabled={transcriptLines.length === 0}
            onClick={() => setCaptions((c) => !c)}
            className={`h-8 rounded-lg border px-3 text-sm disabled:opacity-50 ${captions ? "border-brand bg-brand-soft text-brand" : "border-border-strong bg-surface text-muted"}`}
          >
            Captions
          </button>
          <span className="hidden text-xs text-subtle md:inline">K play, J/L skip 10s, M mute, C captions, F fullscreen</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Reactions">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-sm transition-[background-color,transform] hover:bg-surface-muted active:scale-95"
            >
              <span className="text-base leading-none">{emoji}</span>
              {(reactionCounts.get(emoji) ?? 0) > 0 && (
                <span key={reactionCounts.get(emoji)} className="anim-tick text-xs font-medium tabular-nums text-muted">
                  {reactionCounts.get(emoji)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* AI panel */}
        <div className="panel mt-8">
          <div role="tablist" aria-label="AI notes" className="flex flex-wrap items-center gap-1 border-b border-border px-3 pt-2">
            <span className="mr-2 flex items-center gap-1.5 px-1 pb-2.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-brand" aria-hidden /> AI notes
            </span>
            {((isOwner ? ["summary", "chapters", "transcript", "ask", "docs", "insights", "share"] : ["summary", "chapters", "transcript", "ask", "docs"]) as Tab[]).map((t) => (
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
                {t === "docs" ? "Documents" : t === "ask" ? "Ask" : t}
              </button>
            ))}
          </div>
          <div key={tab} className="anim-fade p-5 text-sm">
            {tab === "ask" ? (
              <AskVideo videoId={video.id} hasTranscript={!!video.transcript} signedIn={userId !== null} onSeek={seek} />
            ) : tab === "docs" ? (
              <AiDocs
                videoId={video.id}
                title={video.title}
                hasTranscript={!!video.transcript}
                isOwner={isOwner}
                initial={video.ai_outputs}
              />
            ) : tab === "insights" ? (
              <InsightsPanel views={viewRows} duration={duration} totalViews={views} />
            ) : tab === "share" ? (
              <SharePanel
                videoId={video.id}
                visibility={video.visibility}
                hasPassword={hasPassword}
                allowDownload={video.allow_download}
                ctaLabel={video.cta_label}
                ctaUrl={video.cta_url}
                expiresAt={video.expires_at}
                requireSignin={video.require_signin}
                emails={shareEmails}
                description={video.description}
              />
            ) : video.ai_status === "processing" ? (
              <p className="flex items-center gap-2 text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating summary and chapters
              </p>
            ) : !hasAi ? (
              <p className="max-w-prose leading-relaxed text-muted">
                This recording has no transcript. Transcripts are captured live while recording in Chrome or Edge with
                the microphone on.
                {isOwner && (
                  <>
                    {" "}
                    <button type="button" onClick={transcribeNow} disabled={transcribing} className="font-medium text-brand underline disabled:opacity-60">
                      {transcribing ? "Transcribing" : "Transcribe it now"}
                    </button>
                    {transcribeError && <span className="ml-2 text-record">{transcribeError}</span>}
                  </>
                )}
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
              <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the transcript"
                aria-label="Search the transcript"
                className="field mb-3 max-w-sm"
              />
              {visibleTranscript.length === 0 && <p className="text-muted">No matches.</p>}
              <ul className="-mx-2 max-h-72 space-y-0.5 overflow-y-auto">
                {visibleTranscript.map((l, i) => (
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
              </>
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
            {topLevel.length === 0 && (
              <li className="px-4 py-10 text-center text-sm leading-relaxed text-muted">
                No comments yet. Pause the video and leave feedback at the exact moment.
              </li>
            )}
            {topLevel.map((c, i) => {
              const next = topLevel[i + 1]?.timestamp_seconds ?? Infinity;
              const active = now >= c.timestamp_seconds && now < Math.min(next, c.timestamp_seconds + 8);
              const replies = repliesOf.get(c.id) ?? [];
              const row = (x: Comment, isReply: boolean) => {
                const canDelete = isOwner || (userId !== null && x.author_id === userId);
                return (
                  <div className={isReply ? "ml-4 border-l-2 border-border pl-3" : ""}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{x.author_name}</span>
                        {!isReply && (
                          <button
                            type="button"
                            onClick={() => seek(x.timestamp_seconds)}
                            className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-brand hover:bg-brand hover:text-on-brand"
                          >
                            {formatTime(x.timestamp_seconds)}
                          </button>
                        )}
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => deleteComment(x.id)}
                          aria-label="Delete comment"
                          className="rounded p-1 text-subtle hover:bg-record-soft hover:text-record"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed">{x.body}</p>
                  </div>
                );
              };
              return (
                <li key={c.id} className={`anim-fade px-4 py-3 transition-colors ${active ? "bg-brand-soft" : ""}`}>
                  {row(c, false)}
                  {replies.map((r) => (
                    <div key={r.id} className="mt-2">
                      {row(r, true)}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setReplyTo(c)}
                    className="mt-1.5 text-xs text-muted hover:text-foreground"
                  >
                    Reply
                  </button>
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
            {replyTo && (
              <p className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5 text-xs text-muted">
                Replying to {replyTo.author_name}
                <button type="button" onClick={() => setReplyTo(null)} className="text-foreground underline">
                  Cancel
                </button>
              </p>
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
              placeholder={replyTo ? "Write a reply" : "Comment at this moment"}
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
