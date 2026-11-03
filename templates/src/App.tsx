import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/animations.css";

import { useCallback, useEffect, useState } from "react";
import { AppDock } from "./components/AppDock";
import { AutoStartGate } from "./components/AutoStartGate";
import { ChapterMenu } from "./components/ChapterMenu";
import { CourseProgressReadout, computeSegmentProgress } from "./components/CourseProgress";
import { ModeControls } from "./components/ModeControls";
import { ProgressBar } from "./components/ProgressBar";
import { QuizPanel } from "./components/QuizPanel";
import { Stage } from "./components/Stage";
import { SubtitleStep } from "./components/SubtitleStep";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useAutoMode } from "./hooks/useAutoMode";
import { readChapterIndexFromUrl, readCourseIdFromUrl, useCourseLoader } from "./hooks/useCourseLoader";
import { useCourseFullscreen } from "./hooks/useCourseFullscreen";
import { useCourseMenu } from "./hooks/useCourseMenu";
import { useStepper } from "./hooks/useStepper";
import { CHAPTERS } from "./registry/chapters";
import type { ChapterDef, CourseJson } from "./registry/types";

function estimateMs(text: string): number {
  if (!text) return 1500;
  return Math.max(1500, text.length * 250);
}

export default function App() {
  const loader = useCourseLoader({ mode: "course", singleVideoChapters: CHAPTERS });
  if (loader.status === "loading") return <LoadingState title="载入中…" />;
  if (loader.status === "empty") return <LoadingState title="开始创建第一章" message={loader.message} hint="创建章节文件，在 chapters.ts 注册，再把相同 id 加入 course.json。" />;
  if (loader.status === "missing" || loader.status === "error") return <LoadingState title="course.json 缺失或无效" message={loader.message} hint="请先在项目根生成 course.json (参考 references/COURSE-STRUCTURE.md § 课程结构)" />;
  return <CourseView course={loader.course} chapters={loader.chapters} />;
}

interface LoadingStateProps {
  readonly title: string;
  readonly message?: string;
  readonly hint?: string;
}

function LoadingState({ title, message, hint }: LoadingStateProps) {
  if (!message) return <div className="app-root app-root--loading"><div className="app-loading serif-cn">{title}</div></div>;
  return (
    <div className="app-root app-root--loading">
      <div className="app-error">
        <div className="app-error-title serif-cn">{title}</div>
        <div className="app-error-body serif-cn">{message}</div>
        <div className="app-error-hint label-mono">{hint}</div>
      </div>
    </div>
  );
}

interface CourseViewProps {
  readonly course: CourseJson;
  readonly chapters: ChapterDef[];
}

function CourseView({ course, chapters }: CourseViewProps) {
  const courseId = `${course.courseId}-${readCourseIdFromUrl()}`;
  const stepper = useStepper(chapters, courseId, readChapterIndexFromUrl());
  const { mode, cycleMode, autoStarted, setAutoStarted } = useAutoMode();
  const menu = useCourseMenu();
  const fullscreen = useCourseFullscreen();
  const [isPaused, setIsPaused] = useState(false);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [subtitleMs, setSubtitleMs] = useState(0);

  const chapter = chapters[stepper.cursor.chapter]!;
  const Chapter = chapter.Component;
  const narration = chapter.narrations[stepper.cursor.step] ?? "";
  const quiz = chapter.quizzes?.find((item) => item.step === stepper.cursor.step);
  const quizOpen = Boolean(quiz) && !quizAnswered;

  useEffect(() => {
    setIsPaused(false);
    setQuizAnswered(false);
    setSubtitleMs(0);
  }, [stepper.cursor.chapter, stepper.cursor.step]);

  const advance = useCallback(() => {
    if (!isPaused && !quizOpen) stepper.next();
  }, [isPaused, quizOpen, stepper]);

  useAudioPlayer({
    src: `/audio/${chapter.id}/${stepper.cursor.step + 1}.mp3`,
    paused: isPaused,
    mode,
    autoStarted,
    onAutoAdvance: advance,
    estimateFallbackMs: estimateMs(narration),
    onTimeUpdate: setSubtitleMs,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (mode === "auto" && !autoStarted) setAutoStarted(true);
        else setIsPaused((paused) => !paused);
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        fullscreen.toggle();
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        cycleMode();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [autoStarted, cycleMode, fullscreen, mode, setAutoStarted]);

  const hint = "Space 暂停/播放 · M 模式 · F 全屏 · 鼠标点屏幕推进";
  const progress = computeSegmentProgress(chapters, stepper.cursor, course);
  const rootClass = `app-root ${menu.isOpen ? "app-root--menu-open" : ""} ${fullscreen.isPortrait ? "app-root--fs-portrait" : ""}`;

  return (
    <div className={rootClass} ref={fullscreen.rootRef}>
      <ChapterMenu course={course} currentChapterId={chapter.id} jumpTo={stepper.jumpToChapter} onMouseEnter={menu.show} onMouseLeave={menu.hideDelayed} />
      <div className="cm-trigger" onMouseEnter={menu.show} onMouseLeave={menu.hideDelayed} onFocus={menu.show}>
        <button type="button" className="cm-trigger-btn" onClick={menu.toggle} aria-label="显示课程菜单" aria-expanded={menu.isOpen} title="菜单" data-no-advance>
          <span aria-hidden="true">≡</span>
        </button>
      </div>
      <div className="app-main">
        <AutoStartGate visible={mode === "auto" && !autoStarted} onStart={() => setAutoStarted(true)} />
        <div className="app-stage-area"><Stage onAdvance={advance} layout="embedded"><Chapter step={stepper.cursor.step} /></Stage></div>
        <SubtitleStep chapters={chapters} cursor={stepper.cursor} elapsedMs={subtitleMs} />
        {course.courseId === "single" ? (
          <ProgressBar chapters={chapters} cursor={stepper.cursor} onJumpChapter={stepper.jumpToChapter} />
        ) : (
          <AppDock railPct={progress.stepPct} readout={<CourseProgressReadout chapters={chapters} cursor={stepper.cursor} course={course} />} mode={mode} isPaused={isPaused} onTogglePause={() => setIsPaused((paused) => !paused)} onFullscreen={fullscreen.toggle} isFullscreen={fullscreen.isFullscreen} hint={hint} />
        )}
        {course.courseId === "single" && <ModeControls mode={mode} onFullscreen={fullscreen.toggle} isFullscreen={fullscreen.isFullscreen} isPaused={isPaused} onTogglePause={() => setIsPaused((paused) => !paused)} hint={hint} />}
        {quiz && <div className="app-quiz-overlay"><QuizPanel key={quiz.question.id} question={quiz.question} onSubmit={() => setQuizAnswered(true)} /></div>}
      </div>
    </div>
  );
}
