#!/usr/bin/env bash
set -euo pipefail

VOICE="${PRESENTATION_EDGE_VOICE:-zh-CN-YunxiNeural}"

edge_cli_available() {
  if [[ -n "${EDGE_TTS_BIN:-}" && -x "$EDGE_TTS_BIN" ]]; then
    return 0
  fi
  command -v edge-tts >/dev/null 2>&1 || command -v edge-tts.exe >/dev/null 2>&1
}

edge_module_available() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -m edge_tts --help >/dev/null 2>&1
    return
  fi
  if command -v python >/dev/null 2>&1; then
    python -m edge_tts --help >/dev/null 2>&1
    return
  fi
  return 1
}

tts_check() {
  if edge_cli_available || edge_module_available; then
    return 0
  fi
  echo "✗ edge-tts not found." >&2
  return 1
}

tts_install_help() {
  cat <<'EOF' >&2
To use the Edge-TTS provider, install it in an isolated uv tool environment:

  uv tool install edge-tts
  uv tool update-shell

Open a new shell, then verify it:

  edge-tts --list-voices

For a project-local Python environment, install edge-tts there and set the
exact executable path instead of changing a system Python installation:

  export EDGE_TTS_BIN=/absolute/path/to/.venv/bin/edge-tts

Default voice: zh-CN-YunxiNeural
Override:      export PRESENTATION_EDGE_VOICE=zh-CN-XiaoxiaoNeural
EOF
}

tts_synthesize() {
  local text="$1"
  local out="$2"
  local voice="${3:-$VOICE}"

  if [[ -n "${EDGE_TTS_BIN:-}" && -x "$EDGE_TTS_BIN" ]]; then
    "$EDGE_TTS_BIN" --voice "$voice" --text "$text" --write-media "$out" >/dev/null
  elif command -v edge-tts >/dev/null 2>&1; then
    edge-tts --voice "$voice" --text "$text" --write-media "$out" >/dev/null
  elif command -v edge-tts.exe >/dev/null 2>&1; then
    edge-tts.exe --voice "$voice" --text "$text" --write-media "$out" >/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m edge_tts --voice "$voice" --text "$text" --write-media "$out" >/dev/null
  else
    python -m edge_tts --voice "$voice" --text "$text" --write-media "$out" >/dev/null
  fi
}
