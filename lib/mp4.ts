import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } from "mediabunny";
import { code } from "./i18n";
import { renderMotionFrames, type CaptureHost } from "./capture";
import type { PosterText } from "./poster";

export type Mp4Options = {
  width: number;
  height: number;
  /** Frames per second. */
  fps: number;
  /** Total frames to render. */
  frames: number;
  /** Seconds of animation covered by the whole clip. */
  seconds: number;
  bitrate: number;
  poster?: PosterText | null;
  transparent?: boolean;
  /** Show 0–100. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

/** Available codecs in order of preference. H.264 plays everywhere. */
const CODECS = ["avc", "vp9", "av1"] as const;

export function webCodecsSupported() {
  return typeof window !== "undefined" && typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === "function";
}

async function pickCodec(width: number, height: number, fps: number, bitrate: number) {
  for (const codec of CODECS) {
    const ok = await canEncodeVideo(codec, { width, height, frameRate: fps, bitrate });
    if (ok) return codec;
  }
  return null;
}

/**
 * Encode a deterministic MP4 with the same per-frame renderer the GIF uses.
 * Nothing here records the screen: every frame is posed at an exact time, so
 * the file comes out the same on a slow machine as on a fast one.
 */
export async function captureMp4(host: CaptureHost, options: Mp4Options): Promise<Blob> {
  if (!webCodecsSupported()) throw new Error(code("err.mp4Unsupported"));
  const { width, height, fps, bitrate, frames } = options;
  if (frames < 1) throw new Error(code("err.noFrames"));
  const codec = await pickCodec(width, height, fps, bitrate);
  if (!codec) throw new Error(code("err.mp4Codec"));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(code("err.exportCanvas"));
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new CanvasSource(canvas, {
    codec,
    quality: new Quality({ bitrate }),
    keyFrameInterval: 1,
    sizeChangeBehavior: "deny",
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const duration = 1 / fps;
  try {
    await renderMotionFrames(host, {
      width,
      height,
      round: false,
      transparent: Boolean(options.transparent),
      frames,
      seconds: options.seconds,
      poster: options.poster,
      onFrame: async (frameCanvas, index) => {
        if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        context.clearRect(0, 0, width, height);
        context.drawImage(frameCanvas, 0, 0, width, height);
        await source.add(index * duration, duration);
        options.onProgress?.(Math.round(((index + 1) / frames) * 92));
      },
    });
    await output.finalize();
    options.onProgress?.(100);
    const buffer = target.buffer;
    if (!buffer) throw new Error(code("err.mp4Empty"));
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state !== "canceled" && output.state !== "finalized") await output.cancel().catch(() => undefined);
    throw error;
  }
}
