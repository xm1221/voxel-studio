#!/usr/bin/env node
/**
 * Headless renderer for Pixelstage scene documents.
 *
 *   npm run render -- scene.json --out poster.png
 *   npm run render -- scene.json --out clip.mp4 --fps 30 --edge 1080
 *   npm run render -- scene.json --out clip.gif --frames 24
 *
 * The script boots the Next app on a free local port, opens /render in headless
 * Chrome (SwiftShader for WebGL), hands the scene to `window.pixelstage`, and
 * writes the bytes the page produces. All rendering happens in the page; this
 * file only moves files and parses arguments.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const USAGE = `Usage: npm run render -- <scene.json> --out <file> [options]

Output type comes from the --out extension: .png, .gif, or .mp4.

Options:
  --out <file>        Output path. Required.
  --format <id>       Export size id: avatar, square, xhs, youtube, story,
                      desktop, banner, uhd. Default: the scene's export.format.
  --width <px>        Explicit width (overrides --format).
  --height <px>       Explicit height (overrides --format).
  --fps <n>           GIF frames per second (default 12) or MP4 frame rate
                      when the output is .mp4 (default 24).
  --edge <px>         Long edge in pixels. GIF: 480/720/1080. MP4: 720/1080.
  --frames <n>        Exact frame count. Default: derived from the motion.
  --seconds <n>       Clip length. Default: derived from the motion.
  --bitrate <bps>     MP4 bitrate. Default 6000000.
  --transparent       Transparent background (PNG and GIF).
  --round             Round avatar crop.
  --port <n>          Port for the local server. Default: a free port.
  --url <url>         Use an already running server instead of starting one.
  --chrome <path>     Chrome/Chromium binary.
  --keep-open         Leave the browser and server running (debugging).
  --json              Print a JSON result instead of a human summary.
  -h, --help          Show this help.

The scene is a v2 scene document (see examples/scenes/ and
schema/pixelstage.scene.schema.json). A v1 keyframe animation file is accepted
too and rendered as a one-avatar scene.`;

function fail(message) {
  process.stderr.write(`render: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { flags: new Set(), strings: new Map() };
  const valueFlags = new Set([
    "out",
    "format",
    "width",
    "height",
    "fps",
    "edge",
    "frames",
    "seconds",
    "bitrate",
    "port",
    "url",
    "chrome",
  ]);
  const boolFlags = new Set(["transparent", "round", "keep-open", "json", "help", "h"]);
  let file = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const [rawName, inline] = arg.slice(2).split("=", 2);
      if (boolFlags.has(rawName)) {
        options.flags.add(rawName === "h" ? "help" : rawName);
        continue;
      }
      if (!valueFlags.has(rawName)) fail(`unknown option --${rawName}`);
      const value = inline ?? argv[index + 1];
      if (value === undefined || (inline === undefined && value.startsWith("--"))) fail(`--${rawName} needs a value`);
      options.strings.set(rawName, value);
      if (inline === undefined) index += 1;
      continue;
    }
    if (file) fail(`unexpected argument "${arg}" (scene file already set to ${file})`);
    file = arg;
  }
  return { file, ...options };
}

function numberOption(strings, name, min, max) {
  const raw = strings.get(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`--${name} needs a number`);
  if (value < min || value > max) fail(`--${name} must be between ${min} and ${max}`);
  return value;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolvePort(port) : reject(new Error("no free port"))));
    });
  });
}

function waitForServer(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolveReady, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url, { redirect: "manual" });
        if (response.status < 500) return resolveReady();
      } catch {
        // Still booting.
      }
      if (Date.now() - started > timeoutMs) return reject(new Error(`server did not answer on ${url}`));
      setTimeout(() => void tick(), 250);
    };
    void tick();
  });
}

/**
 * The production build may be compiled with a basePath (`/mcrender` on the live
 * site). Read it from the build manifest so the CLI works with either build.
 */
