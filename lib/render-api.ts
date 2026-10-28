import type { PosterText } from "./poster.ts";
import type { SceneDocument } from "./scene-doc.ts";
import type { CameraSnapshot } from "./types.ts";

/**
 * Stable browser API for agents and the headless CLI. The studio registers a
 * set of handlers once it has a WebGL engine; everything below is a thin,
 * typed wrapper with the same option names the CLI and scene JSON use.
 */

export type FrameApiOptions = {
  /** Export size id from lib/formats.ts (`square`, `story`, `uhd`, …). */
  format?: string;
  width?: number;
  height?: number;
  transparent?: boolean;
  round?: boolean;
  /** Poster text override. Omit to use the text already in the scene. */
  text?: Partial<PosterText> | null;
  /** Seconds into the motion for a single still. */
  time?: number;
};

export type MotionApiOptions = {
  format?: string;
  width?: number;
  height?: number;
  /** Long edge in pixels. GIF: 480/720/1080. MP4: 720/1080. */
  longEdge?: number;
  fps?: number;
  frames?: number;
  seconds?: number;
  bitrate?: number;
  transparent?: boolean;
  text?: Partial<PosterText> | null;
  onProgress?: (progress: number) => void;
};

export type FrameResult = { dataUrl: string; mime: string; width: number; height: number };
export type MotionResult = FrameResult & { frames: number; fps: number; seconds: number };

export type LoadSceneResult = {
  ok: boolean;
  warnings: string[];
  errors?: Array<{ path: string; message: string; code?: string }>;
  scene?: SceneDocument;
};

export type PixelstageHandlers = {
  loadScene: (input: unknown) => Promise<LoadSceneResult>;
  getScene: () => SceneDocument | null;
  getCamera: () => CameraSnapshot | null;
  setCamera: (camera: CameraSnapshot) => void;
  renderFrame: (options: FrameApiOptions) => Promise<FrameResult>;
  exportPNG: (options: FrameApiOptions) => Promise<FrameResult>;
  exportGIF: (options: MotionApiOptions) => Promise<MotionResult>;
  exportMP4: (options: MotionApiOptions) => Promise<MotionResult>;
  /** Resolve when mounted skins and textures are painted. */
  whenReady: () => Promise<boolean>;
};

export type PixelstageApi = {
  version: 2;
  readonly readyState: "booting" | "ready" | "closed";
  readonly ready: Promise<void>;
  loadScene: (input: unknown) => Promise<LoadSceneResult>;
  getScene: () => SceneDocument | null;
  getCamera: () => CameraSnapshot | null;
  setCamera: (camera: CameraSnapshot) => void;
  renderFrame: (options?: FrameApiOptions) => Promise<FrameResult>;
  exportPNG: (options?: FrameApiOptions) => Promise<FrameResult>;
  exportGIF: (options?: MotionApiOptions) => Promise<MotionResult>;
  exportMP4: (options?: MotionApiOptions) => Promise<MotionResult>;
  /** Load a scene JSON file by URL, then apply it. */
  loadSceneFromUrl: (url: string) => Promise<LoadSceneResult>;
};

declare global {
  interface Window {
    pixelstage?: PixelstageApi;
  }
}

let handlers: PixelstageHandlers | null = null;
let resolveReady: (() => void) | null = null;
let readyPromise: Promise<void> = new Promise((resolve) => {
  resolveReady = resolve;
});
let state: PixelstageApi["readyState"] = "booting";

function missing(name: string) {
  return Promise.reject(new Error(`pixelstage is not ready (${name}).`));
}

export function api(): PixelstageApi {
  return {
    version: 2,
    get readyState() {
      return state;
    },
    get ready() {
      return readyPromise;
    },
    loadScene(input) {
      return handlers ? handlers.loadScene(input) : missing("loadScene");
    },
    getScene() {
      return handlers?.getScene() ?? null;
    },
    getCamera() {
      return handlers?.getCamera() ?? null;
    },
    setCamera(camera) {
      handlers?.setCamera(camera);
    },
    renderFrame(options) {
      return handlers ? handlers.renderFrame(options ?? {}) : missing("renderFrame");
    },
    exportPNG(options) {
      return handlers ? handlers.exportPNG(options ?? {}) : missing("exportPNG");
    },
    exportGIF(options) {
      return handlers ? handlers.exportGIF(options ?? {}) : missing("exportGIF");
    },
    exportMP4(options) {
      return handlers ? handlers.exportMP4(options ?? {}) : missing("exportMP4");
    },
    async loadSceneFromUrl(url) {
      if (!handlers) return missing("loadSceneFromUrl");
      const response = await fetch(url);
      if (!response.ok) {
        return { ok: false, warnings: [], errors: [{ path: "", message: `HTTP ${response.status} loading ${url}` }] };
      }
      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch (error) {
        return {
          ok: false,
          warnings: [],
          errors: [{ path: "", message: error instanceof Error ? error.message : "Invalid JSON" }],
        };
      }
      return handlers.loadScene(parsed);
    },
  };
}

/** Called once the studio is mounted. Safe to call again after a hot reload. */
export function registerPixelstage(next: PixelstageHandlers) {
  handlers = next;
  state = "ready";
  if (typeof window !== "undefined") window.pixelstage = api();
  resolveReady?.();
  resolveReady = null;
}

/** Mark the API as unloaded without breaking an already-resolved `ready`. */
export function unregisterPixelstage() {
  handlers = null;
  state = "closed";
  if (typeof window !== "undefined" && window.pixelstage) {
    window.pixelstage = api();
  }
  readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });
}

/** Install the stub early so `window.pixelstage.ready` exists before mount. */
export function installPixelstage() {
  if (typeof window === "undefined") return;
  if (!window.pixelstage) window.pixelstage = api();
}
