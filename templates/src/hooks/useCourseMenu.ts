import { useCallback, useEffect, useRef, useState } from "react";

export interface CourseMenuControls {
  readonly isOpen: boolean;
  hideDelayed(): void;
  show(): void;
  toggle(): void;
}

export function useCourseMenu(): CourseMenuControls {
  const [isOpen, setIsOpen] = useState(false);
  const hideTimer = useRef<number | null>(null);

  const show = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setIsOpen(true);
  }, []);

  const hideDelayed = useCallback(() => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setIsOpen(false), 220);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) setIsOpen(false);
    else show();
  }, [isOpen, show]);

  useEffect(() => () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
  }, []);

  return { isOpen, hideDelayed, show, toggle };
}
