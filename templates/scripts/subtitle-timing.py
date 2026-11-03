#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(SCRIPT_DIR, "..") if os.path.basename(SCRIPT_DIR) == "scripts" else SCRIPT_DIR
SEGMENTS_FILE = os.path.join(ROOT, "audio-segments.json")
TIMING_FILE = os.path.join(ROOT, "public", "subtitle-timing.json")
WORD_TIMING_DIR = os.path.join(ROOT, "public", "minimax-word-timing")
MAX_CHARS = 55
MIN_MS_CHUNK = 2000
duration_cache = {}


def split_text(text):
    chunks = []
    remaining = text
    while remaining:
        if len(remaining) <= MAX_CHARS:
            chunks.append(remaining)
            break
        cut = MAX_CHARS
        for separator in ("。", "！", "？"):
            position = remaining.rfind(separator, 0, MAX_CHARS)
            if position > MAX_CHARS // 2:
                cut = position + 1
                break
        else:
            for separator in ("，", "；", "："):
                position = remaining.rfind(separator, 0, MAX_CHARS)
                if position > MAX_CHARS // 3:
                    cut = position + 1
                    break
        chunks.append(remaining[:cut])
        remaining = remaining[cut:]
    return chunks


def read_segments():
    with open(SEGMENTS_FILE, encoding="utf-8") as source:
        segments = json.load(source)
    if not isinstance(segments, list):
        raise ValueError(f"{SEGMENTS_FILE} must contain a JSON array")
    return segments


def read_timing():
    try:
        with open(TIMING_FILE, encoding="utf-8") as source:
            timing = json.load(source)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    if not isinstance(timing, dict):
        raise ValueError(f"{TIMING_FILE} must contain a JSON object")
    return timing


def chapters_from(segments, requested):
    if requested:
        return requested
    return list(dict.fromkeys(segment["chapter"] for segment in segments))


def audio_duration(chapter, step):
    key = f"{chapter}/{step}"
    if key in duration_cache:
        return duration_cache[key]
    audio_path = os.path.join(ROOT, "public", "audio", chapter, f"{step}.mp3")
    if not os.path.isfile(audio_path):
        return 0.0
    try:
        output = subprocess.check_output(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", audio_path],
            text=True,
            timeout=5,
        ).strip()
        duration = float(output)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
        return 0.0
    duration_cache[key] = duration
    return duration


def default_chunks(segment):
    chapter = segment["chapter"]
    step = segment["step"]
    text = segment["text"]
    chunks = split_text(text)
    total_ms = int(audio_duration(chapter, step) * 1000)
    if total_ms == 0:
        total_ms = max(4000, len(text) * 300)
    total_chars = sum(len(chunk) for chunk in chunks)
    return [
        {"text": chunk, "ms": max(MIN_MS_CHUNK, int(total_ms * len(chunk) / total_chars))}
        for chunk in chunks
    ]


def fill_default(timing, segments, chapters, selected_steps=None):
    count = 0
    for chapter in chapters:
        chapter_timing = timing.setdefault(chapter, {})
        selected = selected_steps.get(chapter) if selected_steps else None
        for segment in segments:
            if segment["chapter"] != chapter:
                continue
            if selected is not None and segment["step"] not in selected:
                continue
            chapter_timing[str(segment["step"] - 1)] = default_chunks(segment)
            count += 1
    return count


def word_chunks(path):
    with open(path, encoding="utf-8") as source:
        words = json.load(source)
    if not isinstance(words, list) or not words:
        raise ValueError(f"{path} must contain a non-empty JSON array")
    chunks = []
    index = 0
    while index < len(words):
        word = words[index]
        if not isinstance(word, dict):
            raise ValueError(f"{path} contains a non-object word")
        text = word["text"]
        start_ms = word["start_ms"]
        end_ms = word["end_ms"]
        index += 1
        while index < len(words):
            next_word = words[index]
            if not isinstance(next_word, dict):
                raise ValueError(f"{path} contains a non-object word")
            if len(text + next_word["text"]) > MAX_CHARS:
                break
            text += next_word["text"]
            end_ms = next_word["end_ms"]
            index += 1
        chunks.append({"text": text, "ms": max(MIN_MS_CHUNK, end_ms - start_ms)})
    return chunks


def write_timing(timing):
    os.makedirs(os.path.dirname(TIMING_FILE), exist_ok=True)
    with open(TIMING_FILE, "w", encoding="utf-8") as destination:
        json.dump(timing, destination, ensure_ascii=False, indent=2)
        destination.write("\n")


def print_summary(mode, timing):
    steps = sum(len(chapter) for chapter in timing.values())
    chunks = sum(len(chunk) for chapter in timing.values() for chunk in chapter.values())
    print(f"✓ {mode} mode: {len(timing)} chapters, {steps} steps, {chunks} chunks")


def generate_default(requested):
    segments = read_segments()
    timing = read_timing()
    filled = fill_default(timing, segments, chapters_from(segments, requested))
    write_timing(timing)
    print_summary("Default", timing)
    print(f"  default fallback: {filled}")


def generate_minimax(requested, strict):
    segments = read_segments()
    chapters = chapters_from(segments, requested)
    if not os.path.isdir(WORD_TIMING_DIR):
        if strict:
            raise FileNotFoundError(f"word timing directory not found: {WORD_TIMING_DIR}")
        print(f"⚠ Word timing directory not found: {WORD_TIMING_DIR}")
        generate_default(requested)
        return
    timing = read_timing()
    fallback_steps = {}
    used_minimax = 0
    for chapter in chapters:
        chapter_timing = timing.setdefault(chapter, {})
        for segment in segments:
            if segment["chapter"] != chapter:
                continue
            step = segment["step"]
            word_file = os.path.join(WORD_TIMING_DIR, chapter, f"{step}.json")
            try:
                chapter_timing[str(step - 1)] = word_chunks(word_file)
            except (FileNotFoundError, json.JSONDecodeError, KeyError, TypeError, ValueError):
                if strict:
                    raise
                fallback_steps.setdefault(chapter, set()).add(step)
            else:
                used_minimax += 1
    used_default = fill_default(timing, segments, list(fallback_steps), fallback_steps)
    write_timing(timing)
    print_summary("MiniMax", timing)
    print(f"  minimax word-timing: {used_minimax}, default fallback: {used_default}")


def main(argv):
    parser = argparse.ArgumentParser(description="Generate subtitle timing with MiniMax fallback.")
    parser.add_argument("--mode", choices=("default", "minimax"), default="minimax")
    parser.add_argument("--strict-minimax", action="store_true")
    parser.add_argument("--chapters", nargs="*", default=[])
    args = parser.parse_args(argv)
    if args.mode == "default" and args.strict_minimax:
        parser.error("--strict-minimax cannot be used with --mode default")
    if args.mode == "default":
        generate_default(args.chapters or None)
    else:
        generate_minimax(args.chapters or None, args.strict_minimax)


if __name__ == "__main__":
    main(sys.argv[1:])
