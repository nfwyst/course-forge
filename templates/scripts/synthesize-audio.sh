#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
# synthesize-audio.sh — provider-agnostic TTS runner.
#
# Reads audio-segments.json and writes one mp3 per segment under
# public/audio/<chapter>/<N>.mp3. A provider exposes tts_synthesize,
# optionally tts_check and tts_install_help.
#
# Options:
#   --provider=<name>             override PRESENTATION_TTS (default: edge)
#   --voice=<id>                  override PRESENTATION_TTS_VOICE
#   --chapters=id1,id2            synthesize only comma-separated chapter IDs
#   --chapters id1 id2            synthesize only space-separated chapter IDs
#   --force                       replace non-empty audio files
# ────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd -W)"
else
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
fi
SEGMENTS="$ROOT/audio-segments.json"
OUT_DIR="$ROOT/public/audio"
PROVIDERS_DIR="$SCRIPT_DIR/tts-providers"
PROVIDER="${PRESENTATION_TTS:-edge}"
VOICE="${PRESENTATION_TTS_VOICE:-}"
CHAPTERS=""
FORCE=false

append_chapter() {
  local chapter="$1"
  CHAPTERS="${CHAPTERS}${CHAPTERS:+,}${chapter}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --voice=*)
      VOICE="${1#--voice=}"
      shift
      ;;
    --provider=*)
      PROVIDER="${1#--provider=}"
      shift
      ;;
    --chapters=*)
      CHAPTERS="${1#--chapters=}"
      shift
      ;;
    --chapters)
      shift
      if [[ $# -eq 0 || "$1" == --* ]]; then
        echo "✗ --chapters needs at least one chapter ID" >&2
        exit 1
      fi
      while [[ $# -gt 0 && "$1" != --* ]]; do
        append_chapter "$1"
        shift
      done
      ;;
    -h|--help)
      sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "✗ unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! "$PROVIDER" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "✗ invalid TTS provider name: $PROVIDER" >&2
  exit 1
fi
PROVIDER_FILE="$PROVIDERS_DIR/$PROVIDER.sh"
if [[ ! -f "$SEGMENTS" ]]; then
  echo "✗ $SEGMENTS not found. Run: bun run extract-narrations" >&2
  exit 1
fi
if ! command -v jq >/dev/null; then
  echo "✗ jq is required to read audio-segments.json" >&2
  echo "  Install jq with your operating system's package manager." >&2
  exit 1
fi
if [[ ! -f "$PROVIDER_FILE" ]]; then
  echo "✗ TTS provider '$PROVIDER' not found at $PROVIDER_FILE" >&2
  echo "  Available providers:" >&2
  for file in "$PROVIDERS_DIR"/*.sh; do
    [[ -f "$file" ]] || continue
    echo "    • $(basename "$file" .sh)" >&2
  done
  exit 1
fi

# shellcheck source=/dev/null
source "$PROVIDER_FILE"
if ! declare -F tts_synthesize >/dev/null; then
  echo "✗ provider '$PROVIDER' does not define tts_synthesize" >&2
  exit 1
fi
if declare -F tts_check >/dev/null && ! tts_check; then
  if declare -F tts_install_help >/dev/null; then
    tts_install_help
  fi
  exit 1
fi

selected_rows=$(jq -c --arg chapters "$CHAPTERS" '
  .[] | select(
    $chapters == "" or
    (.chapter as $chapter | ($chapters | split(",") | index($chapter)))
  )
' "$SEGMENTS")
total=$(printf '%s\n' "$selected_rows" | jq -s 'length')
i=0
synthesized=0
skipped=0
failed=0

while IFS= read -r row; do
  [[ -n "$row" ]] || continue
  i=$((i + 1))
  chapter=$(printf '%s' "$row" | jq -r '.chapter')
  step=$(printf '%s' "$row" | jq -r '.step')
  text=$(printf '%s' "$row" | jq -r '.text')
  if [[ ! "$chapter" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ || "$chapter" == *..* ||
        ! "$step" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ || "$step" == *..* ]]; then
    echo "✗ unsafe audio segment path: chapter=$chapter step=$step" >&2
    exit 1
  fi
  out="$OUT_DIR/$chapter/$step.mp3"

  if [[ -s "$out" && "$FORCE" != true ]]; then
    skipped=$((skipped + 1))
    printf "[%3d/%d] %-20s skip (exists)\n" "$i" "$total" "$chapter/$step.mp3"
    continue
  fi

  mkdir -p "$(dirname "$out")"
  start=$(date +%s)
  if tts_synthesize "$text" "$out" "$VOICE"; then
    elapsed=$(( $(date +%s) - start ))
    synthesized=$((synthesized + 1))
    printf "[%3d/%d] %-20s ✓ %ss\n" "$i" "$total" "$chapter/$step.mp3" "$elapsed"
  else
    failed=$((failed + 1))
    rm -f "$out"
    printf "[%3d/%d] %-20s ✗ FAILED\n" "$i" "$total" "$chapter/$step.mp3" >&2
  fi
done <<< "$selected_rows"

echo
echo "✓ done (provider=$PROVIDER) — synthesized $synthesized, skipped $skipped, failed $failed"
[[ $failed -eq 0 ]] || exit 2
