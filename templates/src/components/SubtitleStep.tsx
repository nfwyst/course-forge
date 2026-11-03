import { useEffect, useState } from "react";
import type { Cursor } from "../hooks/useStepper";
import type { ChapterDef } from "../registry/types";
import "./SubtitleStep.css";

export interface SubtitleStepProps {
  readonly chapters: ChapterDef[];
  readonly cursor: Cursor;
  readonly elapsedMs: number;
}

interface SubtitleChunk {
  readonly text: string;
  readonly ms: number;
}

type SubtitleData = Record<string, Record<string, readonly SubtitleChunk[]>>;

function activeChunk(chunks: readonly SubtitleChunk[], elapsedMs: number): SubtitleChunk {
  let deadlineMs = 0;
  for (const chunk of chunks) {
    deadlineMs += chunk.ms;
    if (elapsedMs < deadlineMs) return chunk;
  }
  return chunks[chunks.length - 1]!;
}

export function SubtitleStep({ chapters, cursor, elapsedMs }: SubtitleStepProps) {
  const [data, setData] = useState<SubtitleData | null>(null);
  const chapter = chapters[cursor.chapter];
  const fallbackText = chapter?.narrations[cursor.step] ?? "";
  const chunks = data?.[chapter?.id ?? ""]?.[String(cursor.step)];

  useEffect(() => {
    let cancelled = false;
    fetch("/subtitle-timing.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((timing: SubtitleData | null) => {
        if (!cancelled) setData(timing);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const text = chunks && chunks.length > 0
    ? activeChunk(chunks, elapsedMs).text
    : fallbackText;

  return (
    <div className="ss-bar">
      <div className={text ? "ss-chunk serif-cn" : "ss-empty label-mono"}>
        {text || "…"}
      </div>
    </div>
  );
}
