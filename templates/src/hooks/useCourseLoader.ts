import { useMemo } from "react";
import defaultCourseJson from "../../course.json";
import type { ChapterDef, CourseJson } from "../registry/types";

export type CourseLoadState =
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly course: CourseJson; readonly chapters: ChapterDef[] }
  | { readonly status: "empty"; readonly message: string }
  | { readonly status: "missing"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

export function readCourseIdFromUrl(): string {
  if (typeof window === "undefined") return "default";
  return new URLSearchParams(window.location.search).get("course") || "default";
}

export function readChapterIndexFromUrl(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get("chapter");
  if (value === null) return undefined;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

const defaultCourse: CourseJson = defaultCourseJson;
const allCourses = import.meta.glob<CourseJson>("../../course-*.json", {
  eager: true,
  import: "default",
}) satisfies Record<string, CourseJson>;

interface UseCourseLoaderOptions {
  readonly mode: "single" | "course";
  readonly singleVideoChapters: readonly ChapterDef[];
}

export function useCourseLoader({ mode, singleVideoChapters }: UseCourseLoaderOptions): CourseLoadState {
  return useMemo(() => loadCourse(mode, singleVideoChapters), [mode, singleVideoChapters]);
}

function loadCourse(mode: UseCourseLoaderOptions["mode"], chapters: readonly ChapterDef[]): CourseLoadState {
  if (mode === "single") return singleCourse(chapters);
  const courseId = readCourseIdFromUrl();
  const course = courseId === "default" ? defaultCourse : findCourse(courseId);
  if (!course) return missingCourse(courseId);

  const registered = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const requested = course.outlineSegments.flatMap((segment) => segment.chapters.map((chapter) => chapter.id));
  if (requested.length === 0) {
    return { status: "empty", message: "course.json 尚未添加章节；请先创建并注册第一章。" };
  }

  const missing = requested.filter((id) => !registered.has(id));
  if (missing.length > 0) {
    return { status: "error", message: `course.json 引用了未注册的章节 id: ${missing.join(", ")}` };
  }

  return { status: "ok", course, chapters: requested.map((id) => registered.get(id)!) };
}

function findCourse(courseId: string): CourseJson | undefined {
  for (const [path, course] of Object.entries(allCourses)) {
    if (path.endsWith(`/course-${courseId}.json`)) return course;
  }
  return undefined;
}

function singleCourse(chapters: readonly ChapterDef[]): CourseLoadState {
  const refs = chapters.map((chapter) => ({ id: chapter.id, title: chapter.title }));
  return {
    status: "ok",
    course: { courseId: "single", title: "Single Video", outlineSegments: [{ id: "single", title: "Single Video", chapters: refs }] },
    chapters: [...chapters],
  };
}

function missingCourse(courseId: string): CourseLoadState {
  const available = Object.keys(allCourses)
    .map((path) => path.match(/course-([^/]+)\.json$/)?.[1])
    .filter((id): id is string => id !== undefined);
  return {
    status: "missing",
    message: `未找到 ?course=${courseId}。可用的课程: ${available.length > 0 ? available.join(", ") : "(仅默认 course.json)"}`,
  };
}
