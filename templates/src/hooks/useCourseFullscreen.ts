import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface CourseFullscreen {
  readonly isFullscreen: boolean;
  readonly isPortrait: boolean;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  toggle(): void;
}

export function useCourseFullscreen(): CourseFullscreen {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEmulated, setIsEmulated] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const toggle = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (isEmulated) {
      setIsEmulated(false);
      setIsPortrait(false);
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    root.requestFullscreen().catch(() => {
      setIsEmulated(true);
      setIsPortrait(window.innerHeight > window.innerWidth);
    });
  }, [isEmulated]);

  useEffect(() => {
    const updatePortrait = () => {
      const active = document.fullscreenElement === rootRef.current;
      setIsPortrait((active || isEmulated) && window.innerHeight > window.innerWidth);
    };
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === rootRef.current;
      setIsFullscreen(active);
      updatePortrait();
      if (active && window.innerHeight > window.innerWidth) {
        screen.orientation?.lock("landscape").catch(() => undefined);
      } else if (!active) {
        screen.orientation?.unlock();
        setIsEmulated(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("resize", updatePortrait);
    window.addEventListener("orientationchange", updatePortrait);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("resize", updatePortrait);
      window.removeEventListener("orientationchange", updatePortrait);
    };
  }, [isEmulated]);

  return { isFullscreen, isPortrait, rootRef, toggle };
}
