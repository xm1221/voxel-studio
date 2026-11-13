import { EXPORT_FORMAT_IDS } from "./formats.ts";
import { CLIPS, animationDocument, parseAnimationDocument } from "./motion.ts";
import type { PropClip } from "./prop-clip.ts";
import { BACKGROUND_IDS, GRADE_IDS, LIGHT_IDS, OUTLINE_IDS } from "./scene-doc.ts";
import { scenePackById } from "./scene-packs.ts";
import type { AnimationDef, BackgroundFit, CameraSnapshot, ClipId, Joints, LayerMode, PlayerDraft, SceneDraft, SceneProp } from "./types";

export const STORAGE_BACKUP_KEY = "pixelstage.v1.backup";

export function layerModeFrom(value: unknown): LayerMode {
  return value === "voxel" ? "voxel" : "flat";
}

const CLIP_IDS = new Set<ClipId>([...CLIPS.map((clip) => clip.id), "custom"]);

export function clipIdFrom(value: unknown, fallback: ClipId): ClipId {
  return typeof value === "string" && CLIP_IDS.has(value as ClipId) ? (value as ClipId) : fallback;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

/** The studio slider ranges the light gain from 0.45 to 1.6. */
const KEY_INTENSITY_MIN = 0.45;
const KEY_INTENSITY_MAX = 1.6;
const MAX_IMAGE_URL_LENGTH = 6_000_000;
const MAX_TEXT_LENGTH = 64;

function enumValue<T extends string>(value: unknown, ids: readonly T[], fallback: T): T {
  return typeof value === "string" && (ids as readonly string[]).includes(value) ? (value as T) : fallback;
}

function textFrom(value: unknown, max = MAX_TEXT_LENGTH): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function keyIntensityFrom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(KEY_INTENSITY_MAX, Math.max(KEY_INTENSITY_MIN, value));
}

/** Only an https: URL (or an image data URL, length-capped) may ride in a link. */
function imageUrlFrom(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_IMAGE_URL_LENGTH) return null;
  if (value.startsWith("data:image/")) return value;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function cameraTupleFrom(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value as unknown[];
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  if (typeof z !== "number" || !Number.isFinite(z)) return null;
  return [x, y, z];
}

/** A camera needs two finite 3-number tuples; stray extras only survive when numeric. */
function cameraFrom(value: unknown): CameraSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const p = cameraTupleFrom(record.p);
  const t = cameraTupleFrom(record.t);
  if (!p || !t) return undefined;
  const camera: CameraSnapshot = { p, t };
  for (const [key, entry] of Object.entries(record)) {
    if (key === "p" || key === "t") continue;
    if (typeof entry === "number" && Number.isFinite(entry)) (camera as unknown as Record<string, unknown>)[key] = entry;
  }
  return camera;
}

function playerFrom(value: Record<string, unknown>): PlayerPayload {
  const player = { ...value } as unknown as PlayerPayload;
  player.name = textFrom(value.name) ?? "";
  player.username = textFrom(value.username);
  const skinUrl = imageUrlFrom(value.skinUrl);
  if (skinUrl) player.skinUrl = skinUrl;
  else delete player.skinUrl;
  const capeUrl = imageUrlFrom(value.capeUrl);
  if (capeUrl) player.capeUrl = capeUrl;
  else delete player.capeUrl;
  return player;
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
  props?: Array<SceneProp & { rotationY?: number }>;
  activePropId?: string | null;
  /** Prop transform track. Share links include keys, not custom texture bytes. */
  propClip?: PropClip | null;
  /** Scene pack id. Local saves and share links keep it; v2 documents do too. */
  pack?: string;
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
    ...(scene.pack && scenePackById(scene.pack) ? { pack: scene.pack } : {}),
    camera,
    ...(scene.props.length
      ? {
          props: scene.props.map((prop) => ({
            id: prop.id,
            catalogId: prop.catalogId,
            name: prop.name,
            position: { ...prop.position },
            rotation: { ...prop.rotation },
            rotationY: prop.rotation.y,
            scale: { ...prop.scale },
            pivot: { ...prop.pivot },
            hidden: prop.hidden,
            locked: prop.locked,
            ...(prop.attach ? { attach: { ...prop.attach } } : {}),
          })),
          ...(scene.activePropId ? { activePropId: scene.activePropId } : {}),
        }
      : {}),
    ...(scene.propClip ? { propClip: scene.propClip } : {}),
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
      ...(player.yaw !== undefined && player.yaw !== 0 ? { yaw: player.yaw } : {}),
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
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return null;
    const parsed = decoded as SharePayload;
    if (parsed.v !== 1 || !Array.isArray(parsed.players) || parsed.players.length === 0) return null;
    const players: PlayerPayload[] = [];
    for (const raw of parsed.players as unknown[]) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const player = raw as Record<string, unknown>;
      const joints = player.joints as Record<string, unknown> | null | undefined;
      if (!joints || typeof joints !== "object") return null;
      for (const key of JOINT_KEYS) {
        if (typeof joints[key] !== "number" || Number.isNaN(joints[key])) return null;
      }
      players.push(playerFrom(player));
    }
    const payload: SharePayload = {
      ...parsed,
      activeId: textFrom(parsed.activeId) ?? "",
      background: enumValue(parsed.background, BACKGROUND_IDS, "studio"),
      grade: enumValue(parsed.grade, GRADE_IDS, "clean"),
      outline: enumValue(parsed.outline, OUTLINE_IDS, "none"),
      godrays: Boolean(parsed.godrays),
      light: enumValue(parsed.light, LIGHT_IDS, "soft"),
      keyIntensity: keyIntensityFrom(parsed.keyIntensity),
      formatId: enumValue(parsed.formatId, EXPORT_FORMAT_IDS, "youtube"),
      players,
    };
    const backgroundImage = imageUrlFrom(payload.backgroundImage);
    if (backgroundImage) payload.backgroundImage = backgroundImage;
    else delete payload.backgroundImage;
    if (typeof payload.pack !== "string") delete payload.pack;
    const camera = cameraFrom(payload.camera);
    if (camera) payload.camera = camera;
    else delete payload.camera;
    return payload;
  } catch {
    return null;
  }
}
