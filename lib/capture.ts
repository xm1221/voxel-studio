import { Color, type Group, type Mesh, type PerspectiveCamera, type Scene, type WebGLRenderer, ShadowMaterial } from "three";
import { encodeGif, type GifFrame } from "./gif";
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
};

export async function captureStill(
  host: CaptureHost,
  options: { width: number; height: number; round: boolean; transparent: boolean },
) {
  const parent = host.renderer.domElement.parentElement;
  const viewW = parent?.clientWidth ?? host.renderer.domElement.width;
  const viewH = parent?.clientHeight ?? host.renderer.domElement.height;
  const ratio = host.renderer.getPixelRatio();
  const saved = snapshotWorld(host);
  const sample = Math.max(options.width, options.height) <= 2048 ? 2 : 1;

  if (options.transparent) hideBackdrop(host);

  host.renderer.setPixelRatio(1);
  host.renderer.setSize(options.width * sample, options.height * sample, false);
  host.camera.aspect = options.width / options.height;
  host.camera.updateProjectionMatrix();
  host.renderer.render(host.scene, host.camera);

  const output = document.createElement("canvas");
  output.width = options.width;
  output.height = options.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("导出画布不可用。");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (options.round) {
    context.beginPath();
    context.arc(options.width / 2, options.height / 2, options.width / 2, 0, Math.PI * 2);
    context.clip();
  }
  context.drawImage(host.renderer.domElement, 0, 0, options.width, options.height);
  restoreWorld(host, saved, ratio, viewW, viewH);

  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("没有生成 PNG。");
  return blob;
}

export async function captureClip(
  host: CaptureHost,
  options: { width: number; height: number; round: boolean; transparent: boolean; frames: number; seconds: number },
) {
  const draft = host.draft;
  if (!draft) throw new Error("场景还没准备好。");
  const parent = host.renderer.domElement.parentElement;
  const viewW = parent?.clientWidth ?? host.renderer.domElement.width;
  const viewH = parent?.clientHeight ?? host.renderer.domElement.height;
  const ratio = host.renderer.getPixelRatio();
  const saved = snapshotWorld(host);
  const spin = host.holder.rotation.y;
  const rigs = [...host.rigs];
  const allStill = draft.players.every((player) => player.clip === "none");
  const rings = rigs.map((rig) => rig.ring.visible);
  const output = document.createElement("canvas");
  output.width = options.width;
  output.height = options.height;
  const context = output.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("导出画布不可用。");
  host.setHeld(true);

  try {
    if (options.transparent) hideBackdrop(host);
    for (const rig of rigs) rig.ring.visible = false;
    host.renderer.setPixelRatio(1);
    host.renderer.setSize(options.width, options.height, false);
    host.camera.aspect = options.width / options.height;
    host.camera.updateProjectionMatrix();

    const gifFrames: GifFrame[] = [];
    const delayCs = (options.seconds / options.frames) * 100;
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
      context.save();
      context.clearRect(0, 0, options.width, options.height);
      if (options.round) {
        context.beginPath();
        context.arc(options.width / 2, options.height / 2, options.width / 2, 0, Math.PI * 2);
        context.clip();
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(host.renderer.domElement, 0, 0, options.width, options.height);
      context.restore();
      const pixels = context.getImageData(0, 0, options.width, options.height);
      gifFrames.push({ rgba: pixels.data, delayCs });
    }
    const encoded = encodeGif(gifFrames, options.width, options.height);
    return new Blob([Uint8Array.from(encoded)], { type: "image/gif" });
  } finally {
    host.holder.rotation.y = spin;
    restoreWorld(host, saved, ratio, viewW, viewH);
    rigs.forEach((rig, index) => {
      rig.ring.visible = rings[index] ?? false;
    });
    host.poseAll(0);
    host.setHeld(false);
  }
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
}
