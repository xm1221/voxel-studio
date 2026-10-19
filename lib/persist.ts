import { animationDocument, parseAnimationDocument } from "./motion.ts";
import type { AnimationDef, BackgroundFit, CameraSnapshot, ClipId, Joints, LayerMode, PlayerDraft, SceneDraft, SceneProp } from "./types";

export function layerModeFrom(value: unknown): LayerMode {
  return value === "voxel" ? "voxel" : "flat";
}

const CLIP_IDS = new Set<ClipId>(["none", "idle", "walk", "run", "wave", "cheer", "custom"]);

export function clipIdFrom(value: unknown, fallback: ClipId): ClipId {
  return typeof value === "string" && CLIP_IDS.has(value as ClipId) ? (value as ClipId) : fallback;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export type SharePayload = {
  v: 1;
  activeId: string;
  background: SceneDraft["background"];
  /** Present only in local saves. Share links leave this out. */
  backgroundImage?: string;
  backgroundFit?: BackgroundFit;
  grade: SceneDraft["grade"];
  outline: SceneDraft["outline"];
  godrays: boolean;
  light: SceneDraft["light"];
  keyIntensity: number;
  formatId: string;
  /** Legacy scene-wide values kept for links created before per-player settings. */
  showOuter?: boolean;
  layerMode?: LayerMode;
  clip?: ClipId;
  clipSpeed?: number;
  camera?: CameraSnapshot;
  players: PlayerPayload[];
  /** Optional. Links from before props shipped omit this and still decode. */
  props?: SceneProp[];
  activePropId?: string | null;
};

export type PlayerPayload = Omit<
  PlayerDraft,
  "skinUrl" | "capeUrl" | "clip" | "clipSpeed" | "customAnimation" | "showOuter" | "layerMode" | "position" | "scale"
> & {
  skinUrl?: string;
  capeUrl?: string | null;
  clip?: ClipId;
  clipSpeed?: number;
  customAnimation?: AnimationDef | null;
  showOuter?: boolean;
  layerMode?: LayerMode;
  position?: Partial<PlayerDraft["position"]>;
  scale?: number;
};

export function playerSettingsFromPayload(
  player: PlayerPayload,
  payload: Pick<SharePayload, "clip" | "clipSpeed" | "showOuter" | "layerMode">,
) {
  const customAnimation = parseCustomAnimation(player.customAnimation);
  const requestedClip = clipIdFrom(player.clip, clipIdFrom(payload.clip, "none"));
  return {
    clip: requestedClip === "custom" && !customAnimation ? "none" : requestedClip,
    clipSpeed: numberInRange(player.clipSpeed, 0.25, 3, numberInRange(payload.clipSpeed, 0.25, 3, 1)),
    customAnimation,
    showOuter: player.showOuter ?? payload.showOuter ?? true,
    layerMode: layerModeFrom(player.layerMode ?? payload.layerMode),
  };
}

function parseCustomAnimation(value: unknown): AnimationDef | null {
  if (value === undefined || value === null) return null;
  const parsed = parseAnimationDocument(value);
  return parsed.ok ? parsed.animation : null;
}

const JOINT_KEYS: (keyof Joints)[] = [
  "headX",
  "headY",
  "bodyX",
  "rArmX",
  "rArmZ",
  "rElbow",
  "lArmX",
  "lArmZ",
  "lElbow",
  "rLegX",
  "rKnee",
  "lLegX",
  "lKnee",
];

const BACKGROUND_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i;

/** Accept a PNG, JPEG, or WebP data URL. Anything else stays off the scene and out of links. */
export function backgroundImageFrom(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 6_000_000) return null;
  return BACKGROUND_DATA_URL.test(value) ? value : null;
}

export function backgroundFitFrom(value: unknown): BackgroundFit {
  return value === "contain" ? "contain" : "cover";
}

export function toPayload(scene: SceneDraft, camera: CameraSnapshot | undefined, keepUploads: boolean): SharePayload {
  const backgroundImage = keepUploads ? backgroundImageFrom(scene.backgroundImage) : null;
  return {
    v: 1,
    activeId: scene.activeId,
    background: scene.background,
    ...(backgroundImage
      ? { backgroundImage, backgroundFit: backgroundFitFrom(scene.backgroundFit) }
      : {}),
    grade: scene.grade,
    outline: scene.outline,
    godrays: scene.godrays,
    light: scene.light,
    keyIntensity: scene.keyIntensity,
    formatId: scene.formatId,
    camera,
    ...(scene.props.length
      ? {
          props: scene.props.map((prop) => ({
            id: prop.id,
            catalogId: prop.catalogId,
            position: { ...prop.position },
            rotationY: prop.rotationY,
            scale: prop.scale,
          })),
          ...(scene.activePropId ? { activePropId: scene.activePropId } : {}),
        }
      : {}),
    players: scene.players.map((player) => ({
      id: player.id,
      name: player.name,
      source: player.source,
      username: player.username,
      model: player.model,
      poseId: player.poseId,
      joints: player.joints,
      clip: player.clip,
      clipSpeed: player.clipSpeed,
      customAnimation: player.customAnimation ? animationDocument(player.customAnimation) : null,
      showOuter: player.showOuter,
      layerMode: player.layerMode,
      position: { ...player.position },
      scale: player.scale,
      nametag: player.nametag,
      bubble: player.bubble,
      showCape: player.showCape,
      skinUrl: keepUploads && player.source === "upload" ? player.skinUrl : undefined,
      capeUrl: keepUploads ? player.capeUrl : undefined,
    })),
  };
}

export function encodePayload(payload: SharePayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodePayload(value: string): SharePayload | null {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    if (parsed.v !== 1 || !Array.isArray(parsed.players) || parsed.players.length === 0) return null;
    for (const player of parsed.players) {
      if (!player.joints) return null;
      for (const key of JOINT_KEYS) {
        if (typeof player.joints[key] !== "number" || Number.isNaN(player.joints[key])) return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}
