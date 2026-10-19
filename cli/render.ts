import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectFile } from "../lib/project.ts";

export type RenderOptions = {
  project: ProjectFile;
  out: string;
  fps: number;
  seconds: number;
  width: number;
  height: number;
  url: string;
  gif: boolean;
  mp4: boolean;
  webm: boolean;
};

function chromePath() {
  return process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
}

export async function renderProject(options: RenderOptions) {
  const puppeteer = await import("puppeteer-core");
  const fps = Math.min(30, Math.max(1, Math.round(options.fps) || 12));
  const seconds = Math.min(8, Math.max(0.2, options.seconds || 1));
  const frames = Math.max(2, Math.round(fps * seconds));
  const width = Math.min(1280, Math.max(16, options.width || 320));
  const height = Math.min(1280, Math.max(16, options.height || 180));
  mkdirSync(options.out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: Math.max(width, 640), height: Math.max(height, 480) });
    const target = new URL("/render", options.url).toString();
    await page.goto(target, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForFunction("window.__pixelstageReady === true", { timeout: 30_000 });
    await page.evaluate(async (project) => {
      const api = (window as unknown as { __pixelstage: { load: (value: unknown) => Promise<void> } }).__pixelstage;
      await api.load(project);
    }, options.project);
    const pngs: Buffer[] = [];
    for (let index = 0; index < frames; index += 1) {
      const time = (index / frames) * seconds;
      const dataUrl = await page.evaluate(async (frame: { time: number; width: number; height: number }) => {
        const api = (window as unknown as { __pixelstage: { png: (time: number, width: number, height: number) => Promise<string> } }).__pixelstage;
        return api.png(frame.time, frame.width, frame.height);
      }, { time, width, height });
      const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      const name = join(options.out, `frame-${String(index).padStart(4, "0")}.png`);
      writeFileSync(name, png);
      pngs.push(png);
    }
    const pattern = join(options.out, "frame-%04d.png");
    if (options.mp4) ffmpeg(["-y", "-framerate", String(fps), "-i", pattern, "-pix_fmt", "yuv420p", join(options.out, "render.mp4")]);
    if (options.webm) ffmpeg(["-y", "-framerate", String(fps), "-i", pattern, "-c:v", "libvpx-vp9", "-b:v", "1M", join(options.out, "render.webm")]);
    if (options.gif) ffmpeg(["-y", "-framerate", String(fps), "-i", pattern, join(options.out, "render.gif")]);
    return { frames: pngs.length, pngs };
  } finally {
    await browser.close();
  }
}

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error("ffmpeg failed");
}
