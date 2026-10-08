import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repository = new URL("../", import.meta.url).pathname;
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "course-forge-regressions-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function executable(path: string, source: string): Promise<void> {
  await writeFile(path, source);
  await chmod(path, 0o755);
}

async function output(process: Bun.Subprocess): Promise<{
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const [exitCode, stderr, stdout] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

test("recording converts only the video created by its page", async () => {
  const fixture = join(root, "record");
  const outputDirectory = join(fixture, "output");
  const bin = join(fixture, "bin");
  const playwright = join(fixture, "node_modules", "playwright");
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(bin);
  await mkdir(playwright, { recursive: true });
  await cp(join(repository, "scripts", "record.js"), join(fixture, "record.js"));
  await writeFile(join(outputDirectory, "z-previous.webm"), "previous");
  await writeFile(join(playwright, "package.json"), JSON.stringify({
    name: "playwright", type: "module", exports: "./index.js",
  }));
  await writeFile(join(playwright, "index.js"), `
    import { writeFile } from "node:fs/promises";
    import { join } from "node:path";
    export const chromium = { async launch() { return {
      async newContext(options) {
        const videoPath = join(options.recordVideo.dir, "a-current.webm");
        return {
          async newPage() { return {
            async goto() {},
            video() { return { async path() { return videoPath; } }; },
          }; },
          async close() { await writeFile(videoPath, "current"); },
        };
      },
      async close() {},
    }; } };
  `);
  await executable(join(bin, "ffmpeg"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$3" > "$COURSE_FORGE_FFMPEG_INPUT"
for last; do :; done
cp "$3" "$last"
`);
  const selected = join(fixture, "selected.txt");
  const result = await output(Bun.spawn([
    process.execPath, join(fixture, "record.js"),
    "--headless", "--url", "http://127.0.0.1:1", "--duration", "1",
    "--out", join(outputDirectory, "final.mp4"),
  ], {
    env: { ...Bun.env, COURSE_FORGE_FFMPEG_INPUT: selected, PATH: `${bin}:${Bun.env.PATH}` },
    stderr: "pipe", stdout: "pipe",
  }));
  expect(result.exitCode, result.stderr).toBe(0);
  expect((await readFile(selected, "utf8")).trim()).toEndWith("a-current.webm");
  expect(await readFile(join(outputDirectory, "z-previous.webm"), "utf8")).toBe("previous");
  expect(await readFile(join(outputDirectory, "final.mp4"), "utf8")).toBe("current");
});

test("audio compression preserves non-MP3 assets on macOS-compatible tools", async () => {
  const fixture = join(root, "compress");
  const audio = join(fixture, "audio");
  const bin = join(fixture, "bin");
  await mkdir(audio, { recursive: true });
  await mkdir(bin);
  await writeFile(join(audio, "1.mp3"), "original");
  await writeFile(join(audio, "keep.json"), "metadata");
  await executable(join(bin, "ffmpeg"), `#!/usr/bin/env bash
set -euo pipefail
for last; do :; done
printf compressed > "$last"
`);
  const result = await output(Bun.spawn([
    "bash", join(repository, "templates", "scripts", "compress-audio.sh"),
    "--dir", audio, "--level", "2",
  ], {
    cwd: fixture,
    env: { ...Bun.env, PATH: `${bin}:${Bun.env.PATH}` },
    stdin: new Blob(["y\n"]), stderr: "pipe", stdout: "pipe",
  }));

  expect(result.exitCode, result.stderr).toBe(0);
  expect(await readFile(join(audio, "1.mp3"), "utf8")).toBe("compressed");
  expect(await readFile(join(audio, "keep.json"), "utf8")).toBe("metadata");
});

test("TTS help runs on macOS without Git Bash pwd", async () => {
  const result = await output(Bun.spawn([
    "bash", join(repository, "templates", "scripts", "synthesize-audio.sh"), "--help",
  ], { stderr: "pipe", stdout: "pipe" }));
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toContain("provider-agnostic TTS runner");
});

test("course regeneration keeps project-root JSON as the only source", async () => {
  const fixture = join(root, "regenerate");
  await mkdir(join(fixture, "public"), { recursive: true });
  await mkdir(join(fixture, "src"));
  await writeFile(join(fixture, "package.json"), "{}");
  await writeFile(join(fixture, "course.json"), '{"title":"Course","courseId":"c","outlineSegments":[]}');
  const result = await output(Bun.spawn([
    "python3", join(repository, "templates", "scripts", "regenerate-course-json.py"),
    "--project", fixture,
  ], { stderr: "pipe", stdout: "pipe" }));

  expect(result.exitCode, result.stderr).toBe(0);
  expect(await Bun.file(join(fixture, "public", "course.json")).exists()).toBe(false);
  expect(JSON.parse(await readFile(join(fixture, "course.json"), "utf8"))).toMatchObject({ courseId: "c" });
});

test("scaffold starts with no references to removed example chapters", async () => {
  const source = await readFile(join(repository, "scripts", "scaffold.sh"), "utf8");
  const match = source.match(/cat > course\.json <<'JSON'\n([\s\S]*?)\nJSON/);
  expect(match).not.toBeNull();
  const course: unknown = JSON.parse(match?.[1] ?? "null");
  expect(course).toEqual({ courseId: "course", title: "待命名课程", outlineSegments: [] });
});
