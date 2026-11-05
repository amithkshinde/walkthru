"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, Check, Maximize, Minimize, Pause, PictureInPicture2, Play, Settings, Volume1, Volume2, VolumeX } from "lucide-react";
import { formatTime } from "@/lib/format";

export interface Marker {
  id: string;
  t: number;
  label: string;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export default function PlayerControls({
  videoRef,
  containerRef,
  duration,
  markers,
  speed,
  onSpeed,
  captions,
  onCaptions,
  hasCaptions,
  onMarker,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  duration: number;
  markers: Marker[];
  speed: number;
  onSpeed: (s: number) => void;
  captions: boolean;
  onCaptions: (on: boolean) => void;
  hasCaptions: boolean;
  onMarker: (t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);
  const [t, setT] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [awake, setAwake] = useState(true);
  const [fs, setFs] = useState(false);
  const [pipOk, setPipOk] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);
  const d = duration > 0 ? duration : 1;

  const wake = useCallback(() => {
    setAwake(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setAwake(false), 2500);
  }, []);

  useEffect(() => {
    setPipOk(typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled);
    const el = videoRef.current;
    if (!el) return;
    const sync = () => {
      setPaused(el.paused);
      setMuted(el.muted);
      setVolume(el.volume);
      if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
    };
    const tick = () => {
      setT(el.currentTime);
      raf.current = el.paused ? null : requestAnimationFrame(tick);
    };
    const onPlay = () => {
      sync();
      if (raf.current === null) raf.current = requestAnimationFrame(tick);
      wake();
    };
    const onPause = () => {
      sync();
      setT(el.currentTime);
      setAwake(true);
    };
    const onTime = () => !scrubbingRef.current && setT(el.currentTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("volumechange", sync);
    el.addEventListener("progress", sync);
    el.addEventListener("loadedmetadata", sync);
    el.addEventListener("seeked", onTime);
    el.addEventListener("timeupdate", onTime);
    const onFs = () => setFs(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    sync();
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("volumechange", sync);
      el.removeEventListener("progress", sync);
      el.removeEventListener("loadedmetadata", sync);
      el.removeEventListener("seeked", onTime);
      el.removeEventListener("timeupdate", onTime);
      document.removeEventListener("fullscreenchange", onFs);
      if (raf.current) cancelAnimationFrame(raf.current);
      if (idle.current) clearTimeout(idle.current);
    };
  }, [videoRef, containerRef, wake]);

  const scrubbingRef = useRef(false);
  scrubbingRef.current = scrubbing;

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else containerRef.current?.requestFullscreen?.().catch(() => {});
  };
  const pip = () => {
    const el = videoRef.current;
    if (!el) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else el.requestPictureInPicture?.().catch(() => {});
  };

  const timeAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * d;
  };
  const seekTo = (x: number) => {
    const el = videoRef.current;
    if (!el) return;
    const v = timeAt(x);
    el.currentTime = v;
    setT(v);
  };

  const visible = awake || paused || menu || scrubbing;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const btn = "grid h-9 w-9 place-items-center rounded-md text-white transition-colors hover:bg-white/15 focus-visible:bg-white/15";

