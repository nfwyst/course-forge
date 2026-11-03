#!/usr/bin/env python3
"""Validate course chapter reveal, visual, interaction, and narration rules."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys

from lint_course_scan import (
    SCREENS_PER_INTERACTION,
    STEPS_PER_SCREEN,
    ChapterResult,
    has_animejs,
    quiz_counts,
    scan_chapter,
)


def resolve_chapters_dir(requested: str) -> Path:
    for candidate in (Path(requested), Path("presentation/src/chapters"), Path("chapters")):
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError(f"找不到章节目录：{requested}")


def apply_quiz_counts(results: list[ChapterResult], chapters_dir: Path) -> None:
    counts = quiz_counts(chapters_dir)
    for result in results:
        chapter_id = result.name.split("-", 1)[-1]
        result.interactive_count += counts.get(chapter_id, 0)


def report_result(result: ChapterResult) -> tuple[int, int]:
    steps = result.steps if result.steps is not None else "无 narrations"
    scenes = ",".join(result.scene_types) or "—"
    visual = "视觉✓" if result.visual else "视觉✗"
    reveal = "揭示✓" if result.reveal else "揭示✗"
    print(f"  {'✓' if not result.issues else '✗'} {result.name}（{steps} 步）— {visual} 互动×{result.interactive_count} {reveal} 实景:{scenes} 材质×{result.material_count}")
    for issue in result.issues:
        print(f"      ✗ {issue}")
    for warning in result.warnings:
        print(f"      ⚠ {warning}")
    return len(result.issues), len(result.warnings)


def report_interaction_density(results: list[ChapterResult]) -> int:
    failures = 0
    print("\n  互动密度（按屏估算，每 3 屏 ≥ 1 处真互动）：")
    for result in results:
        steps = result.steps if result.steps and result.steps > 0 else 1
        screens = max(1, round(steps / STEPS_PER_SCREEN))
        required = max(1, -(-screens // SCREENS_PER_INTERACTION))
        valid = result.interactive_count >= required
        print(f"    {'✓' if valid else '✗'} {result.name}：≈{screens}屏 → 需≥{required}互动，实际 {result.interactive_count}")
        if not valid:
            failures += 1
            result.issues.append(f"互动密度 FAIL：估算 ≈{screens} 屏，需 ≥{required} 处真互动，实际 {result.interactive_count}")
    return failures


def run_animejs_check(chapters_dir: Path, chapter_dirs: list[Path]) -> int:
    if not has_animejs(chapter_dirs):
        return 0
    checker = chapters_dir.parent.parent / "scripts" / "check-animejs-cohesion.py"
    if not checker.is_file():
        print("⚠ 检测到 animejs 用法，建议跑 check-animejs-cohesion.py 检查动画共性")
        return 0
    return subprocess.run([sys.executable, str(checker), "--chapters", str(chapters_dir)], check=False).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate interactive course chapter rules.")
    parser.add_argument("--chapters", default="src/chapters")
    args = parser.parse_args()
    try:
        chapters_dir = resolve_chapters_dir(args.chapters)
    except FileNotFoundError as error:
        if Path(args.chapters).name == "chapters":
            print("✓ lint 跳过：尚未创建章节目录")
            return 0
        print(f"✗ {error}")
        return 1

    chapter_dirs = sorted(path for path in chapters_dir.iterdir() if path.is_dir())
    if not chapter_dirs:
        print("✓ lint 跳过：尚未创建章节")
        return 0

    print(f"▸ course-forge lint — 扫描 {chapters_dir}\n")
    results = [scan_chapter(chapter_dir) for chapter_dir in chapter_dirs]
    apply_quiz_counts(results, chapters_dir)
    failures = 0
    warnings = 0
    for result in results:
        issue_count, warning_count = report_result(result)
        failures += issue_count
        warnings += warning_count
    failures += report_interaction_density(results)
    print("\n" + "─" * 52)
    print(f"  章节 {len(results)} · FAIL {failures} · WARN {warnings}")
    print("─" * 52)
    if failures:
        print("✗ lint 未通过 — 请按上面的 FAIL 修复后再继续。")
        return 1
    if run_animejs_check(chapters_dir, chapter_dirs) != 0:
        return 1
    print("✓ lint 通过（warn 项建议酌情优化）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
