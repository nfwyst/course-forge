import "./ModeControls.css";

export type PlaybackMode = "manual" | "audio" | "auto";

export interface ModeControlsProps {
  mode: PlaybackMode;
  /** "space → start auto" hint text shown next to the button. */
  hint?: string;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
  /**
   * Independent of playback mode: when true the audio is paused and
   * auto-advance is held. The button renders ⏸/▶ and toggles between
   * the two states via `onTogglePause`. Default false.
   */
  isPaused?: boolean;
  onTogglePause?: () => void;
}

/**
 * TransportControls — the playback transport group: pause/play, the
 * AUTO/MANUAL status badge, and fullscreen. Extracted from ModeControls
 * so the bottom dock (AppDock) can compose it next to the progress
 * readout without the surrounding `.mc-bar` chrome.
 *
 * Layout order (left → right):
 *   ⏯ [Pause/Play]   ◉ [Mode status]   ⛶ [Fullscreen]
 *   hint text on the right
 */
export interface TransportControlsProps {
  mode: PlaybackMode;
  onTogglePause?: () => void;
  isPaused?: boolean;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
  hint?: string;
}

function ModeStatus({ mode, isPaused }: { readonly mode: PlaybackMode; readonly isPaused?: boolean }) {
  const status = isPaused ? "paused" : mode;
  const labels = {
    manual: ["MANUAL", "手动"],
    audio: ["AUDIO", "音频"],
    auto: ["AUTO", "全自动"],
    paused: ["PAUSED", "暂停"],
  } as const;
  const [english, chinese] = labels[status];
  return (
    <div className={`mc-status mc-status--${status}`} aria-live="polite" aria-label={`播放模式：${chinese}`}>
      {status === "auto" && <span className="mc-status-dot" aria-hidden="true" />}
      {status === "paused" && <span className="mc-status-icon" aria-hidden="true">⏸</span>}
      <span className="mc-status-en label-mono">{english}</span>
      <span className="mc-status-cn serif-cn">{chinese}</span>
    </div>
  );
}

export function TransportControls({
  mode,
  onTogglePause,
  isPaused,
  onFullscreen,
  isFullscreen,
  hint,
}: TransportControlsProps) {
  return (
    <div className="mc-group" role="group" aria-label="播放控制">
      {onTogglePause && (
        <button
          type="button"
          className={`mc-btn mc-btn--pause ${isPaused ? "mc-btn--pause-active" : ""}`}
          onClick={onTogglePause}
          aria-pressed={!!isPaused}
          title="Space"
          data-no-advance
        >
          <span className="mc-btn-icon">
            {isPaused ? "▶" : "⏸"}
          </span>
          <span className="mc-btn-cn serif-cn">{isPaused ? "播放" : "暂停"}</span>
        </button>
      )}
      <div className="mc-divider" aria-hidden="true" />
      <ModeStatus mode={mode} isPaused={isPaused} />
      <div className="mc-divider" aria-hidden="true" />
      {onFullscreen && (
        <button
          type="button"
          className={`mc-btn mc-btn--fs ${isFullscreen ? "mc-btn--fs-active" : ""}`}
          onClick={onFullscreen}
          aria-pressed={!!isFullscreen}
          title="F"
          data-no-advance
        >
          <span className="mc-btn-icon">⛶</span>
          <span className="mc-btn-cn serif-cn">{isFullscreen ? "退出全屏" : "全屏"}</span>
        </button>
      )}
      {hint && <div className="mc-hint label-mono">{hint}</div>}
    </div>
  );
}

/**
 * ModeControls — compact playback transport (pause / fullscreen / state).
 *
 * The 3-state mode toggle (MANUAL / AUDIO / AUTO) is a single truthful
 * status badge. Pause is shown as PAUSED without changing the selected
 * mode. Space controls pause/play; M cycles the underlying mode.
 *
 * This component is now a thin wrapper around `TransportControls`, kept
 * for the single-video mode footer (where it renders as its own bar).
 * In course mode the bottom dock (AppDock) composes `TransportControls`
 * directly so the progress bar and the transport share one row.
 */
export function ModeControls({
  mode,
  hint,
  onFullscreen,
  isFullscreen,
  isPaused,
  onTogglePause,
}: ModeControlsProps) {
  return (
    <div className="mc-bar">
      <TransportControls
        mode={mode}
        onTogglePause={onTogglePause}
        isPaused={isPaused}
        onFullscreen={onFullscreen}
        isFullscreen={isFullscreen}
        hint={hint}
      />
    </div>
  );
}
