"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import fixWebmDuration from "fix-webm-duration";
import {
  Camera,
  Link2,
  Loader2,
  Mic,
  MicOff,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Square,
  Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";

type Mode = "screen-cam" | "screen" | "cam";
type Phase = "idle" | "starting" | "countdown" | "recording" | "paused" | "review" | "saving";

interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const MODES: { id: Mode; label: string; hint: string; icon: typeof Monitor }[] = [
  { id: "screen-cam", label: "Screen + Camera", hint: "Your screen with a camera bubble", icon: Video },
  { id: "screen", label: "Screen only", hint: "Just your screen", icon: Monitor },
  { id: "cam", label: "Camera only", hint: "Talk straight to camera", icon: Camera },
];

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

async function makeThumbnail(blob: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("thumb"));
    });
    const target = Number.isFinite(v.duration) && v.duration > 2 ? Math.min(1.5, v.duration / 4) : 0;
    v.currentTime = target;
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      setTimeout(res, 1500);
    });
    if (!v.videoWidth) return null;
    const w = 640;
    const h = Math.round((w * v.videoHeight) / v.videoWidth);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(v, 0, 0, w, h);
    return await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/jpeg", 0.8));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Recorder() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("screen-cam");
  const [micOn, setMicOn] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resultRef = useRef<{ blob: Blob; durationMs: number; mime: string } | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerUrlRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const segmentsRef = useRef<{ t: number; text: string }[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef(0);
  const bubbleRef = useRef<{ corner: "bl" | "br" | "tl" | "tr"; size: number }>({ corner: "bl", size: 0.13 });
  const [bubble, setBubble] = useState<{ corner: "bl" | "br" | "tl" | "tr"; size: number }>({ corner: "bl", size: 0.13 });
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const originalRef = useRef<{ blob: Blob; durationMs: number; mime: string; segments: { t: number; text: string }[] } | null>(null);
  const [trimOpen, setTrimOpen] = useState(false);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 0]);
  const [trimming, setTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [trimmed, setTrimmed] = useState(false);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const currentElapsedMs = useCallback(() => {
    const running = phaseRef.current === "recording" ? Date.now() - segmentStartRef.current : 0;
    return accumulatedRef.current + running;
  }, []);

  const teardown = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    workerRef.current?.postMessage("stop");
    workerRef.current?.terminate();
    workerRef.current = null;
    if (workerUrlRef.current) URL.revokeObjectURL(workerUrlRef.current);
    workerUrlRef.current = null;
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      teardown();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {}
      }
    };
  }, [teardown]);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  function startSpeech() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) segmentsRef.current.push({ t: currentElapsedMs() / 1000, text });
        }
      }
    };
    rec.onend = () => {
      // Chrome stops recognition after silence; keep it going while recording.
      if (recognitionRef.current === rec && phaseRef.current === "recording") {
        try {
          rec.start();
        } catch {}
      }
    };
    rec.onerror = () => {};
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {}
  }

  async function begin() {
    setError(null);
    setPhaseBoth("starting");
    chunksRef.current = [];
    segmentsRef.current = [];
    accumulatedRef.current = 0;
    setElapsed(0);

    try {
      let screen: MediaStream | null = null;
      let cam: MediaStream | null = null;
      let mic: MediaStream | null = null;

      if (mode !== "cam") {
        screen = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true,
        });
        streamsRef.current.push(screen);
      }
      if (mode !== "screen") {
        cam = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        });
        streamsRef.current.push(cam);
      }
      if (micOn) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          streamsRef.current.push(mic);
        } catch {
          setMicOn(false);
        }
      }

      // Mix audio sources (system audio from the shared tab + microphone).
      const audioSources = [screen, mic].filter(
        (s): s is MediaStream => !!s && s.getAudioTracks().length > 0,
      );
      let audioTracks: MediaStreamTrack[] = [];
      if (audioSources.length > 0) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        audioSources.forEach((s) => {
          ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest);
        });
        audioTracks = dest.stream.getAudioTracks();
      }

      // Video: screen directly, camera directly, or both composited on a canvas.
      let videoTracks: MediaStreamTrack[] = [];
      if (mode === "screen" && screen) {
        videoTracks = screen.getVideoTracks();
      } else if (mode === "cam" && cam) {
        videoTracks = cam.getVideoTracks();
      } else if (screen && cam) {
        const settings = screen.getVideoTracks()[0].getSettings();
        const srcW = settings.width || 1280;
        const srcH = settings.height || 720;
        const scale = Math.min(1, 1920 / srcW);
        const W = Math.round(srcW * scale);
        const H = Math.round(srcH * scale);

        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx2d = canvas.getContext("2d")!;

        const screenVideo = document.createElement("video");
        screenVideo.muted = true;
        screenVideo.playsInline = true;
        screenVideo.srcObject = new MediaStream(screen.getVideoTracks());
        const camVideo = document.createElement("video");
        camVideo.muted = true;
        camVideo.playsInline = true;
        camVideo.srcObject = new MediaStream(cam.getVideoTracks());
        await Promise.all([screenVideo.play(), camVideo.play()]);

        const draw = () => {
          ctx2d.drawImage(screenVideo, 0, 0, W, H);
          if (camVideo.videoWidth) {
            const { corner, size } = bubbleRef.current;
            const r = Math.round(H * size);
            const pad = Math.round(H * 0.035);
            const cx = corner.endsWith("l") ? r + pad : W - r - pad;
            const cy = corner.startsWith("t") ? r + pad : H - r - pad;
            ctx2d.save();
            ctx2d.beginPath();
            ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
            ctx2d.closePath();
            ctx2d.clip();
            const s = Math.max((2 * r) / camVideo.videoWidth, (2 * r) / camVideo.videoHeight);
            const dw = camVideo.videoWidth * s;
            const dh = camVideo.videoHeight * s;
            ctx2d.drawImage(camVideo, cx - dw / 2, cy - dh / 2, dw, dh);
            ctx2d.restore();
            ctx2d.lineWidth = Math.max(3, Math.round(H * 0.005));
            ctx2d.strokeStyle = "#ffffff";
            ctx2d.beginPath();
            ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
            ctx2d.stroke();
          }
        };

        // A worker-driven ticker keeps drawing when the tab is in the background
        // (main-thread timers and rAF get throttled once you switch windows).
        const workerSrc = `let id; onmessage = (e) => { if (e.data === 'start') { id = setInterval(() => postMessage(0), ${Math.round(
          1000 / 30,
        )}); } else { clearInterval(id); } };`;
        const url = URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" }));
        workerUrlRef.current = url;
        const worker = new Worker(url);
        worker.onmessage = draw;
        workerRef.current = worker;
        draw();
        worker.postMessage("start");

        videoTracks = canvas.captureStream(30).getVideoTracks();
      }

      if (videoTracks.length === 0) throw new Error("No video source available.");

      // Stop automatically if the user ends sharing from the browser UI.
      if (screen) {
        screen.getVideoTracks()[0].addEventListener("ended", () => {
          if (phaseRef.current === "recording" || phaseRef.current === "paused") stop();
        });
      }

      const mime = pickMime();
      const recorder = new MediaRecorder(new MediaStream([...videoTracks, ...audioTracks]), {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 2_500_000,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => finalize(recorder.mimeType || mime || "video/webm");
      recorderRef.current = recorder;

      // 3-2-1 countdown, then go.
      setPhaseBoth("countdown");
      for (let n = 3; n >= 1; n--) {
        setCount(n);
        await new Promise((r) => setTimeout(r, 1000));
        if (phaseRef.current !== "countdown") return;
      }

      recorder.start(1000);
      segmentStartRef.current = Date.now();
      setPhaseBoth("recording");
      tickRef.current = setInterval(() => setElapsed(currentElapsedMs()), 250);
      if (mic) startSpeech();
    } catch (err) {
      teardown();
      setPhaseBoth("idle");
      const name = (err as { name?: string }).name;
      setError(
        name === "NotAllowedError"
          ? "Permission was denied. Allow screen, camera and microphone access and try again."
          : name === "NotFoundError"
            ? "No camera or microphone was found on this device."
            : (err as Error).message || "Couldn't start recording.",
      );
    }
  }

  function pause() {
    if (phaseRef.current !== "recording") return;
    accumulatedRef.current += Date.now() - segmentStartRef.current;
    recorderRef.current?.pause();
    setPhaseBoth("paused");
    setElapsed(accumulatedRef.current);
  }

  function resume() {
    if (phaseRef.current !== "paused") return;
    segmentStartRef.current = Date.now();
    recorderRef.current?.resume();
    setPhaseBoth("recording");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {}
    }
  }

  function stop() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    accumulatedRef.current = currentElapsedMs();
    // Freeze the clock before stopping tracks.
    phaseRef.current = "review";
    rec.stop();
  }

  async function finalize(mime: string) {
    const durationMs = accumulatedRef.current;
    teardown();
    let blob = new Blob(chunksRef.current, { type: mime });
    if (mime.includes("webm")) {
      try {
        blob = await fixWebmDuration(blob, durationMs, { logger: false });
      } catch {}
    }
    resultRef.current = { blob, durationMs, mime };
    originalRef.current = { blob, durationMs, mime, segments: [...segmentsRef.current] };
    setTrimmed(false);
    setTrimOpen(false);
    setTrimRange([0, durationMs / 1000]);
    const url = URL.createObjectURL(blob);
    setResultUrl(url);
    setElapsed(durationMs);
    setTitle(
      `Recording ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${new Date().toLocaleTimeString(
        undefined,
        { hour: "numeric", minute: "2-digit" },
      )}`,
    );
    setPhaseBoth("review");
  }

  async function applyTrim() {
    const orig = originalRef.current;
    if (!orig || trimming) return;
    const [start, end] = trimRange;
    if (end - start < 1) {
      setError("Keep at least one second.");
      return;
    }
    setError(null);
    setTrimming(true);
    setTrimProgress(0);
    try {
      const v = document.createElement("video");
      v.src = URL.createObjectURL(orig.blob);
      v.playsInline = true;
      await new Promise<void>((res, rej) => {
        v.onloadedmetadata = () => res();
        v.onerror = () => rej(new Error("load"));
      });
      v.currentTime = start;
      await new Promise<void>((res) => {
        v.onseeked = () => res();
      });
      const cap = (v as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream });
      const stream = (cap.captureStream ?? cap.mozCaptureStream)?.call(v);
      if (!stream) throw new Error("unsupported");
      const mime = orig.mime;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      const done = new Promise<void>((res) => {
        rec.onstop = () => res();
      });
      rec.start(1000);
      await v.play();
      await new Promise<void>((res) => {
        const tick = setInterval(() => {
          setTrimProgress(Math.min(1, (v.currentTime - start) / (end - start)));
          if (v.currentTime >= end || v.ended) {
            clearInterval(tick);
            res();
          }
        }, 100);
      });
      v.pause();
      rec.stop();
      await done;
      URL.revokeObjectURL(v.src);
      const durationMs = Math.round((end - start) * 1000);
      let blob = new Blob(chunks, { type: mime });
      if (mime.includes("webm")) {
        try {
          blob = await fixWebmDuration(blob, durationMs, { logger: false });
        } catch {}
      }
      resultRef.current = { blob, durationMs, mime };
      segmentsRef.current = orig.segments
        .filter((sg) => sg.t >= start && sg.t <= end)
        .map((sg) => ({ t: sg.t - start, text: sg.text }));
      setResultUrl(URL.createObjectURL(blob));
      setElapsed(durationMs);
      setTrimmed(true);
      setTrimOpen(false);
    } catch {
      setError("Trimming isn't supported in this browser. You can still save the full recording.");
    } finally {
      setTrimming(false);
    }
  }

  function resetTrim() {
    const orig = originalRef.current;
    if (!orig) return;
    resultRef.current = { blob: orig.blob, durationMs: orig.durationMs, mime: orig.mime };
    segmentsRef.current = [...orig.segments];
    setResultUrl(URL.createObjectURL(orig.blob));
    setElapsed(orig.durationMs);
    setTrimRange([0, orig.durationMs / 1000]);
    setTrimmed(false);
  }

  function discard() {
    originalRef.current = null;
    setTrimmed(false);
    setTrimOpen(false);
    teardown();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      try {
        recorderRef.current.stop();
      } catch {}
    }
    recorderRef.current = null;
    chunksRef.current = [];
    resultRef.current = null;
    segmentsRef.current = [];
    setResultUrl(null);
    setElapsed(0);
    setPhaseBoth("idle");
  }

  async function save() {
    const result = resultRef.current;
    if (!result) return;
    setPhaseBoth("saving");
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?next=/record");
        return;
      }

      const id = crypto.randomUUID();
      const ext = result.mime.includes("mp4") ? "mp4" : "webm";
      const path = `${user.id}/${id}.${ext}`;
      const duration = Math.max(1, Math.round(result.durationMs / 1000));

      const { error: insertError } = await supabase.from("videos").insert({
        id,
        owner_id: user.id,
        title: title.trim() || "Untitled recording",
        storage_path: path,
        duration_seconds: duration,
        status: "uploading",
      });
      if (insertError) throw insertError;

      let uploadError: { message: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await supabase.storage
          .from("recordings")
          .upload(path, result.blob, { contentType: result.mime.split(";")[0], upsert: true });
        uploadError = res.error;
        if (!uploadError) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
      if (uploadError) {
        await supabase.from("videos").update({ status: "failed" }).eq("id", id);
        throw uploadError;
      }

      let thumbnailPath: string | null = null;
      try {
        const thumb = await makeThumbnail(result.blob);
        if (thumb) {
          const tPath = `${user.id}/${id}.jpg`;
          const { error: tErr } = await supabase.storage.from("recordings").upload(tPath, thumb, { contentType: "image/jpeg", upsert: true });
          if (!tErr) thumbnailPath = tPath;
        }
      } catch {}

      const { error: readyError } = await supabase
        .from("videos")
        .update({ status: "ready", thumbnail_path: thumbnailPath })
        .eq("id", id);
      if (readyError) throw readyError;

      // Kick off AI summary in the background using the live transcript.
      const transcript = segmentsRef.current
        .map((s) => `[${formatTime(s.t)}] ${s.text}`)
        .join("\n");
      if (transcript) {
        fetch(`/api/videos/${id}/ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
        }).catch(() => {});
      } else {
        // No live transcript (unsupported browser or mic off): try server transcription.
        fetch(`/api/videos/${id}/transcribe`, { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { transcript?: string } | null) =>
            j?.transcript
              ? fetch(`/api/videos/${id}/ai`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ transcript: j.transcript }),
                })
              : null,
          )
          .catch(() => {});
      }

      track("recording_saved", { trimmed });
      router.push(`/v/${id}`);
    } catch (err) {
      setPhaseBoth("review");
      setError((err as Error).message || "Upload failed. Please try again.");
    }
  }

  const active = phase === "recording" || phase === "paused";

  return (
    <div className="mx-auto w-full max-w-xl">
      {phase === "idle" || phase === "starting" ? (
        <div className="panel anim-rise p-6 shadow-panel sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">New recording</h1>
          <p className="mt-1.5 text-sm text-muted">Choose what to capture. You get a shareable link the moment you stop.</p>

          <div role="radiogroup" aria-label="What to capture" className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {MODES.map((m) => {
              const Icon = m.icon;
              const selected = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMode(m.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    selected
                      ? "border-brand bg-brand-soft ring-1 ring-brand"
                      : "border-border-strong bg-surface hover:bg-surface-muted"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${selected ? "text-brand" : "text-muted"}`} aria-hidden />
                  <div className="mt-3 text-sm font-medium">{m.label}</div>
                  <div className="mt-0.5 text-xs leading-snug text-muted">{m.hint}</div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={micOn}
            onClick={() => setMicOn((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm transition-colors hover:bg-surface-muted"
          >
            <span className="flex items-center gap-2.5">
              {micOn ? <Mic className="h-4 w-4 text-brand" aria-hidden /> : <MicOff className="h-4 w-4 text-muted" aria-hidden />}
              Microphone
            </span>
            <span
              aria-hidden
              className={`relative h-5 w-9 rounded-full transition-colors ${micOn ? "bg-brand" : "bg-border-strong"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${micOn ? "left-[1.1rem]" : "left-0.5"}`}
              />
            </span>
          </button>

          {error && (
            <p role="alert" className="anim-alert mt-4 rounded-lg bg-record-soft px-3 py-2 text-sm text-record">
              {error}
            </p>
          )}

          <button type="button" onClick={begin} disabled={phase === "starting"} className="btn btn-lg btn-record mt-6 w-full">
            {phase === "starting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Waiting for permissions
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-white" /> Start recording
              </>
            )}
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            Live speech is transcribed in Chrome and Edge, so summaries are generated automatically.
          </p>
        </div>
      ) : null}

      {phase === "countdown" ? (
        <div className="panel flex flex-col items-center justify-center py-24 shadow-panel" role="status" aria-live="polite">
          <div key={count} className="anim-tick text-8xl font-semibold tabular-nums tracking-tight text-brand">
            {count}
          </div>
          <p className="mt-4 text-sm text-muted">Recording starts in a moment</p>
        </div>
      ) : null}

      {active ? (
        <div className="panel anim-fade p-8 text-center shadow-panel sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-record-soft px-3 py-1 text-sm font-medium text-record">
            <span className={`h-2 w-2 rounded-full bg-record ${phase === "recording" ? "animate-pulse-record" : "opacity-50"}`} />
            {phase === "recording" ? "Recording" : "Paused"}
          </div>
          <div className="mt-5 font-mono text-6xl font-medium tabular-nums tracking-tight sm:text-7xl">
            {formatTime(elapsed / 1000)}
          </div>
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-muted">
            {mode === "cam"
              ? "Your camera is recording."
              : "Switch to the window you want to show. Recording continues in the background."}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {phase === "recording" ? (
              <button type="button" onClick={pause} className="btn btn-secondary">
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : (
              <button type="button" onClick={resume} className="btn btn-secondary">
                <Play className="h-4 w-4" /> Resume
              </button>
            )}
            {mode === "screen-cam" && (
              <div className="flex w-full items-center justify-center gap-3 text-xs text-muted" role="group" aria-label="Camera bubble">
                <span>Camera</span>
                {([["tl", "Top left"], ["tr", "Top right"], ["bl", "Bottom left"], ["br", "Bottom right"]] as const).map(([c, label]) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={label}
                    aria-pressed={bubble.corner === c}
                    onClick={() => {
                      const next = { ...bubbleRef.current, corner: c };
                      bubbleRef.current = next;
                      setBubble(next);
                    }}
                    className={`h-6 rounded border px-2 ${bubble.corner === c ? "border-brand bg-brand-soft text-brand" : "border-border-strong"}`}
                  >
                    {c.toUpperCase()}
                  </button>
                ))}
                {([["S", 0.09], ["M", 0.13], ["L", 0.18]] as const).map(([l, sz]) => (
                  <button
                    key={l}
                    type="button"
                    aria-label={`Size ${l}`}
                    aria-pressed={bubble.size === sz}
                    onClick={() => {
                      const next = { ...bubbleRef.current, size: sz };
                      bubbleRef.current = next;
                      setBubble(next);
                    }}
                    className={`h-6 w-6 rounded border ${bubble.size === sz ? "border-brand bg-brand-soft text-brand" : "border-border-strong"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={stop} className="btn btn-record">
              <Square className="h-3.5 w-3.5 fill-white" /> Stop and review
            </button>
            <button type="button" onClick={discard} className="btn btn-ghost">
              <RotateCcw className="h-4 w-4" /> Restart
            </button>
          </div>
        </div>
      ) : null}

      {phase === "review" || phase === "saving" ? (
        <div className="panel anim-rise p-5 shadow-panel sm:p-6">
          {resultUrl && (
            <video
              ref={previewRef}
              src={resultUrl}
              controls
              playsInline
              className="aspect-video w-full rounded-lg bg-black"
            />
          )}
          {originalRef.current && (
            <div className="mt-4">
              {!trimOpen ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setTrimOpen(true)} disabled={phase === "saving"} className="btn btn-secondary btn-sm">
                    <Scissors className="h-3.5 w-3.5" /> Trim
                  </button>
                  {trimmed && (
                    <>
                      <span className="text-xs text-muted">Trimmed to {formatTime(elapsed / 1000)}</span>
                      <button type="button" onClick={resetTrim} className="btn btn-ghost btn-sm">
                        Undo trim
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-background p-4 text-sm">
                  <div className="flex items-center justify-between font-mono text-xs tabular-nums text-muted">
                    <span>Start {formatTime(trimRange[0])}</span>
                    <span>End {formatTime(trimRange[1])}</span>
                  </div>
                  {(["Start", "End"] as const).map((lab, i) => {
                    const total = originalRef.current!.durationMs / 1000;
                    return (
                      <input
                        key={lab}
                        type="range"
                        aria-label={`${lab} of trimmed video`}
                        min={0}
                        max={total}
                        step={0.1}
                        value={trimRange[i]}
                        disabled={trimming}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTrimRange((r) => {
                            const next: [number, number] = [r[0], r[1]];
                            if (i === 0) next[0] = Math.min(val, r[1] - 1);
                            else next[1] = Math.max(val, r[0] + 1);
                            if (previewRef.current) previewRef.current.currentTime = next[i];
                            return next;
                          });
                        }}
                        className="mt-2 w-full accent-[var(--brand)]"
                      />
                    );
                  })}
                  <p className="mt-2 text-xs text-muted">Trimming plays the clip through once, so it takes as long as the kept part.</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={applyTrim} disabled={trimming} className="btn btn-primary btn-sm">
                      {trimming ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Trimming {Math.round(trimProgress * 100)}%
                        </>
                      ) : (
                        "Apply trim"
                      )}
                    </button>
                    <button type="button" onClick={() => setTrimOpen(false)} disabled={trimming} className="btn btn-ghost btn-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="mt-5">
            <label htmlFor="rec-title" className="mb-1.5 block text-sm font-medium">
              Title
            </label>
            <input
              id="rec-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="field"
              placeholder="Untitled recording"
            />
          </div>

          {error && (
            <p role="alert" className="anim-alert mt-4 rounded-lg bg-record-soft px-3 py-2 text-sm text-record">
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center gap-2.5">
            <button type="button" onClick={save} disabled={phase === "saving"} className="btn btn-primary flex-1">
              {phase === "saving" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" /> Save and get link
                </>
              )}
            </button>
            <button type="button" onClick={discard} disabled={phase === "saving"} className="btn btn-secondary">
              Re-record
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
