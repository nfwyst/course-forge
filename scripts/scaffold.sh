#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="$SKILL_DIR/templates"
THEMES_DIR="$SKILL_DIR/themes"
DEFAULT_THEME="midnight-press"

list_themes() {
  echo "Available themes:"
  for directory in "$THEMES_DIR"/*/; do
    [[ -f "$directory/theme.json" ]] || continue
    python3 -c '
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    theme = json.load(source)
print("  {}: {} — {}".format(theme["id"], theme["nameZh"], theme["descriptionZh"]))
' "$directory/theme.json"
  done
  echo "Default: $DEFAULT_THEME"
}

TARGET=""
THEME="$DEFAULT_THEME"
for argument in "$@"; do
  case "$argument" in
    --list-themes)
      list_themes
      exit 0
      ;;
    --theme=*)
      THEME="${argument#--theme=}"
      ;;
    --*)
      echo "✗ unknown option: $argument" >&2
      exit 1
      ;;
    *)
      if [[ -n "$TARGET" ]]; then
        echo "✗ only one target directory is allowed" >&2
        exit 1
      fi
      TARGET="$argument"
      ;;
  esac
done

TARGET="${TARGET:-presentation}"
THEME_DIR="$THEMES_DIR/$THEME"
if [[ ! -f "$THEME_DIR/tokens.css" ]]; then
  echo "✗ theme '$THEME' was not found; use --list-themes" >&2
  exit 1
fi
if [[ -d "$TARGET" && -n "$(ls -A "$TARGET" 2>/dev/null || true)" ]]; then
  echo "✗ target directory '$TARGET' already exists and is not empty" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ python3 is required to list theme metadata" >&2
  exit 1
fi

mkdir -p "$TARGET"
cp -R "$TEMPLATES/." "$TARGET/"
rm -rf "$TARGET/node_modules" "$TARGET/dist" "$TARGET/.vite" "$TARGET/scripts/__pycache__"
cp "$THEME_DIR/tokens.css" "$TARGET/src/styles/tokens.css"
cp "$SKILL_DIR/scripts/check-course-json-sync.sh" "$TARGET/scripts/check-course-json-sync.sh"
printf '%s\n' "$THEME" > "$TARGET/.theme"

cat <<EOF
✓ Created $TARGET with the $THEME theme.

Next steps:
  cd $TARGET
  bun install --frozen-lockfile
  bun run check
  bun run lint
  bun run dev              # http://127.0.0.1:5174

The generated package.json pins every direct dependency exactly. The scaffold
never invokes an online generator, mutates dependencies, or accesses parent
files. It includes scripts/record.sh and scripts/record.js; install Playwright's
browser once with:

  bun run playwright install chromium

Then record a running course with:

  bun run record -- --dev --headless --out course-recording.mp4

Build chapters under src/chapters/, register them in src/registry/chapters,
and add matching IDs to course.json. Run bun run lint after each chapter.
EOF
