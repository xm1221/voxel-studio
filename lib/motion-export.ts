import { clipExportSpanForPlayers } from "./motion.ts";

/**
 * Export options for GIF and MP4. Kept as a small versioned record on the
 * scene so the CLI, `window.pixelstage`, and the studio all read the same
 * values. Defaults are the old small GIF.
 */
export type MotionExportOptions = {
  /** GIF only. Frames per second. */
  fps: number;
  /** GIF only. Long edge in pixels. 480 is the old small default. */
  gifEdge: 480 | 720 | 1080;
  /** MP4 long edge in pixels. */
  mp4Edge: 720 | 1080;
  /** MP4 frames per second. */
  mp4Fps: number;
  /** MP4 bitrate in bits per second. */
  mp4Bitrate: number;
  /** Frame count cap. 0 means "fit the duration" using fps. */
  frames: number;
};

export const DEFAULT_MOTION_EXPORT: MotionExportOptions = {
  fps: 12,
  gifEdge: 480,
  mp4Edge: 720,
  mp4Fps: 24,
  mp4Bitrate: 6_000_000,
  frames: 0,
};

export const MOTION_EXPORT_LIMITS = {
  fps: { min: 6, max: 30 },
  gifEdge: [480, 720, 1080] as const,
  mp4Edge: [720, 1080] as const,
  mp4Fps: { min: 12, max: 60 },
  mp4Bitrate: { min: 1_000_000, max: 24_000_000 },
  frames: { min: 0, max: 240 },
} as const;

/** GIF hard cap: a 1080p 240-frame GIF is too large to encode in one pass. */
export const GIF_MAX_FRAMES = 90;

function int(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function edge(value: unknown, fallback: 480 | 720 | 1080): 480 | 720 | 1080 {
  return value === 1080 ? 1080 : value === 720 ? 720 : value === 480 ? 480 : fallback;
}

function mp4Edge(value: unknown, fallback: 720 | 1080): 720 | 1080 {
  return value === 1080 ? 1080 : value === 720 ? 720 : fallback;
}

export function parseMotionExport(value: unknown): MotionExportOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_MOTION_EXPORT };
  const record = value as Record<string, unknown>;
  return {
    fps: int(record.fps, MOTION_EXPORT_LIMITS.fps.min, MOTION_EXPORT_LIMITS.fps.max, DEFAULT_MOTION_EXPORT.fps),
    gifEdge: edge(record.gifEdge, DEFAULT_MOTION_EXPORT.gifEdge),
    mp4Edge: mp4Edge(record.mp4Edge, DEFAULT_MOTION_EXPORT.mp4Edge),
    mp4Fps: int(record.mp4Fps, MOTION_EXPORT_LIMITS.mp4Fps.min, MOTION_EXPORT_LIMITS.mp4Fps.max, DEFAULT_MOTION_EXPORT.mp4Fps),
    mp4Bitrate: int(
      record.mp4Bitrate,
      MOTION_EXPORT_LIMITS.mp4Bitrate.min,
      MOTION_EXPORT_LIMITS.mp4Bitrate.max,
      DEFAULT_MOTION_EXPORT.mp4Bitrate,
    ),
    frames: int(record.frames, MOTION_EXPORT_LIMITS.frames.min, MOTION_EXPORT_LIMITS.frames.max, DEFAULT_MOTION_EXPORT.frames),
  };
}

export type MotionExportTarget = "gif" | "mp4";

/** Frame plan for one export. Even dimensions keep MP4 encoders happy. */
export function motionFramePlan(
  options: MotionExportOptions,
  target: MotionExportTarget,
  format: { width: number; height: number },
  seconds: number,
): { width: number; height: number; fps: number; frames: number; seconds: number } {
  const longEdge = Math.max(format.width, format.height);
  const wanted = target === "gif" ? options.gifEdge : options.mp4Edge;
  const fps = target === "gif" ? options.fps : options.mp4Fps;
  const scale = Math.min(1, wanted / Math.max(longEdge, 1));
  const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
  const maxFrames = target === "gif" ? GIF_MAX_FRAMES : 240;
  const wantedFrames = options.frames > 0 ? options.frames : Math.round(seconds * fps);
  const frames = Math.min(maxFrames, Math.max(2, wantedFrames));
  return { width: even(format.width), height: even(format.height), fps, frames, seconds };
}

/**
 * Full export plan for a scene: pixel size, fps, frame count, and duration.
 * The frame count comes from the motion itself unless `frames` overrides it,
 * so both the studio and the CLI produce the same clip from the same scene.
 */
export function motionExportPlan(
  players: Parameters<typeof clipExportSpanForPlayers>[0],
  format: { width: number; height: number },
  options: MotionExportOptions,
  target: MotionExportTarget,
): { width: number; height: number; fps: number; frames: number; seconds: number } {
  const fps = target === "gif" ? options.fps : options.mp4Fps;
  const maxFrames = target === "gif" ? GIF_MAX_FRAMES : 240;
  const span = clipExportSpanForPlayers(players, { fps, maxFrames, minFrames: 12 });
  const base = motionFramePlan(options, target, format, span.seconds);
  return { ...base, frames: options.frames > 0 ? base.frames : Math.min(maxFrames, span.frames), seconds: span.seconds };
}
