import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChapterDef } from "../registry/types";

const STORAGE_KEY_VERSION = "v4";
const storageKey = (courseId: string) => `cf-cursor-${courseId}-${STORAGE_KEY_VERSION}`;

export type Cursor = { readonly chapter: number; readonly step: number };

export interface StepperState {
  readonly cursor: Cursor;
  readonly totalChapters: number;
  readonly chapterTotalSteps: number;
  readonly globalIndex: number;
  readonly totalGlobal: number;
  next(): void;
  prev(): void;
  jumpToChapter(index: number, step?: number): void;
  jumpToGlobal(index: number): void;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

function sanitize(cursor: Cursor, chapters: readonly ChapterDef[]): Cursor {
  if (chapters.length === 0) return { chapter: 0, step: 0 };
  const chapter = clamp(cursor.chapter | 0, 0, chapters.length - 1);
  const steps = chapters[chapter]!.narrations.length;
  return { chapter, step: clamp(cursor.step | 0, 0, Math.max(0, steps - 1)) };
}

export function useStepper(
  chapters: readonly ChapterDef[],
  courseId = "default",
  initialChapter?: number,
): StepperState {
  const key = storageKey(courseId);
  const fallback = sanitize({ chapter: initialChapter ?? 0, step: 0 }, chapters);
  const [cursor, setCursor] = useState<Cursor>(() => {
    if (typeof window === "undefined" || initialChapter !== undefined) return fallback;
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? sanitize(JSON.parse(stored), chapters) : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    setCursor((current) => sanitize(current, chapters));
  }, [chapters]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(cursor));
    } catch {
      return;
    }
  }, [cursor, key]);

  const offsets = useMemo(() => {
    const result: number[] = [];
    let total = 0;
    for (const chapter of chapters) {
      result.push(total);
      total += chapter.narrations.length;
    }
    return result;
  }, [chapters]);
  const totalGlobal = useMemo(
    () => chapters.reduce((total, chapter) => total + chapter.narrations.length, 0),
    [chapters],
  );

  const next = useCallback(() => {
    setCursor((current) => {
      const chapter = chapters[current.chapter]!;
      if (current.step < chapter.narrations.length - 1) return { ...current, step: current.step + 1 };
      if (current.chapter < chapters.length - 1) return { chapter: current.chapter + 1, step: 0 };
      return current;
    });
  }, [chapters]);

  const prev = useCallback(() => {
    setCursor((current) => {
      if (current.step > 0) return { ...current, step: current.step - 1 };
      if (current.chapter === 0) return current;
      const chapter = chapters[current.chapter - 1]!;
      return { chapter: current.chapter - 1, step: chapter.narrations.length - 1 };
    });
  }, [chapters]);

  const jumpToChapter = useCallback((index: number, step = 0) => {
    const chapterIndex = clamp(index, 0, chapters.length - 1);
    const chapter = chapters[chapterIndex]!;
    setCursor({ chapter: chapterIndex, step: clamp(step, 0, chapter.narrations.length - 1) });
  }, [chapters]);

  const jumpToGlobal = useCallback((index: number) => {
    let remaining = clamp(index, 0, totalGlobal - 1);
    for (let chapter = 0; chapter < chapters.length; chapter += 1) {
      const steps = chapters[chapter]!.narrations.length;
      if (remaining < steps) {
        setCursor({ chapter, step: remaining });
        return;
      }
      remaining -= steps;
    }
  }, [chapters, totalGlobal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft" || event.key === "Backspace") prev();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, prev]);

  const chapter = chapters[cursor.chapter]!;
  return {
    cursor,
    totalChapters: chapters.length,
    chapterTotalSteps: chapter.narrations.length,
    globalIndex: (offsets[cursor.chapter] ?? 0) + cursor.step,
    totalGlobal,
    next,
    prev,
    jumpToChapter,
    jumpToGlobal,
  };
}
