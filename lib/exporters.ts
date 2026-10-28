import { formatById, type ExportFormat } from "./formats.ts";
import { motionExportPlan, parseMotionExport, type MotionExportOptions, type MotionExportTarget } from "./motion-export.ts";
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

export type ExportPlan = {
  width: number;
  height: number;
  fps: number;
  frames: number;
  seconds: number;
};

export function planMotion(
  scene: SceneDraft | null,
  format: ExportFormat,
  options: MotionExportOptions,
  target: MotionExportTarget,
): ExportPlan {
  const players = scene?.players ?? [];
  return motionExportPlan(players, { width: format.width, height: format.height }, options, target);
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

/** A filename that survives every OS: lowercase ASCII, no runs of dashes. */
export function exportName(scene: SceneDraft | null, format: ExportFormat, extension: string) {
  const who = (scene?.players.find((player) => player.id === scene.activeId)?.name || scene?.players[0]?.name || "skin")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const clip = scene?.players.length && scene.players.length > 1 ? "players" : scene?.players[0]?.clip ?? "clip";
  return `pixelstage-${who || "skin"}-${clip}-${format.id}.${extension}`;
}
