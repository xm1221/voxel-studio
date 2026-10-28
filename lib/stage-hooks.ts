import { createAlexSkin, createSteveSkin } from "./defaults";
import { exportPoster, mergeMotionExport, planMotion, resolveFormat } from "./exporters";
import { code } from "./i18n";
import type { StudioEngine } from "./engine";
import { DEFAULT_MOTION_EXPORT, type MotionExportOptions } from "./motion-export";
import { parsePosterText, type PosterText } from "./poster";
import type { FrameApiOptions, LoadSceneResult, MotionApiOptions, PixelstageHandlers } from "./render-api";
import { loadAnyScene, parseSceneDocument, toSceneDocument } from "./scene-doc";
import type { CameraSnapshot, SceneDraft } from "./types";

let skins: { steve: string; alex: string } | null = null;

/** Generated Steve/Alex data URLs. Browsers only; the CLI runs in one. */
export function builtinSkins() {
  if (!skins) skins = { steve: createSteveSkin(), alex: createAlexSkin() };
  return skins;
}

export type StageContext = {
  engine: StudioEngine;
  getScene: () => SceneDraft | null;
  /** Replace the live scene. The studio routes this through React state. */
  applyScene: (scene: SceneDraft, camera: CameraSnapshot | null) => void | Promise<void>;
  getCamera: () => CameraSnapshot;
  setCamera: (camera: CameraSnapshot) => void;
  getPoster: () => PosterText;
  setPoster: (poster: PosterText) => void;
  getMotion: () => MotionExportOptions;
  setMotion: (motion: MotionExportOptions) => void;
  /** Resolve usernames. The studio already has this; the CLI inlines skins instead. */
  resolveUsernames?: (scene: SceneDraft) => Promise<void>;
};

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png");
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(code("err.fileRead")));
    reader.readAsDataURL(blob);
  });
}

/**
 * Shared `window.pixelstage` implementation. The interactive studio and the
 * headless render page both build their handlers here, so an agent gets the
 * same behaviour either way.
 */
export function stageHandlers(ctx: StageContext): PixelstageHandlers {
  const scene = () => ctx.getScene();

  async function loadScene(input: unknown): Promise<LoadSceneResult> {
    const result = loadAnyScene(input, builtinSkins());
    if (!result.ok) {
      return { ok: false, warnings: [], errors: result.errors };
    }
    const value = result.value;
    let next = value.scene;
    if (value.refetch.length && ctx.resolveUsernames) {
      await ctx.resolveUsernames(next);
      next = ctx.getScene() ?? next;
    }
    const camera = value.camera ?? ctx.getCamera();
    await ctx.applyScene(next, camera);
    if (value.camera) ctx.setCamera(value.camera);
    ctx.setPoster(value.poster);
    ctx.setMotion(value.motion);
    await ctx.engine.whenReady();
    return { ok: true, warnings: value.warnings, scene: toSceneDocument(next, { camera: value.camera ?? ctx.getCamera(), poster: value.poster }) };
  }

  async function frame(options: FrameApiOptions) {
    const format = resolveFormat(scene(), options);
    const poster = exportPoster(ctx.getPoster(), options.text);
    const canvas = await ctx.engine.captureFrame({
      width: format.width,
      height: format.height,
      round: options.round ?? format.round,
      transparent: Boolean(options.transparent),
      poster,
      time: options.time ?? 0,
    });
    return { dataUrl: canvasToDataUrl(canvas), mime: "image/png", width: format.width, height: format.height };
  }

  function motionOptions(options: MotionApiOptions) {
    const base = ctx.getMotion();
    const merged = mergeMotionExport(base, {
      ...(options.fps === undefined ? {} : { fps: options.fps }),
      ...(options.frames === undefined ? {} : { frames: options.frames }),
      ...(options.bitrate === undefined ? {} : { mp4Bitrate: options.bitrate }),
      ...(options.longEdge === undefined ? {} : { gifEdge: options.longEdge as MotionExportOptions["gifEdge"] }),
    });
    return merged;
  }

  function plan(options: MotionApiOptions, target: "gif" | "mp4") {
    const current = scene();
    let format = resolveFormat(current, options);
    if (options.longEdge) {
      const scale = Math.min(1, options.longEdge / Math.max(format.width, format.height));
      format = {
        ...format,
        width: Math.max(2, Math.round((format.width * scale) / 2) * 2),
        height: Math.max(2, Math.round((format.height * scale) / 2) * 2),
      };
    }
    const settings = motionOptions(options);
    const next = planMotion(current, format, settings, target);
    return { format, settings, next };
  }

  return {
    loadScene,
    getScene() {
      const current = scene();
      return current ? toSceneDocument(current, { camera: ctx.getCamera(), poster: ctx.getPoster(), motion: ctx.getMotion() }) : null;
    },
    getCamera() {
      return ctx.getCamera();
    },
    setCamera(camera) {
      ctx.setCamera(camera);
    },
    renderFrame: frame,
    exportPNG: frame,
    async exportGIF(options) {
      const { format, settings, next } = plan(options, "gif");
      const poster = exportPoster(ctx.getPoster(), options.text);
      const blob = await ctx.engine.captureClip({
        width: next.width,
        height: next.height,
        round: format.round && !options.transparent,
        transparent: Boolean(options.transparent),
        frames: next.frames,
        seconds: options.seconds ?? next.seconds,
        poster,
      });
      return {
        dataUrl: await blobToDataUrl(blob),
        mime: "image/gif",
        width: next.width,
        height: next.height,
        frames: next.frames,
        fps: settings.fps,
        seconds: options.seconds ?? next.seconds,
      };
    },
    async exportMP4(options) {
      const { settings, next } = plan(options, "mp4");
      const poster = exportPoster(ctx.getPoster(), options.text);
      const blob = await ctx.engine.captureMp4({
        width: next.width,
        height: next.height,
        fps: next.fps,
        frames: next.frames,
        seconds: options.seconds ?? next.seconds,
        bitrate: settings.mp4Bitrate,
        poster,
        onProgress: options.onProgress,
      });
      return {
        dataUrl: await blobToDataUrl(blob),
        mime: "video/mp4",
        width: next.width,
        height: next.height,
        frames: next.frames,
        fps: next.fps,
        seconds: options.seconds ?? next.seconds,
      };
    },
    whenReady() {
      return ctx.engine.whenReady();
    },
  };
}

export { DEFAULT_MOTION_EXPORT, parsePosterText, parseSceneDocument, toSceneDocument };