  return (
    <div className="absolute inset-0" onMouseMove={wake} onMouseLeave={() => !paused && setAwake(false)} style={{ cursor: visible ? "default" : "none" }}>
      <button
        type="button"
        aria-label={paused ? "Play" : "Pause"}
        onClick={toggle}
        onDoubleClick={toggleFs}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-[inherit]"
      />
      {paused && (
        <span className="anim-pop pointer-events-none absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur">
          <Play className="h-7 w-7 fill-current" aria-hidden />
        </span>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-10 transition-opacity duration-200 ${
          visible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* progress */}
        <div
          ref={barRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(d)}
          aria-valuenow={Math.round(t)}
          aria-valuetext={`${formatTime(t)} of ${formatTime(d)}`}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setScrubbing(true);
            seekTo(e.clientX);
          }}
          onPointerMove={(e) => {
            setHoverT(timeAt(e.clientX));
            if (scrubbing) seekTo(e.clientX);
          }}
          onPointerUp={() => setScrubbing(false)}
          onPointerLeave={() => !scrubbing && setHoverT(null)}
          onKeyDown={(e) => {
            const el = videoRef.current;
            if (!el) return;
            if (e.key === "ArrowLeft") el.currentTime = Math.max(0, el.currentTime - 5);
            else if (e.key === "ArrowRight") el.currentTime = Math.min(d, el.currentTime + 5);
            else if (e.key === "Home") el.currentTime = 0;
            else if (e.key === "End") el.currentTime = d;
            else return;
            e.preventDefault();
          }}
          className="group/bar relative flex h-5 cursor-pointer touch-none items-center"
        >
          <div className="relative h-1 w-full rounded-full bg-white/30 transition-[height] group-hover/bar:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${Math.min(100, (buffered / d) * 100)}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${Math.min(100, (t / d) * 100)}%` }} />
            <span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-brand transition-transform group-hover/bar:scale-100 group-focus-visible/bar:scale-100"
              style={{ left: `${Math.min(100, (t / d) * 100)}%`, scale: scrubbing ? "1" : undefined }}
            />
          </div>
          {markers.map((m) => (
            <button
              key={m.id}
              type="button"
              tabIndex={-1}
              title={m.label}
              aria-label={`Jump to ${m.label}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onMarker(m.t);
              }}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 bg-record transition-transform hover:scale-150"
              style={{ left: `${Math.min(100, (m.t / d) * 100)}%` }}
            />
          ))}
          {hoverT !== null && (
            <span
              className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 font-mono text-xs tabular-nums text-white"
              style={{ left: `${Math.min(100, Math.max(3, (hoverT / d) * 100))}%` }}
            >
              {formatTime(hoverT)}
            </span>
          )}
        </div>

        {/* buttons */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggle} aria-label={paused ? "Play (K)" : "Pause (K)"} title={paused ? "Play (K)" : "Pause (K)"} className={btn}>
            {paused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
          </button>

          <div className="group/vol flex items-center">
            <button
              type="button"
              aria-label={muted ? "Unmute (M)" : "Mute (M)"}
              title={muted ? "Unmute (M)" : "Mute (M)"}
              onClick={() => {
                const el = videoRef.current;
                if (el) el.muted = !el.muted;
              }}
              className={btn}
            >
              <VolIcon className="h-5 w-5" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => {
                const el = videoRef.current;
                if (!el) return;
                el.volume = Number(e.target.value);
                el.muted = Number(e.target.value) === 0;
              }}
              className="h-1 w-0 cursor-pointer accent-white opacity-0 transition-all duration-150 group-focus-within/vol:mr-2 group-focus-within/vol:w-16 group-focus-within/vol:opacity-100 group-hover/vol:mr-2 group-hover/vol:w-16 group-hover/vol:opacity-100"
            />
          </div>

          <span className="ml-1 font-mono text-xs tabular-nums text-white/90">
            {formatTime(t)} / {formatTime(d)}
          </span>

          <span className="flex-1" />

          {hasCaptions && (
            <button
              type="button"
              aria-pressed={captions}
              aria-label="Captions (C)"
              title="Captions (C)"
              onClick={() => onCaptions(!captions)}
              className={`${btn} ${captions ? "border-b-2 border-brand" : ""}`}
            >
              <Captions className="h-5 w-5" />
            </button>
          )}

          <div className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label="Settings" title="Settings" onClick={() => setMenu((m) => !m)} className={btn}>
              <Settings className={`h-5 w-5 transition-transform duration-200 ${menu ? "rotate-45" : ""}`} />
            </button>
            {menu && (
              <div role="menu" aria-label="Playback speed" className="anim-fade absolute bottom-11 right-0 w-36 rounded-lg bg-black/90 p-1 text-sm text-white shadow-lg backdrop-blur">
                <p className="px-3 py-1.5 text-xs text-white/60">Playback speed</p>
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitemradio"
                    aria-checked={speed === s}
                    onClick={() => {
                      onSpeed(s);
                      setMenu(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left hover:bg-white/15"
                  >
                    {s === 1 ? "Normal" : `${s}x`}
                    {speed === s && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {pipOk && (
            <button type="button" onClick={pip} aria-label="Picture in picture" title="Picture in picture" className={btn}>
              <PictureInPicture2 className="h-5 w-5" />
            </button>
          )}
          <button type="button" onClick={toggleFs} aria-label={fs ? "Exit full screen (F)" : "Full screen (F)"} title={fs ? "Exit full screen (F)" : "Full screen (F)"} className={btn}>
            {fs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
