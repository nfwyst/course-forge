import { useEffect, useRef } from "react";

export type PlaybackMode = "manual" | "audio" | "auto";

interface Options {
  readonly src: string | null;
  readonly mode: PlaybackMode;
  readonly autoStarted: boolean;
  readonly onAutoAdvance: () => void;
  readonly onTimeUpdate?: (elapsedMs: number) => void;
  readonly paused?: boolean;
  readonly trailMs?: number;
  readonly estimateFallbackMs?: number;
}

export function useAudioPlayer({
  src,
  mode,
  autoStarted,
  onAutoAdvance,
  onTimeUpdate,
  paused = false,
  trailMs = 200,
  estimateFallbackMs = 1500,
}: Options) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onAdvanceRef = useRef(onAutoAdvance);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const pausedRef = useRef(paused);
  onAdvanceRef.current = onAutoAdvance;
  onTimeUpdateRef.current = onTimeUpdate;
  pausedRef.current = paused;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (paused) audio.pause();
    else audio.play().catch(() => undefined);
  }, [paused]);

  useEffect(() => {
    const previous = audioRef.current;
    if (previous) {
      previous.pause();
      previous.removeAttribute("src");
      previous.load();
      audioRef.current = null;
    }
    onTimeUpdateRef.current?.(0);

    if (mode === "manual" || (mode === "auto" && !autoStarted)) return;

    let advanced = false;
    let timer: number | undefined;
    const advanceAfter = (delayMs: number) => {
      if (mode !== "auto" || advanced || pausedRef.current) return;
      timer = window.setTimeout(() => {
        if (advanced || pausedRef.current) return;
        advanced = true;
        onAdvanceRef.current();
      }, delayMs);
    };

    if (!src) {
      if (mode === "auto") advanceAfter(estimateFallbackMs);
      return () => {
        if (timer !== undefined) window.clearTimeout(timer);
      };
    }

    const audio = new Audio(src);
    audio.preload = "auto";
    audioRef.current = audio;
    const onEnded = () => advanceAfter(trailMs);
    const onError = () => advanceAfter(estimateFallbackMs);
    const onTimeUpdate = () => onTimeUpdateRef.current?.(audio.currentTime * 1000);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("timeupdate", onTimeUpdate);

    if (!pausedRef.current) {
      audio.play().catch(() => {
        if (mode === "auto") advanceAfter(estimateFallbackMs);
      });
    }

    return () => {
      advanced = true;
      if (timer !== undefined) window.clearTimeout(timer);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [src, mode, autoStarted, trailMs, estimateFallbackMs]);
}
