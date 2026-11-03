#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
# MiniMax T2A v2 provider — direct curl (Token Plan keys).
# API:     POST https://api.minimaxi.com/v1/t2a_v2
# Default: model=speech-2.8-hd  voice=male-cn-instructor
# ────────────────────────────────────────────────────────────────────
set -euo pipefail

API_KEY="${MINIMAX_API_KEY:-}"
API_URL="https://api.minimaxi.com/v1/t2a_v2"
VOICE="${PRESENTATION_MINIMAX_VOICE:-male-cn-instructor}"
MODEL="${PRESENTATION_MINIMAX_MODEL:-speech-2.8-hd}"

tts_check() {
  if [[ -z "${API_KEY:-}" ]]; then
    echo "✗ MINIMAX_API_KEY is not set." >&2
    return 1
  fi
  if ! command -v python3 >/dev/null; then
    echo "✗ python3 is required but not found." >&2
    return 1
  fi
}

tts_install_help() {
  cat <<'EOF' >&2
To use the MiniMax direct-curl provider:

  Export your Token Plan API key:
    export MINIMAX_API_KEY=<your-token-plan-key>

  Optional — configure model / voice:
    export PRESENTATION_MINIMAX_MODEL=speech-2.8-hd         # default
    export PRESENTATION_MINIMAX_VOICE=male-cn-instructor  # default

  Or pick another provider:  PRESENTATION_TTS=<name> bun run synthesize-audio
EOF
}

tts_synthesize() {
  local text="$1"
  local out="$2"
  local voice="${3:-$VOICE}"
  local tmp_dir tmp_resp payload status

  # macOS and GNU mktemp both support a template with Xs; --suffix is GNU-only.
  tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/course-forge-minimax.XXXXXX")
  tmp_resp="$tmp_dir/response.json"
  payload=$(python3 -c '
import json
import sys

model, text, voice = sys.argv[1:]
print(json.dumps({
    "model": model,
    "text": text,
    "voice_setting": {"voice_id": voice},
    "subtitle_enable": True,
    "subtitle_type": "word",
}, ensure_ascii=False))
' "$MODEL" "$text" "$voice")

  if ! curl -fsS -X POST "$API_URL" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    -o "$tmp_resp"; then
    rm -rf "$tmp_dir"
    return 1
  fi

  if python3 -c '
import json
import os
import sys

response_path, output_path = sys.argv[1:]
with open(response_path, encoding="utf-8") as response_file:
    response = json.load(response_file)

base_response = response.get("base_resp", response)
if base_response.get("status_code") != 0:
    raise SystemExit(2)

audio_hex = response.get("data", {}).get("audio", "")
if not audio_hex:
    print("MiniMax response contained no audio data.", file=sys.stderr)
    raise SystemExit(3)

try:
    audio = bytes.fromhex(audio_hex)
except ValueError:
    print("MiniMax response contained invalid audio data.", file=sys.stderr)
    raise SystemExit(4)

with open(output_path, "wb") as audio_file:
    audio_file.write(audio)

subtitles = response.get("extra_info", {}).get("subtitles", [])
if subtitles:
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(output_path)))))
    chapter = os.path.basename(os.path.dirname(output_path))
    word_dir = os.path.join(project_root, "public", "minimax-word-timing", chapter)
    os.makedirs(word_dir, exist_ok=True)
    word_file = os.path.join(word_dir, os.path.basename(output_path).replace(".mp3", ".json"))
    word_data = [
        {
            "text": subtitle["text"],
            "start_ms": subtitle.get("start_ms", 0),
            "end_ms": subtitle.get("end_ms", 0),
        }
        for subtitle in subtitles
    ]
    with open(word_file, "w", encoding="utf-8") as timing_file:
        json.dump(word_data, timing_file, ensure_ascii=False)
else:
    print("No word timing in response; subtitles will use default timing.", file=sys.stderr)
' "$tmp_resp" "$out"; then
    rm -rf "$tmp_dir"
    return 0
  else
    status=$?
    echo "✗ MiniMax API error:" >&2
    python3 -c '
import json
import sys

with open(sys.argv[1], encoding="utf-8") as response_file:
    print(json.dumps(json.load(response_file), indent=2, ensure_ascii=False))
' "$tmp_resp" >&2 || true
    rm -rf "$tmp_dir"
    return "$status"
  fi
}