function builtBasePath() {
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, ".next", "routes-manifest.json"), "utf8"));
    const value = typeof manifest.basePath === "string" ? manifest.basePath.replace(/\/$/, "") : "";
    return value === "/" ? "" : value;
  } catch {
    return "";
  }
}

async function firstReachable(urls) {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.status < 400) return url;
    } catch {
      // Try the next candidate.
    }
  }
  return urls[urls.length - 1];
}

function chromePath(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  fail("could not find Chrome. Pass --chrome /path/to/chrome or set CHROME_PATH.");
}

async function startServer(port, log) {
  const child = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const collect = (chunk) => {
    output += chunk.toString();
    if (log) process.stderr.write(chunk);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.on("exit", (code) => {
    if (code && code !== 0) process.stderr.write(`render: next start exited with ${code}\n${output}\n`);
  });
  return child;
}

function dataUrlToBuffer(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("page returned a malformed data URL");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

const args = parseArgs(process.argv.slice(2));
if (args.flags.has("help")) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
if (!args.file) fail("missing scene file. Try: npm run render -- examples/scenes/hero-square.json --out poster.png");
const outPath = args.strings.get("out");
if (!outPath) fail("missing --out. Try --out poster.png");

const scenePath = isAbsolute(args.file) ? args.file : resolve(process.cwd(), args.file);
if (!existsSync(scenePath)) fail(`scene file not found: ${scenePath}`);
let scene;
try {
  scene = JSON.parse(readFileSync(scenePath, "utf8"));
} catch (error) {
  fail(`could not parse ${scenePath}: ${error instanceof Error ? error.message : String(error)}`);
}

const extension = extname(outPath).toLowerCase();
if (![".png", ".gif", ".mp4"].includes(extension)) fail("--out must end in .png, .gif, or .mp4");

const fps = numberOption(args.strings, "fps", 1, 120);
const width = numberOption(args.strings, "width", 16, 8192);
const height = numberOption(args.strings, "height", 16, 8192);
if ((width === undefined) !== (height === undefined)) fail("--width and --height go together");
const edge = numberOption(args.strings, "edge", 16, 8192);
const frames = numberOption(args.strings, "frames", 1, 240);
const seconds = numberOption(args.strings, "seconds", 0.1, 60);
const bitrate = numberOption(args.strings, "bitrate", 100_000, 50_000_000);

const port = args.strings.has("url") ? null : numberOption(args.strings, "port", 1024, 65_535) ?? (await freePort());
const baseUrl = args.strings.get("url") ?? `http://127.0.0.1:${port}`;
const basePath = builtBasePath();
const log = process.env.PIXELSTAGE_RENDER_VERBOSE === "1";

let server = null;
if (!args.strings.has("url")) {
  server = await startServer(port, log);
  try {
    await waitForServer(`${baseUrl}${basePath}/`, 60_000);
  } catch (error) {
    server.kill("SIGTERM");
    fail(`${error instanceof Error ? error.message : String(error)}\nDid you run \`npm run build\` first?`);
  }
}

const browser = await chromium.launch({
  executablePath: chromePath(args.strings.get("chrome")),
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--mute-audio",
    "--force-color-profile=srgb",
  ],
});

let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => process.stderr.write(`render: page error: ${error.message}\n`));
  page.on("console", (message) => {
    if (message.type() === "error" || log) process.stderr.write(`render: console.${message.type()}: ${message.text()}\n`);
  });
  page.on("requestfailed", (request) => process.stderr.write(`render: request failed: ${request.url()}\n`));
  // A build may or may not carry a basePath. Try the built one first, then the
  // bare path, so the CLI works against `next dev` too.
  const renderUrl = await firstReachable([
    `${baseUrl}${basePath}/render`,
    `${baseUrl}/render`,
  ]);
  await page.goto(renderUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => window.__pixelstageRender?.ready === true || window.__pixelstageRender?.error, null, {
    timeout: 90_000,
  });
  const boot = await page.evaluate(() => window.__pixelstageRender ?? { ready: false, error: "missing" });
  if (!boot.ready) throw new Error(`render page failed: ${boot.error}`);

  const loaded = await page.evaluate(async (input) => {
    const api = window.pixelstage;
    if (!api) return { ok: false, warnings: [], errors: [{ path: "", message: "window.pixelstage missing" }] };
    return api.loadScene(input);
  }, scene);
  if (!loaded.ok) {
    const details = (loaded.errors ?? []).map((issue) => `${issue.path || "<root>"}: ${issue.message}`).join("\n  ");
    throw new Error(`scene rejected:\n  ${details}`);
  }
  for (const warning of loaded.warnings ?? []) process.stderr.write(`render: warning: ${warning}\n`);

  const sizeInput = {
    ...(width && height ? { width, height } : {}),
    ...(args.strings.get("format") ? { format: args.strings.get("format") } : {}),
  };
  const started = Date.now();
  let result;
  if (extension === ".png") {
    result = await page.evaluate(
      async ({ size, transparent, round }) => {
        const api = window.pixelstage;
        return api.exportPNG({ ...size, transparent, round });
      },
      { size: sizeInput, transparent: args.flags.has("transparent"), round: args.flags.has("round") },
    );
  } else if (extension === ".gif") {
    result = await page.evaluate(
      async ({ size, frames: frameCount, seconds: clipSeconds, fps: rate, edge: longEdge, transparent }) => {
        const api = window.pixelstage;
        return api.exportGIF({
          ...size,
          ...(frameCount === undefined ? {} : { frames: frameCount }),
          ...(clipSeconds === undefined ? {} : { seconds: clipSeconds }),
          ...(rate === undefined ? {} : { fps: rate }),
          ...(longEdge === undefined ? {} : { longEdge }),
          transparent,
        });
      },
      {
        size: sizeInput,
        frames,
        seconds,
        fps,
        edge,
        transparent: args.flags.has("transparent"),
      },
    );
  } else {
    result = await page.evaluate(
      async ({ size, frames: frameCount, seconds: clipSeconds, fps: rate, edge: longEdge, bitrate: bits }) => {
        const api = window.pixelstage;
        return api.exportMP4({
          ...size,
          ...(frameCount === undefined ? {} : { frames: frameCount }),
          ...(clipSeconds === undefined ? {} : { seconds: clipSeconds }),
          ...(rate === undefined ? {} : { fps: rate }),
          ...(longEdge === undefined ? {} : { longEdge }),
          ...(bits === undefined ? {} : { bitrate: bits }),
        });
      },
      { size: sizeInput, frames, seconds, fps, edge, bitrate },
    );
  }
  const elapsed = Date.now() - started;
  const bytes = dataUrlToBuffer(result.dataUrl);
  const absoluteOut = isAbsolute(outPath) ? outPath : resolve(process.cwd(), outPath);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, bytes);

  const summary = {
    out: absoluteOut,
    kind: extension.slice(1),
    mime: result.mime,
    width: result.width,
    height: result.height,
    bytes: bytes.length,
    ms: elapsed,
    ...(result.frames ? { frames: result.frames, fps: result.fps, seconds: Number(result.seconds?.toFixed?.(3) ?? result.seconds) } : {}),
    warnings: loaded.warnings ?? [],
  };
  if (args.flags.has("json")) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } else {
    const clip = summary.frames ? `, ${summary.frames} frames @ ${summary.fps}fps (${summary.seconds}s)` : "";
    process.stdout.write(`render: ${absoluteOut} — ${result.width}×${result.height}${clip}, ${(bytes.length / 1024).toFixed(1)} KB, ${elapsed} ms\n`);
  }
} catch (error) {
  process.stderr.write(`render: ${error instanceof Error ? error.message : String(error)}\n`);
  exitCode = 1;
} finally {
  if (!args.flags.has("keep-open")) {
    await browser.close().catch(() => undefined);
    server?.kill("SIGTERM");
  }
}

process.exit(exitCode);
