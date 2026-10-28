import { Color, type Group, type Mesh, type PerspectiveCamera, type Scene, type WebGLRenderer, ShadowMaterial } from "three";
import { code } from "./i18n";
import { encodeGif, type GifFrame } from "./gif";
import { drawPosterText, posterSubjectShift, type PosterText } from "./poster";
import type { SceneDraft } from "./types";
import type { StageSet } from "./stage";

export type CaptureHost = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  holder: Group;
  stage: StageSet;
  draft: SceneDraft | null;
  rigs: Iterable<{ nametag: Mesh; bubble: Mesh; ring: Mesh }>;
  poseAll: (dt: number, exactTime?: number) => void;
  setHeld: (held: boolean) => void;
  setMarkersVisible?: (visible: boolean) => void;
};

/** Extra paint options shared by stills, GIF, and MP4. */
export type FramePaint = {
  round: boolean;
  transparent: boolean;
  /** Title block drawn after the 3D frame. */
  poster?: PosterText | null;
};

/** Paint the poster text and keep it inside the round avatar crop. */
function paintPoster(context: CanvasRenderingContext2D, paint: FramePaint, width: number, height: number) {
  if (!paint.poster) return;
  drawPosterText(context, paint.poster, { width, height });
}

/**
 * A small lateral nudge so layouts that reserve space for text do not sit on
 * top of the skin. Only the cast moves; the stage and camera stay put.
 */
function subjectShiftFor(host: CaptureHost, paint: FramePaint, width: number, height: number) {
  const shift = posterSubjectShift(paint.poster, width, height);
  if (!shift) return 0;
  return shift * 0.022;
}

