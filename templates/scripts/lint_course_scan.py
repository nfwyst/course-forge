from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import re

RE_VISUAL = re.compile(
    r"<svg|</svg|<canvas|canvas|@keyframes|animejs|requestAnimationFrame|"
    r"createDrawable|draggable|\.animate\(|getContext|new\s+Path2D",
    re.IGNORECASE,
)
RE_INTERACTIVE = re.compile(
    r"onClick|onChange|onSubmit|onInput|onDragStart|onDrop|onPointerDown|QuizPanel|data-interactive",
)
RE_REVEAL = re.compile(r"MaskReveal|<\s*Reveal\b")
RE_STEP_BOUND = re.compile(r"step\s*(?:===|>=|>)\s*(\d+)")
RE_NARRATION_LINE = re.compile(r'^\s*["\']')
RE_SCENE = re.compile(r"RunnerTrack|LiveEditor|BlockStack|TypeOut")
RE_HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RE_FONT_LITERAL = re.compile(r"font-family\s*:\s*(?!\s*var\()[^;]*;", re.IGNORECASE)
RE_MATERIAL = re.compile(
    r"linear-gradient|radial-gradient|box-shadow|drop-shadow|backdrop-filter|"
    r"mix-blend-mode|text-shadow|filter\s*:\s*blur",
    re.IGNORECASE,
)
RE_AI_GRADIENT = re.compile(
    r"linear-gradient\([^)]*(?:purple|pink|magenta|violet|indigo|fuchsia|lavender|#[89a-f][0-9a-f]{2,5})",
    re.IGNORECASE,
)
SCENE_LABELS = {
    "RunnerTrack": "执行跑道",
    "LiveEditor": "现场编辑器",
    "BlockStack": "积木堆叠",
    "TypeOut": "终端打字",
}
EMOJI_ICONS = "📱💡🚀🔥🧠👍👎📺🌟⭐💬🤖😀😄😊🤔😎🎮💻📦✨🎯🏆💪🙌👏🔧🔍📌📎✂️"
STEPS_SOFT_CAP = 12
STEPS_PER_SCREEN = 3
SCREENS_PER_INTERACTION = 3


@dataclass
class ChapterResult:
    name: str
    steps: int | None
    max_step: int | None
    visual: bool
    reveal: bool
    interactive_count: int
    scene_types: list[str]
    material_count: int
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def strip_comments(text: str) -> str:
    without_blocks = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return re.sub(r"//.*", "", without_blocks)


def chapter_sources(chapter_dir: Path) -> tuple[str, str]:
    tsx = "\n".join(path.read_text(encoding="utf-8") for path in chapter_dir.glob("*.tsx"))
    css = "\n".join(path.read_text(encoding="utf-8") for path in chapter_dir.glob("*.css"))
    return tsx, css


def narration_steps(chapter_dir: Path) -> int | None:
    narration_file = chapter_dir / "narrations.ts"
    if not narration_file.is_file():
        return None
    match = re.search(r"narrations[^=]*=\s*\[(.*?)\];", narration_file.read_text(encoding="utf-8"), re.DOTALL)
    if not match:
        return None
    return sum(
        1
        for line in match.group(1).splitlines()
        if not line.strip().startswith("//") and RE_NARRATION_LINE.match(line)
    )


def scan_chapter(chapter_dir: Path) -> ChapterResult:
    tsx_text, css_text = chapter_sources(chapter_dir)
    tsx_code = strip_comments(tsx_text)
    css_code = strip_comments(css_text)
    steps = narration_steps(chapter_dir)
    bounds = [int(match.group(1)) for match in RE_STEP_BOUND.finditer(tsx_code)]
    max_step = max(bounds) if bounds else None
    scenes = [label for name, label in SCENE_LABELS.items() if name in tsx_code]
    visual = bool(RE_VISUAL.search(tsx_code + "\n" + css_code)) or bool(RE_SCENE.search(tsx_code))
    result = ChapterResult(
        name=chapter_dir.name,
        steps=steps,
        max_step=max_step,
        visual=visual,
        reveal=bool(RE_REVEAL.search(tsx_code)),
        interactive_count=len(RE_INTERACTIVE.findall(tsx_code)),
        scene_types=scenes,
        material_count=len(RE_MATERIAL.findall(tsx_code + "\n" + css_code)),
    )
    if steps is not None and max_step is not None and steps != max_step + 1:
        result.issues.append(f"口播对齐 FAIL：narrations 长度={steps}，但章节代码 max step={max_step}（应为 {max_step + 1}）")
    elif steps is None and max_step is not None:
        result.warnings.append(f"无 narrations.ts：无法校验口播对齐（代码用到 max step={max_step}）")
    if not visual:
        result.warnings.append("未检测到视觉演示；静态扫描不能证明课程是否纯文字，请人工审查")
    if not result.reveal:
        result.warnings.append("未检测到 MaskReveal / Reveal；请人工审查渐进揭示")
    emoji_count = sum(character in EMOJI_ICONS for character in tsx_text.replace("\ufe0f", "").replace("\ufe0e", ""))
    if emoji_count:
        result.warnings.append(f"emoji 当图标 ×{emoji_count}：用实景组件替代图标 emoji")
    if RE_HEX.search(css_code):
        result.warnings.append("硬编码颜色：建议改用主题 token")
    if RE_FONT_LITERAL.search(css_code):
        result.warnings.append("硬编码字体：建议改用主题 token")
    if steps is not None and steps > STEPS_SOFT_CAP:
        result.warnings.append(f"步数偏多：本章 {steps} 步（建议 ≤ {STEPS_SOFT_CAP}）")
    if result.material_count == 0:
        result.warnings.append("材质缺失：核心元素建议使用 gradient/shadow/glow 等材质手法")
    if RE_AI_GRADIENT.search(css_code):
        result.warnings.append("AI 味渐变：检测到紫粉/蓝紫系渐变，建议换主题 accent 色")
    return result


def quiz_counts(chapters_dir: Path) -> dict[str, int]:
    registry = chapters_dir.parent / "registry" / "chapters.ts"
    if not registry.is_file():
        return {}
    text = strip_comments(registry.read_text(encoding="utf-8"))
    marks = list(re.finditer(r'id\s*:\s*"([^"]+)"\s*,\s*\n?\s*title', text))
    counts: dict[str, int] = {}
    for index, mark in enumerate(marks):
        end = marks[index + 1].start() if index + 1 < len(marks) else len(text)
        block = text[mark.start():end]
        quiz_block = re.search(r"quizzes\s*:\s*\[(.*?)\]", block, re.DOTALL)
        if quiz_block:
            count = len(re.findall(r"step\s*:", quiz_block.group(1)))
            if count:
                counts[mark.group(1)] = count
    return counts


def has_animejs(chapter_dirs: list[Path]) -> bool:
    return any(
        "animejs" in path.read_text(encoding="utf-8").lower()
        for chapter_dir in chapter_dirs
        for path in chapter_dir.glob("*.tsx")
    )
