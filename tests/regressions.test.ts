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

function streamText(stream: ReadableStream<Uint8Array> | number | undefined): Promise<string> {
  if (typeof stream === "number" || stream === undefined) return Promise.resolve("");
  return new Response(stream).text();
}

async function output(process: Bun.Subprocess): Promise<{
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const [exitCode, stderr, stdout] = await Promise.all([
    process.exited,
    streamText(process.stderr),
    streamText(process.stdout),
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
  await cp(join(repository, "templates", "scripts", "record.js"), join(fixture, "record.js"));
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
            locator(selector) {
              if (selector !== ".auto-gate") throw new Error("unexpected locator");
              return {
                async isVisible() { return true; },
                async click() { await writeFile(process.env.COURSE_FORGE_GATE_CLICKED, "clicked"); },
                async waitFor(options) {
                  if (options.state !== "hidden") throw new Error("gate must become hidden");
                },
              };
            },
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
  const gateClicked = join(fixture, "gate-clicked.txt");
  const result = await output(Bun.spawn([
    process.execPath, join(fixture, "record.js"),
    "--headless", "--url", "http://127.0.0.1:1", "--duration", "0",
    "--out", join(outputDirectory, "final.mp4"),
  ], {
    env: {
      ...Bun.env,
      COURSE_FORGE_FFMPEG_INPUT: selected,
      COURSE_FORGE_GATE_CLICKED: gateClicked,
      PATH: `${bin}:${Bun.env.PATH}`,
    },
    stderr: "pipe", stdout: "pipe",
  }));
  expect(result.exitCode, result.stderr).toBe(0);
  expect(await readFile(gateClicked, "utf8")).toBe("clicked");
  expect((await readFile(selected, "utf8")).trim()).toEndWith("a-current.webm");
  expect(await readFile(join(outputDirectory, "z-previous.webm"), "utf8")).toBe("previous");
  expect(await readFile(join(outputDirectory, "final.mp4"), "utf8")).toBe("current");
});

test("audio compression preserves non-MP3 assets", async () => {
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

test("TTS help command exits successfully", async () => {
  const result = await output(Bun.spawn([
    "bash", join(repository, "templates", "scripts", "synthesize-audio.sh"), "--help",
  ], { stderr: "pipe", stdout: "pipe" }));
  expect(result.exitCode, result.stderr).toBe(0);
});

test("TTS rejects provider path traversal before sourcing it", async () => {
  const result = await output(Bun.spawn([
    "bash", join(repository, "templates", "scripts", "synthesize-audio.sh"), "--provider=../../payload",
  ], { stderr: "pipe", stdout: "pipe" }));

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("invalid TTS provider name");
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

test("scaffold creates a frozen installable project with its JSON guard", async () => {
  const fixture = join(root, "scaffold");
  const result = await output(Bun.spawn([
    "bash", join(repository, "scripts", "scaffold.sh"), fixture, "--theme=blueprint",
  ], { stderr: "pipe", stdout: "pipe" }));

  expect(result.exitCode, result.stderr).toBe(0);
  const packageJson = JSON.parse(await readFile(join(fixture, "package.json"), "utf8"));
  expect(packageJson.dependencies.animejs).toBe("4.4.1");
  expect(await Bun.file(join(fixture, "bun.lock")).exists()).toBe(true);
  expect(await Bun.file(join(fixture, "scripts", "record.js")).exists()).toBe(true);
  const guard = await output(Bun.spawn([
    "bash", join(fixture, "scripts", "check-course-json-sync.sh"),
  ], { cwd: fixture, stderr: "pipe", stdout: "pipe" }));
  expect(guard.exitCode, guard.stderr).toBe(0);
  expect(await readFile(join(fixture, "src", "styles", "tokens.css"), "utf8"))
    .toBe(await readFile(join(repository, "themes", "blueprint", "tokens.css"), "utf8"));
});

test("subtitle timing falls back per missing step unless MiniMax is strict", async () => {
  const fixture = join(root, "subtitle-timing");
  const scriptDirectory = join(fixture, "scripts");
  await mkdir(join(fixture, "public", "minimax-word-timing", "chapter"), { recursive: true });
  await mkdir(scriptDirectory, { recursive: true });
  await cp(join(repository, "templates", "scripts", "subtitle-timing.py"), join(scriptDirectory, "subtitle-timing.py"));
  await writeFile(join(fixture, "audio-segments.json"), JSON.stringify([
    { chapter: "chapter", step: 1, text: "first", audio: "chapter/1.mp3" },
    { chapter: "chapter", step: 2, text: "second", audio: "chapter/2.mp3" },
  ]));
  await writeFile(join(fixture, "public", "minimax-word-timing", "chapter", "1.json"), JSON.stringify([
    { text: "first", start_ms: 0, end_ms: 300 },
  ]));

  const fallback = await output(Bun.spawn([
    "python3", join(scriptDirectory, "subtitle-timing.py"), "--chapters", "chapter",
  ], { cwd: fixture, stderr: "pipe", stdout: "pipe" }));
  expect(fallback.exitCode, fallback.stderr).toBe(0);
  const timing = JSON.parse(await readFile(join(fixture, "public", "subtitle-timing.json"), "utf8"));
  expect(timing.chapter["0"][0].text).toBe("first");
  expect(timing.chapter["1"][0].text).toBe("second");

  const strict = await output(Bun.spawn([
    "python3", join(scriptDirectory, "subtitle-timing.py"), "--strict-minimax", "--chapters", "chapter",
  ], { cwd: fixture, stderr: "pipe", stdout: "pipe" }));
  expect(strict.exitCode).not.toBe(0);
});