export async function captureStill(
  host: CaptureHost,
  options: { width: number; height: number; round: boolean; transparent: boolean; poster?: PosterText | null },
) {
  const canvas = await renderStill(host, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error(code("err.noPng"));
  return blob;
}

/** Render one still frame and return the finished 2D canvas. */
export async function renderStill(
  host: CaptureHost,
  options: { width: number; height: number; round: boolean; transparent: boolean; poster?: PosterText | null; time?: number },
) {
  const draft = host.draft;
  if (!draft) throw new Error(code("err.sceneNotReady"));
  const parent = host.renderer.domElement.parentElement;
  const viewW = parent?.clientWidth ?? host.renderer.domElement.width;
  const viewH = parent?.clientHeight ?? host.renderer.domElement.height;
  const ratio = host.renderer.getPixelRatio();
  const saved = snapshotWorld(host);
  const sample = Math.max(options.width, options.height) <= 2048 ? 2 : 1;

  if (options.transparent) hideBackdrop(host);
  host.setMarkersVisible?.(false);
  host.setHeld(true);
  const rings = [...host.rigs].map((rig) => rig.ring.visible);
  const baseX = host.holder.position.x;

  try {
    for (const rig of host.rigs) rig.ring.visible = false;
    host.renderer.setPixelRatio(1);
    host.renderer.setSize(options.width * sample, options.height * sample, false);
    host.camera.aspect = options.width / options.height;
    host.camera.updateProjectionMatrix();
    if (!options.transparent) host.stage.present(host.scene, host.renderer);
    host.holder.position.x = baseX + subjectShiftFor(host, options, options.width, options.height);
    host.poseAll(0, options.time ?? 0);
    host.renderer.render(host.scene, host.camera);

    const output = document.createElement("canvas");
    output.width = options.width;
    output.height = options.height;
    const context = output.getContext("2d");
    if (!context) throw new Error(code("err.exportCanvas"));
    paintFrame(context, host.renderer.domElement, options, options.width, options.height);
    return output;
  } finally {
    host.setMarkersVisible?.(true);
    restoreWorld(host, saved, ratio, viewW, viewH);
    host.holder.position.x = baseX;
    [...host.rigs].forEach((rig, index) => {
      rig.ring.visible = rings[index] ?? false;
    });
    host.poseAll(0);
    host.setHeld(false);
  }
}

/** Draw the WebGL frame, the avatar crop, and then the poster text. */
function paintFrame(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  paint: FramePaint,
  width: number,
  height: number,
) {
  context.save();
  context.clearRect(0, 0, width, height);
  if (paint.round) {
    context.beginPath();
    context.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
    context.clip();
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  paintPoster(context, paint, width, height);
  context.restore();
}

export type MotionFrameOptions = {
  width: number;
  height: number;
  round: boolean;
  transparent: boolean;
  frames: number;
  seconds: number;
  poster?: PosterText | null;
  /** Called once per finished frame, in order. Await it to apply backpressure. */
  onFrame: (canvas: HTMLCanvasElement, index: number) => void | Promise<void>;
};

/**
 * Deterministic per-frame rendering: frame `i` is posed at exactly
 * `i / frames * seconds`, never at wall-clock time. GIF and MP4 share this so
 * both exports match each other.
 */
export async function renderMotionFrames(host: CaptureHost, options: MotionFrameOptions) {
  const draft = host.draft;
  if (!draft) throw new Error(code("err.sceneNotReady"));
  if (options.frames < 1) throw new Error(code("err.noFrames"));
  const parent = host.renderer.domElement.parentElement;
  const viewW = parent?.clientWidth ?? host.renderer.domElement.width;
  const viewH = parent?.clientHeight ?? host.renderer.domElement.height;
  const ratio = host.renderer.getPixelRatio();
  const saved = snapshotWorld(host);
  const spin = host.holder.rotation.y;
  const baseX = host.holder.position.x;
  const rigs = [...host.rigs];
  const allStill = draft.players.every((player) => player.clip === "none");
  const rings = rigs.map((rig) => rig.ring.visible);
  const output = document.createElement("canvas");
  output.width = options.width;
  output.height = options.height;
  const context = output.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error(code("err.exportCanvas"));
  host.setHeld(true);

  try {
    if (options.transparent) hideBackdrop(host);
    host.setMarkersVisible?.(false);
    for (const rig of rigs) rig.ring.visible = false;
    host.renderer.setPixelRatio(1);
    host.renderer.setSize(options.width, options.height, false);
    host.camera.aspect = options.width / options.height;
    host.camera.updateProjectionMatrix();
    if (!options.transparent) host.stage.present(host.scene, host.renderer);
    host.holder.position.x = baseX + subjectShiftFor(host, options, options.width, options.height);

    for (let frame = 0; frame < options.frames; frame += 1) {
      const time = (frame / options.frames) * options.seconds;
      if (allStill) {
        host.holder.rotation.y = (time / options.seconds) * Math.PI * 2;
        host.poseAll(0);
      } else {
        host.holder.rotation.y = 0;
        host.poseAll(0, time);
      }
      for (const rig of rigs) {
        rig.nametag.quaternion.copy(host.camera.quaternion);
        rig.bubble.quaternion.copy(host.camera.quaternion);
      }
      host.renderer.render(host.scene, host.camera);
      paintFrame(context, host.renderer.domElement, options, options.width, options.height);
      await options.onFrame(output, frame);
    }
  } finally {
    host.setMarkersVisible?.(true);
    host.holder.rotation.y = spin;
    host.holder.position.x = baseX;
    restoreWorld(host, saved, ratio, viewW, viewH);
    rigs.forEach((rig, index) => {
      rig.ring.visible = rings[index] ?? false;
    });
    host.poseAll(0);
    host.setHeld(false);
  }
}

export async function captureClip(
  host: CaptureHost,
  options: {
    width: number;
    height: number;
    round: boolean;
    transparent: boolean;
    frames: number;
    seconds: number;
    poster?: PosterText | null;
  },
) {
  const gifFrames: GifFrame[] = [];
  const delayCs = (options.seconds / Math.max(1, options.frames)) * 100;
  await renderMotionFrames(host, {
    ...options,
    onFrame: (canvas) => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error(code("err.exportCanvas"));
      const pixels = context.getImageData(0, 0, options.width, options.height);
      gifFrames.push({ rgba: pixels.data, delayCs });
    },
  });
  const encoded = encodeGif(gifFrames, options.width, options.height);
  return new Blob([Uint8Array.from(encoded)], { type: "image/gif" });
}

type WorldSnapshot = {
  background: Scene["background"];
  fog: Scene["fog"];
  studio: boolean;
  grass: boolean;
  nether: boolean;
  rays: boolean;
  shadowOpacity: number;
};

function snapshotWorld(host: CaptureHost): WorldSnapshot {
  return {
    background: host.scene.background,
    fog: host.scene.fog,
    studio: host.stage.studioFloor.visible,
    grass: host.stage.grass.visible,
    nether: host.stage.nether.visible,
    rays: host.stage.rays.visible,
    shadowOpacity: (host.stage.shadowFloor.material as ShadowMaterial).opacity,
  };
}

function hideBackdrop(host: CaptureHost) {
  host.scene.background = null;
  host.scene.fog = null;
  host.stage.studioFloor.visible = false;
  host.stage.grass.visible = false;
  host.stage.nether.visible = false;
  host.stage.rays.visible = false;
  (host.stage.shadowFloor.material as ShadowMaterial).opacity = 0.45;
  host.renderer.setClearColor(0x000000, 0);
}

function restoreWorld(host: CaptureHost, saved: WorldSnapshot, ratio: number, viewW: number, viewH: number) {
  host.scene.background = saved.background;
  host.scene.fog = saved.fog;
  host.stage.studioFloor.visible = saved.studio;
  host.stage.grass.visible = saved.grass;
  host.stage.nether.visible = saved.nether;
  host.stage.rays.visible = saved.rays;
  (host.stage.shadowFloor.material as ShadowMaterial).opacity = saved.shadowOpacity;
  if (saved.background instanceof Color) host.renderer.setClearColor(saved.background, 1);
  else host.renderer.setClearColor(0x000000, 0);
  host.renderer.setPixelRatio(ratio);
  host.renderer.setSize(viewW, viewH, false);
  host.camera.aspect = viewW / Math.max(viewH, 1);
  host.camera.updateProjectionMatrix();
  host.stage.present(host.scene, host.renderer);
}
