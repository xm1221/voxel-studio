import { formatById, type ExportFormat } from "./formats.ts";
import { motionExportPlan, parseMotionExport, type MotionExportOptions } from "./motion-export.ts";
import { parsePosterText, type PosterText } from "./poster.ts";
import type { SceneDraft } from "./types.ts";

/** A size is either a named format or an explicit pixel box. */
export type SizeInput = {
  format?: string;
  width?: number;
  height?: number;
};

export function resolveFormat(scene: Pick<SceneDraft, "formatId"> | null, input?: SizeInput): ExportFormat {
  if (input?.width && input.height) {
    const width = Math.min(8192, Math.max(16, Math.round(input.width)));
    const height = Math.min(8192, Math.max(16, Math.round(input.height)));
    return { id: "custom", name: "Custom", detail: `${width}×${height}`, width, height, round: false };
  }
  return formatById(input?.format ?? scene?.formatId ?? "youtube");
}

export function mergeMotionExport(current: MotionExportOptions, input?: Partial<MotionExportOptions> | null): MotionExportOptions {
  if (!input) return { ...current };
  return parseMotionExport({ ...current, ...input });
}

export type ExportTarget = "png" | "gif" | "mp4";

/** What an export call can override. Omitted fields come from the scene. */
export type PlanExportInput = SizeInput & {
  /** GIF long edge (480, 720, 1080) or MP4 long edge (720, 1080). Anything else falls back to that target's default. */
  longEdge?: number;
  fps?: number;
  frames?: number;
  seconds?: number;
  bitrate?: number;
  transparent?: boolean;
  round?: boolean;
  /** Motion block already chosen in the studio or parsed from the scene. */
  motion?: Partial<MotionExportOptions> | null;
};

export type ExportPlan = {
  target: ExportTarget;
  formatId: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  seconds: number;
  bitrate: number;
  transparent: boolean;
  round: boolean;
  filename: string;
  mime: string;
};

const EXPORT_MIME: Record<ExportTarget, string> = {
  png: "image/png",
  gif: "image/gif",
  mp4: "video/mp4",
};

/** Empty stage (no sky, no uploaded plate) is what the studio exports with alpha. */
export function stageIsTransparent(scene: Pick<SceneDraft, "background" | "backgroundImage"> | null): boolean {
  return Boolean(scene && scene.background === "none" && !scene.backgroundImage);
}

function exportWho(scene: SceneDraft | null) {
  const player = scene?.players.find((item) => item.id === scene.activeId) ?? scene?.players[0];
  const raw = (player?.name || "skin")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return raw || "skin";
}

function exportFilename(scene: SceneDraft | null, format: ExportFormat, target: ExportTarget, transparent: boolean) {
  const who = exportWho(scene);
  if (target === "png") return `pixelstage-${who}-${transparent ? "transparent" : format.id}.png`;
  const active = scene?.players.find((item) => item.id === scene.activeId) ?? scene?.players[0];
  const label = scene && scene.players.length > 1 ? "players" : active?.clip || "clip";
  const safe = label.toLowerCase().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "clip";
  return `pixelstage-${who}-${safe}.${target}`;
}

/**
 * Single export plan for the studio download buttons, `window.pixelstage`,
 * and the render CLI. Size, frame count, fps, filename, and transparency all
 * come from here so PNG, GIF, and MP4 stop hand-rolling their own numbers.
 */
export function planExport(scene: SceneDraft | null, input: PlanExportInput | null | undefined, target: ExportTarget): ExportPlan {
  const request = input ?? {};
  const format = resolveFormat(scene, request);
  const motion = mergeMotionExport(parseMotionExport(request.motion ?? null), {
    ...(request.fps === undefined ? {} : target === "mp4" ? { mp4Fps: request.fps } : { fps: request.fps }),
    ...(request.frames === undefined ? {} : { frames: request.frames }),
    ...(request.bitrate === undefined ? {} : { mp4Bitrate: request.bitrate }),
    ...(request.longEdge === undefined
      ? {}
      : target === "mp4"
        ? { mp4Edge: request.longEdge as MotionExportOptions["mp4Edge"] }
        : { gifEdge: request.longEdge as MotionExportOptions["gifEdge"] }),
  });
  const transparent = request.transparent === undefined ? false : Boolean(request.transparent);
  let width = format.width;
  let height = format.height;
  let fps = 1;
  let frames = 1;
  let seconds = 0;
  if (target === "gif" || target === "mp4") {
    const planned = motionExportPlan(scene?.players ?? [], format, motion, target);
    width = planned.width;
    height = planned.height;
    fps = planned.fps;
    frames = planned.frames;
    seconds = request.seconds ?? planned.seconds;
  }
  const round = target === "mp4" ? false : request.round !== undefined ? Boolean(request.round) : transparent ? false : format.round;
  return {
    target,
    formatId: format.id,
    width,
    height,
    fps,
    frames,
    seconds,
    bitrate: motion.mp4Bitrate,
    transparent,
    round,
    filename: exportFilename(scene, format, target, transparent),
    mime: EXPORT_MIME[target],
  };
}

/** Poster text for an export. `undefined` keeps it, `null` suppresses it. */
export function exportPoster(current: PosterText, input: Partial<PosterText> | null | undefined): PosterText | null {
  if (input === null) return null;
  if (input === undefined) return current;
  return parsePosterText({ ...current, ...input });
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("err.fileRead"));
    reader.readAsDataURL(blob);
  });
}

