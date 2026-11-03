#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import { existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 5174;
const DEFAULT_DURATION_SECONDS = 300;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    chapter: 0,
    dev: false,
    duration: undefined,
    headless: false,
    outFile: join(process.cwd(), "course-recording.mp4"),
    resolution: "1920x1080",
    url: "",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--headless") options.headless = true;
    else if (argument === "--dev") options.dev = true;
    else if (argument === "--out") options.outFile = args[++index] ?? fail("--out needs a file path");
    else if (argument === "--chapter") options.chapter = Number.parseInt(args[++index] ?? "", 10);
    else if (argument === "--duration") options.duration = Number.parseInt(args[++index] ?? "", 10);
    else if (argument === "--resolution") options.resolution = args[++index] ?? fail("--resolution needs WIDTHxHEIGHT");
    else if (argument === "--url") options.url = args[++index] ?? fail("--url needs an address");
    else if (argument === "-h" || argument === "--help") {
      console.log("Usage: bun run record -- [options]");
      console.log("  --dev                 start the local Vite server on 127.0.0.1:5174");
      console.log("  --url URL             record an existing course URL");
      console.log("  --out FILE            output .mp4 or .webm file (default: course-recording.mp4)");
      console.log("  --headless            run Chromium without a visible window");
      console.log("  --duration SECONDS    recording duration (default: 300; 0 is a smoke run)");
      console.log("  --resolution WIDTHxHEIGHT (default: 1920x1080)");
      process.exit(0);
    } else fail(`unknown option: ${argument}`);
  }
  if (!Number.isInteger(options.chapter) || options.chapter < 0) fail("--chapter must be a non-negative integer");
  if (options.duration !== undefined && (!Number.isInteger(options.duration) || options.duration < 0)) {
    fail("--duration must be a non-negative integer");
  }
  const resolution = options.resolution.match(/^(\d+)x(\d+)$/);
  if (!resolution) fail("--resolution must use WIDTHxHEIGHT");
  return { ...options, height: Number(resolution[2]), width: Number(resolution[1]) };
}

function runningUrl(options) {
  if (options.url) return options.url;
  if (process.env.RECORD_URL) return process.env.RECORD_URL;
  if (!options.dev) fail("pass --dev or --url");
  return `http://127.0.0.1:${DEFAULT_PORT}/?auto=1&recording=1&chapter=${options.chapter}`;
}

async function urlResponds(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function startDevServer(url) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const child = spawn(process.execPath, ["run", "dev"], {
    cwd: resolve(scriptDirectory, ".."),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [child.stdout, child.stderr];
  return new Promise((resolveReady, rejectReady) => {
    const deadline = setTimeout(() => rejectReady(new Error(`Vite did not start for ${url}`)), 15_000);
    const finish = (error) => {
      clearTimeout(deadline);
      child.stdout.removeAllListeners("data");
      child.stderr.removeAllListeners("data");
      child.removeAllListeners("error");
      child.removeAllListeners("exit");
      error ? rejectReady(error) : resolveReady(child);
    };
    child.once("error", finish);
    child.once("exit", (code) => finish(new Error(`Vite exited before recording (status ${code ?? "signal"})`)));
    for (const stream of output) {
      stream.on("data", (chunk) => {
        if (chunk.toString().includes(`http://127.0.0.1:${DEFAULT_PORT}/`)) finish();
      });
    }
  });
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise((resolveStopped) => server.once("exit", resolveStopped));
}

function convertVideo(webmPath, outFile) {
  if (!outFile.endsWith(".mp4")) {
    renameSync(webmPath, outFile);
    return;
  }
  const conversion = spawnSync("ffmpeg", [
    "-y", "-i", webmPath,
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-pix_fmt", "yuv420p", outFile,
  ], { stdio: "inherit" });
  if (conversion.error) throw conversion.error;
  if (conversion.status !== 0) throw new Error(`ffmpeg exited with status ${conversion.status}`);
  unlinkSync(webmPath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = runningUrl(options);
  let server;
  try {
    if (options.dev && !(await urlResponds(url))) server = await startDevServer(url);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: options.headless });
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      recordVideo: { dir: dirname(options.outFile), size: { width: options.width, height: options.height } },
    });
    try {
      const page = await context.newPage();
      const video = page.video();
      if (!video) throw new Error("Playwright video recording is unavailable");
      await page.goto(url, { waitUntil: "networkidle" });
      const autoGate = page.locator(".auto-gate");
      if (await autoGate.isVisible()) {
        await autoGate.click();
        await autoGate.waitFor({ state: "hidden" });
      }
      if (options.duration !== 0) {
        await new Promise((resolveRecorded) => setTimeout(resolveRecorded, (options.duration ?? DEFAULT_DURATION_SECONDS) * 1000));
      }
      await context.close();
      convertVideo(await video.path(), options.outFile);
      if (!existsSync(options.outFile)) throw new Error(`recording was not written: ${options.outFile}`);
      console.log(`✓ recording complete: ${options.outFile} (${(statSync(options.outFile).size / 1024 / 1024).toFixed(1)} MB)`);
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
