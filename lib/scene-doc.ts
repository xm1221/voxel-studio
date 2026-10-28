import { catalogIdKind, normalizeCatalogId } from "./catalog.ts";
import { DEFAULT_MOTION_EXPORT, parseMotionExport, type MotionExportOptions } from "./motion-export.ts";
import { CLIPS, clipById, parseAnimationDocument } from "./motion.ts";
import { parsePosterText, type PosterText } from "./poster.ts";
import { poseById, POSES } from "./poses.ts";
import { JOINT_LIMITS } from "./presets.ts";
import { SCENE_PACKS, scenePackById, scenePackLook, type ScenePack } from "./scene-packs.ts";
import { makePlayer, newId, sceneFromPayload } from "./studio-state.ts";
import type {
  AnimationDef,
  BackgroundId,
  BuiltinClipId,
  CameraSnapshot,
  GradeId,
  Joints,
  LightId,
  ModelType,
  OutlineId,
  PlayerDraft,
  SceneDraft,
  SceneProp,
} from "./types.ts";

/**
 * Declarative, versioned scene document for agents and the headless renderer.
 * It is a superset of what the studio can hold: cast, camera, stage look,
 * props, poster text, and export settings. v1 documents are the old keyframe
 * animation files; they keep loading through `parseAnimationDocument`.
 */
export const SCENE_DOC_VERSION = 2;

export const BUILTIN_SKINS = ["steve", "alex"] as const;
export const PRESET_IDS = CLIPS.map((clip) => clip.id);
export const POSE_IDS = POSES.map((pose) => pose.id);
export const PACK_IDS = SCENE_PACKS.map((pack) => pack.id);
export const BACKGROUND_IDS: BackgroundId[] = ["studio", "noon", "sunset", "night", "nether", "none"];
export const GRADE_IDS: GradeId[] = ["clean", "hologram", "ice", "comic"];
export const OUTLINE_IDS: OutlineId[] = ["none", "ink", "sticker"];
export const LIGHT_IDS: LightId[] = ["soft", "hard", "neon", "moon"];
export const CAMERA_PRESETS = ["full", "head", "wide"] as const;
export type CameraPresetId = (typeof CAMERA_PRESETS)[number];

export type SceneDocCast = {
  id?: string;
  name?: string;
  /** "steve", "alex", a data URL, or an http(s) image URL. */
  skin?: string;
  /** Mojang name. The studio resolves it through /api/player; the CLI inlines the skin. */
  username?: string;
  model?: ModelType;
  pose?: string | Partial<Joints>;
  /** Built-in preset id, or a full v1 animation document. */
  motion?:
    | BuiltinClipId
    | { preset: BuiltinClipId; speed?: number }
    | { speed?: number; animation: AnimationDef }
    | AnimationDef;
  position?: { x?: number; y?: number; z?: number };
  scale?: number;
  nametag?: string;
  bubble?: string;
  outer?: boolean;
  layers?: "flat" | "voxel";
  cape?: string | null;
  showCape?: boolean;
};

export type SceneDocCamera = {
  preset?: CameraPresetId;
  position?: [number, number, number];
  target?: [number, number, number];
};

export type SceneDocStage = {
  pack?: string;
  background?: BackgroundId;
  grade?: GradeId;
  outline?: OutlineId;
  godrays?: boolean;
  light?: LightId;
  keyIntensity?: number;
  backgroundImage?: string | null;
  backgroundFit?: "cover" | "contain";
};

export type SceneDocProp = {
  id?: string;
  /** Catalog id such as `block:stone`, `item:diamond_sword`, `entity:creeper`, or a legacy alias. */
  item?: string;
  catalogId?: string;
  position?: { x?: number; y?: number; z?: number };
  rotation?: { x?: number; y?: number; z?: number };
  scale?: number | { x?: number; y?: number; z?: number };
  hidden?: boolean;
};

export type SceneDocument = {
  v: 2;
  meta?: { name?: string; author?: string; note?: string };
  cast: SceneDocCast[];
  camera?: SceneDocCamera;
  stage?: SceneDocStage;
  props?: SceneDocProp[];
  text?: Partial<PosterText>;
  export?: { format?: string; motion?: Partial<MotionExportOptions> };
};

export type SceneDocIssue = { path: string; message: string; code?: string };

export type ParsedScene = {
  doc: SceneDocument;
  scene: SceneDraft;
  camera: CameraSnapshot | null;
  poster: PosterText;
  motion: MotionExportOptions;
  warnings: string[];
  /** Usernames the studio still has to resolve. */
  refetch: string[];
};

export type ParseSceneResult = { ok: true; value: ParsedScene } | { ok: false; errors: SceneDocIssue[] };

const MAX_CAST = 4;
const MAX_PROPS = 64;
const MAX_TEXT = 4_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, allowed: string[]) {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function num(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function vec(value: unknown, fallback = 0) {
  if (typeof value === "number") return { x: num(value, -64, 64, fallback), y: num(value, -16, 64, fallback), z: num(value, -64, 64, fallback) };
  if (!isRecord(value)) return { x: fallback, y: fallback, z: fallback };
  return {
    x: num(value.x, -64, 64, fallback),
    y: num(value.y, -16, 64, fallback),
    z: num(value.z, -64, 64, fallback),
  };
}

function triple(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item) && Math.abs(item) < 500)) return null;
  return [value[0] as number, value[1] as number, value[2] as number];
}

function builtinCamera(preset: CameraPresetId, count: number): CameraSnapshot {
  if (preset === "head") return { p: [0, 16, 34], t: [0, 12, 0] };
  if (preset === "wide") {
    const distance = Math.max(72, 52 + count * 16);
    return { p: [distance * 0.38, 9, distance], t: [0, 2, 0] };
  }
  const distance = Math.max(64, 46 + count * 16);
  return { p: [distance * 0.38, 9, distance], t: [0, 2, 0] };
}

function skinUrlFor(value: string, steve: string, alex: string) {
  if (value === "steve") return steve;
  if (value === "alex") return alex;
  return value;
}

function isImageUrl(value: string) {
  return value.startsWith("data:image/") || /^https?:\/\//i.test(value) || value.startsWith("/");
}

function parseJointsObject(value: Record<string, unknown>, path: string, errors: SceneDocIssue[]): Partial<Joints> | null {
  const joints: Partial<Joints> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(JOINT_LIMITS, key)) {
      errors.push({ path: `${path}.${key}`, message: `Unknown joint "${key}".`, code: "err.sceneJoints" });
      return null;
    }
    const limit = JOINT_LIMITS[key as keyof Joints];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < limit.min || raw > limit.max) {
      errors.push({
        path: `${path}.${key}`,
        message: `Joint "${key}" must be a number between ${limit.min} and ${limit.max}.`,
        code: "err.sceneJoints",
      });
      return null;
    }
    joints[key as keyof Joints] = raw;
  }
  return joints;
}

type MotionParse = { clip: PlayerDraft["clip"]; speed: number; animation: AnimationDef | null };

function parseMotion(value: unknown, path: string, errors: SceneDocIssue[]): MotionParse | null {
  if (value === undefined) return { clip: "idle", speed: 1, animation: null };
  if (typeof value === "string") {
    const clip = clipById(value);
    if (clip === "none" && value !== "none") {
      errors.push({ path, message: `Unknown motion "${value}". Known presets: ${PRESET_IDS.join(", ")}.`, code: "err.sceneMotion" });
      return null;
    }
    return { clip, speed: 1, animation: null };
  }
  if (!isRecord(value)) {
    errors.push({ path, message: "motion must be a preset name, an object, or a v1 animation.", code: "err.sceneMotion" });
    return null;
  }
  if (value.v === 1) {
    const parsed = parseAnimationDocument(value);
    if (!parsed.ok) {
      errors.push({ path, message: parsed.error, code: "err.sceneMotion" });
      return null;
    }
    return { clip: "custom", speed: 1, animation: parsed.animation };
  }
  if (!hasOnly(value, ["preset", "speed", "animation", "name", "duration", "loop", "keyframes"])) {
    errors.push({ path, message: `Unknown motion fields. Use preset, speed, or animation.`, code: "err.sceneMotion" });
    return null;
  }
  const speed = num(value.speed, 0.25, 3, 1);
  if (value.animation !== undefined) {
    const parsed = parseAnimationDocument(value.animation);
    if (!parsed.ok) {
      errors.push({ path: `${path}.animation`, message: parsed.error, code: "err.sceneMotion" });
      return null;
    }
    return { clip: "custom", speed, animation: parsed.animation };
  }
  if (value.keyframes !== undefined) {
    const parsed = parseAnimationDocument({ v: 1, ...value });
    if (!parsed.ok) {
      errors.push({ path, message: parsed.error, code: "err.sceneMotion" });
      return null;
    }
    return { clip: "custom", speed, animation: parsed.animation };
  }
  if (value.preset === undefined) {
    errors.push({ path, message: "motion needs a preset name or an animation.", code: "err.sceneMotion" });
    return null;
  }
  if (typeof value.preset !== "string") {
    errors.push({ path: `${path}.preset`, message: "preset must be a string.", code: "err.sceneMotion" });
    return null;
  }
  const clip = clipById(value.preset);
  if (clip === "none" && value.preset !== "none") {
    errors.push({
      path: `${path}.preset`,
      message: `Unknown motion preset "${value.preset}". Known presets: ${PRESET_IDS.join(", ")}.`,
      code: "err.sceneMotion",
    });
    return null;
  }
  return { clip, speed, animation: null };
}

function parseCast(value: unknown, index: number, steve: string, alex: string, errors: SceneDocIssue[]): PlayerDraft | null {
  const path = `cast[${index}]`;
  if (!isRecord(value)) {
    errors.push({ path, message: "Each cast entry must be an object.", code: "err.sceneCast" });
    return null;
  }
  const allowed = [
    "id",
    "name",
    "skin",
    "username",
    "model",
    "pose",
    "motion",
    "position",
    "scale",
    "nametag",
    "bubble",
    "outer",
    "layers",
    "cape",
    "showCape",
  ];
  if (!hasOnly(value, allowed)) {
    const extra = Object.keys(value).filter((key) => !allowed.includes(key));
    errors.push({ path, message: `Unknown cast fields: ${extra.join(", ")}.`, code: "err.sceneCast" });
    return null;
  }

  const id = typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,24}$/.test(value.id) ? value.id : newId();
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 32) : "Steve";
  const model: ModelType = value.model === "slim" ? "slim" : "default";
  const username = typeof value.username === "string" ? value.username.trim().slice(0, 16) : null;

  let skin = typeof value.skin === "string" ? value.skin.trim() : "";
  if (skin && !BUILTIN_SKINS.includes(skin as (typeof BUILTIN_SKINS)[number]) && !isImageUrl(skin)) {
    errors.push({
      path: `${path}.skin`,
      message: "skin must be \"steve\", \"alex\", a data:image/... URL, or an http(s) URL.",
      code: "err.sceneSkin",
    });
    return null;
  }
  if (!skin) skin = username ? "steve" : name.toLowerCase() === "alex" ? "alex" : "steve";

  let joints: Joints = poseById("idle").joints;
  let poseId = "idle";
  if (value.pose !== undefined) {
    if (typeof value.pose === "string") {
      if (!POSE_IDS.includes(value.pose)) {
        errors.push({ path: `${path}.pose`, message: `Unknown pose "${value.pose}". Known poses: ${POSE_IDS.join(", ")}.`, code: "err.scenePose" });
        return null;
      }
      poseId = value.pose;
      joints = poseById(value.pose).joints;
    } else if (isRecord(value.pose)) {
      const partial = parseJointsObject(value.pose, `${path}.pose`, errors);
      if (!partial) return null;
      poseId = "custom";
      joints = { ...poseById("idle").joints, ...partial };
    } else {
      errors.push({ path: `${path}.pose`, message: "pose must be a preset name or an object of joint angles.", code: "err.scenePose" });
      return null;
    }
  }

  const motion = parseMotion(value.motion, `${path}.motion`, errors);
  if (!motion) return null;

  const cape = typeof value.cape === "string" && isImageUrl(value.cape) ? value.cape : null;
  const player = makePlayer({
    id,
    name,
    skinUrl: skinUrlFor(skin, steve, alex),
    model,
    source: username ? "username" : skin === "steve" || skin === "alex" ? "builtin" : "upload",
    username,
    capeUrl: cape,
    showCape: value.showCape !== false,
    poseId,
    joints: { ...joints },
    clip: motion.clip,
    clipSpeed: motion.speed,
    customAnimation: motion.animation,
    showOuter: value.outer !== false,
    layerMode: value.layers === "voxel" ? "voxel" : "flat",
    position: vec(value.position),
    scale: num(value.scale, 0.5, 1.6, 1),
    nametag: typeof value.nametag === "string" ? value.nametag.slice(0, 32) : "",
    bubble: typeof value.bubble === "string" ? value.bubble.slice(0, 64) : "",
  });
  return player;
}

function parseProps(value: unknown, errors: SceneDocIssue[]): SceneProp[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({ path: "props", message: "props must be an array.", code: "err.sceneProps" });
    return [];
  }
  const props: SceneProp[] = [];
  const used = new Set<string>();
  value.slice(0, MAX_PROPS).forEach((entry, index) => {
    const path = `props[${index}]`;
    if (!isRecord(entry)) {
      errors.push({ path, message: "Each prop must be an object.", code: "err.sceneProps" });
      return;
    }
    const catalogId = normalizeCatalogId(entry.catalogId ?? entry.item);
    if (!catalogId) {
      errors.push({ path: `${path}.item`, message: `Unknown prop "${String(entry.catalogId ?? entry.item)}". Use a catalog id like block:stone.`, code: "err.sceneProp" });
      return;
    }
    let id = typeof entry.id === "string" && /^[a-zA-Z0-9_-]{1,24}$/.test(entry.id) ? entry.id : `o_${props.length + 1}`;
    while (used.has(id)) id = `${id}_`;
    used.add(id);
    const rotation = isRecord(entry.rotation) ? entry.rotation : {};
    const scale = typeof entry.scale === "number" ? entry.scale : entry.scale;
    const scaleVec = typeof scale === "number" ? { x: scale, y: scale, z: scale } : vec(scale, 1);
    props.push({
      id,
      catalogId,
      name: typeof entry.name === "string" ? entry.name.slice(0, 48) : "",
      position: vec(entry.position),
      rotation: {
        x: num(rotation.x, -720, 720, 0),
        y: num(rotation.y, -720, 720, 0),
        z: num(rotation.z, -720, 720, 0),
      },
      scale: {
        x: Math.min(8, Math.max(0.05, scaleVec.x || 1)),
        y: Math.min(8, Math.max(0.05, scaleVec.y || 1)),
        z: Math.min(8, Math.max(0.05, scaleVec.z || 1)),
      },
      pivot: { x: 0, y: 0, z: 0 },
      hidden: entry.hidden === true,
      locked: false,
    });
  });
  return props;
}

function parseCamera(value: unknown, count: number, errors: SceneDocIssue[]): CameraSnapshot | null {
  if (value === undefined) return null;
  if (!isRecord(value)) {
    errors.push({ path: "camera", message: "camera must be an object.", code: "err.sceneCamera" });
    return null;
  }
  const preset = typeof value.preset === "string" ? value.preset : undefined;
  if (preset !== undefined && !CAMERA_PRESETS.includes(preset as CameraPresetId)) {
    errors.push({ path: "camera.preset", message: `Camera preset must be one of ${CAMERA_PRESETS.join(", ")}.`, code: "err.sceneCamera" });
    return null;
  }
  const position = value.position === undefined ? null : triple(value.position);
  const target = value.target === undefined ? null : triple(value.target);
  if (value.position !== undefined && !position) {
    errors.push({ path: "camera.position", message: "camera.position must be [x, y, z].", code: "err.sceneCamera" });
    return null;
  }
  if (value.target !== undefined && !target) {
    errors.push({ path: "camera.target", message: "camera.target must be [x, y, z].", code: "err.sceneCamera" });
    return null;
  }
  if (position && target) return { p: position, t: target };
  const base = builtinCamera((preset as CameraPresetId) ?? "full", count);
  return { p: position ?? base.p, t: target ?? base.t };
}

function parseStage(value: unknown, errors: SceneDocIssue[], warnings: string[]): SceneDocStage {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    errors.push({ path: "stage", message: "stage must be an object.", code: "err.sceneStage" });
    return {};
  }
  const stage: SceneDocStage = {};
  if (value.pack !== undefined) {
    if (typeof value.pack !== "string" || !scenePackById(value.pack)) {
      errors.push({ path: "stage.pack", message: `Unknown scene pack. Known packs: ${PACK_IDS.join(", ")}.`, code: "err.scenePack" });
    } else {
      stage.pack = value.pack;
    }
  }
  const enumField = <T extends string>(key: string, allowed: readonly T[], code: string): T | undefined => {
    const raw = value[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== "string" || !allowed.includes(raw as T)) {
      errors.push({ path: `stage.${key}`, message: `${key} must be one of ${allowed.join(", ")}.`, code });
      return undefined;
    }
    return raw as T;
  };
  stage.background = enumField("background", BACKGROUND_IDS, "err.sceneStage");
  stage.grade = enumField("grade", GRADE_IDS, "err.sceneStage");
  stage.outline = enumField("outline", OUTLINE_IDS, "err.sceneStage");
  stage.light = enumField("light", LIGHT_IDS, "err.sceneStage");
  stage.backgroundFit = enumField("backgroundFit", ["cover", "contain"] as const, "err.sceneStage");
  if (value.godrays !== undefined) stage.godrays = value.godrays === true;
  if (value.keyIntensity !== undefined) stage.keyIntensity = num(value.keyIntensity, 0.45, 1.6, 1);
  if (value.backgroundImage !== undefined) {
    const image = value.backgroundImage;
    if (image === null) stage.backgroundImage = null;
    else if (typeof image === "string" && image.startsWith("data:image/")) stage.backgroundImage = image;
    else {
      warnings.push("stage.backgroundImage only accepts a data:image URL; the value was ignored.");
      stage.backgroundImage = null;
    }
  }
  return stage;
}

/** Load a scene document into the studio's internal draft. */
export function parseSceneDocument(value: unknown, skins: { steve: string; alex: string }): ParseSceneResult {
  const errors: SceneDocIssue[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: [{ path: "", message: "Scene must be a JSON object.", code: "err.sceneJson" }] };
  if (value.v !== 2) {
    return {
      ok: false,
      errors: [
        {
          path: "v",
          message:
            value.v === 1
              ? "v: 1 is the keyframe animation format. A scene document uses v: 2."
              : `Scene documents use v: 2 (got ${JSON.stringify(value.v)}).`,
          code: "err.sceneVersion",
        },
      ],
    };
  }
  // `$schema` is editor sugar, not scene data.
  const topKeys = ["v", "$schema", "meta", "cast", "camera", "stage", "props", "text", "export"];
  if (!hasOnly(value, topKeys)) {
    const extra = Object.keys(value).filter((key) => !topKeys.includes(key));
    return { ok: false, errors: [{ path: "", message: `Unknown top-level fields: ${extra.join(", ")}.`, code: "err.sceneUnknown" }] };
  }

  if (value.meta !== undefined && !isRecord(value.meta)) {
    errors.push({ path: "meta", message: "meta must be an object.", code: "err.sceneMeta" });
  }

  const cast = value.cast;
  if (!Array.isArray(cast) || cast.length < 1) {
    return { ok: false, errors: [{ path: "cast", message: "cast must be an array with 1–4 players.", code: "err.sceneCast" }] };
  }
  if (cast.length > MAX_CAST) {
    errors.push({ path: "cast", message: `cast holds at most ${MAX_CAST} players (got ${cast.length}).`, code: "err.sceneCast" });
  }

  const players: PlayerDraft[] = [];
  const refetch: string[] = [];
  cast.slice(0, MAX_CAST).forEach((entry, index) => {
    const player = parseCast(entry, index, skins.steve, skins.alex, errors);
    if (!player) return;
    if (players.some((item) => item.id === player.id)) player.id = `${player.id}_${players.length}`;
    if (player.source === "username" && player.username) refetch.push(player.id);
    players.push(player);
  });
  if (errors.length) return { ok: false, errors };

  const stage = parseStage(value.stage, errors, warnings);
  const pack: ScenePack | null = stage.pack ? scenePackById(stage.pack) : null;
  const packLook = pack ? scenePackLook(pack) : null;

  const posterRaw = value.text === undefined ? {} : value.text;
  if (!isRecord(posterRaw)) errors.push({ path: "text", message: "text must be an object.", code: "err.sceneText" });
  const poster = parsePosterText(posterRaw);

  let formatId = "youtube";
  let explicitFormat = false;
  let motion = { ...DEFAULT_MOTION_EXPORT };
  if (value.export !== undefined) {
    const exportDoc = value.export;
    if (!isRecord(exportDoc)) {
      errors.push({ path: "export", message: "export must be an object.", code: "err.sceneExport" });
    } else {
      if (typeof exportDoc.format === "string" && FORMAT_ID_SET.has(exportDoc.format)) {
        formatId = exportDoc.format;
        explicitFormat = true;
      } else if (exportDoc.format !== undefined) {
        errors.push({
          path: "export.format",
          message: `Unknown export format. Known formats: ${[...FORMAT_ID_SET].join(", ")}.`,
          code: "err.sceneFormat",
        });
      }
      if (exportDoc.motion !== undefined) motion = parseMotionExport(exportDoc.motion);
    }
  }

  const props = parseProps(value.props, errors);
  if (errors.length) return { ok: false, errors };

  const camera = parseCamera(value.camera, players.length, errors);
  if (errors.length) return { ok: false, errors };

  const scene: SceneDraft = {
    players,
    activeId: players[0].id,
    props,
    activePropId: props[0]?.id ?? null,
    propClip: null,
    background: stage.background ?? packLook?.background ?? "studio",
    backgroundImage: stage.backgroundImage ?? null,
    backgroundFit: stage.backgroundFit ?? "cover",
    grade: stage.grade ?? packLook?.grade ?? "clean",
    outline: stage.outline ?? packLook?.outline ?? "none",
    godrays: stage.godrays ?? packLook?.godrays ?? false,
    light: stage.light ?? packLook?.light ?? "soft",
    keyIntensity: stage.keyIntensity ?? packLook?.keyIntensity ?? 1,
    formatId: explicitFormat ? formatId : packLook?.formatId ?? formatId,
  };

  return {
    ok: true,
    value: {
      doc: value as unknown as SceneDocument,
      scene,
      camera: camera ?? (pack ? { p: [...pack.camera.p] as [number, number, number], t: [...pack.camera.t] as [number, number, number] } : null),
      poster,
      motion,
      warnings,
      refetch,
    },
  };
}

const FORMAT_ID_SET = new Set([
  "avatar",
  "square",
  "xhs",
  "youtube",
  "story",
  "desktop",
  "banner",
  "uhd",
  "pfp",
  "thumb",
  "phone",
]);

/** JSON text entry point. Caps the input before parsing. */
export function parseSceneText(text: string, skins: { steve: string; alex: string }): ParseSceneResult {
  if (text.length > MAX_TEXT) {
    return { ok: false, errors: [{ path: "", message: "Scene JSON is larger than 4 MB.", code: "err.sceneSize" }] };
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      ok: false,
      errors: [{ path: "", message: `Not valid JSON: ${error instanceof Error ? error.message : "parse error"}`, code: "err.sceneJson" }],
    };
  }
  return parseSceneDocument(value, skins);
}

/** Turn the live studio draft back into a v2 document, for save and export. */
export function toSceneDocument(
  scene: SceneDraft,
  options: { camera?: CameraSnapshot | null; poster?: PosterText | null; motion?: MotionExportOptions | null; meta?: SceneDocument["meta"] } = {},
): SceneDocument {
  const cast: SceneDocCast[] = scene.players.map((player) => {
    const entry: SceneDocCast = {
      id: player.id,
      name: player.name,
      skin: player.skinUrl,
      model: player.model,
      pose: player.poseId.startsWith("user:") ? { ...player.joints } : player.poseId,
      position: { ...player.position },
      scale: player.scale,
      outer: player.showOuter,
      layers: player.layerMode,
      showCape: player.showCape,
    };
    if (player.username) entry.username = player.username;
    if (player.capeUrl) entry.cape = player.capeUrl;
    if (player.nametag) entry.nametag = player.nametag;
    if (player.bubble) entry.bubble = player.bubble;
    if (player.clip === "custom" && player.customAnimation) entry.motion = { speed: player.clipSpeed, animation: player.customAnimation };
    else if (player.clip === "custom") entry.motion = "none";
    else entry.motion = player.clipSpeed === 1 ? player.clip : { preset: player.clip, speed: player.clipSpeed };
    return entry;
  });
  return {
    v: 2,
    ...(options.meta ? { meta: options.meta } : {}),
    cast,
    camera: options.camera ? { position: [...options.camera.p], target: [...options.camera.t] } : undefined,
    stage: {
      background: scene.background,
      grade: scene.grade,
      outline: scene.outline,
      godrays: scene.godrays,
      light: scene.light,
      keyIntensity: scene.keyIntensity,
      backgroundFit: scene.backgroundFit,
      ...(scene.backgroundImage ? { backgroundImage: scene.backgroundImage } : {}),
    },
    props: scene.props.map((prop) => ({
      id: prop.id,
      catalogId: prop.catalogId,
      position: { ...prop.position },
      rotation: { ...prop.rotation },
      scale: { ...prop.scale },
      ...(prop.hidden ? { hidden: true } : {}),
    })),
    ...(options.poster ? { text: options.poster } : {}),
    export: {
      format: scene.formatId,
      ...(options.motion ? { motion: options.motion } : {}),
    },
  };
}

/**
 * A v1 keyframe animation file is not a scene. Wrap it in a one-player scene so
 * `render -- scene.json` accepts either format, and old animation exports keep
 * working with the new tooling.
 */
export function wrapAnimationDocument(value: unknown, skins: { steve: string; alex: string }): ParseSceneResult {
  const parsed = parseAnimationDocument(value);
  if (!parsed.ok) {
    return { ok: false, errors: [{ path: "", message: parsed.error, code: "err.sceneJson" }] };
  }
  const scene = sceneFromPayload(toPayloadForAnimation(parsed.animation), skins.steve, skins.alex).scene;
  return {
    ok: true,
    value: {
      doc: { v: 2, cast: [{ name: "Steve", skin: "steve", motion: { animation: parsed.animation } }] },
      scene,
      camera: null,
      poster: parsePosterText({}),
      motion: { ...DEFAULT_MOTION_EXPORT },
      warnings: [`Loaded a v1 animation file ("${parsed.animation.name}") as a one-avatar scene.`],
      refetch: [],
    },
  };
}

function toPayloadForAnimation(animation: AnimationDef) {
  return {
    v: 1 as const,
    activeId: "p_anim",
    background: "studio" as const,
    grade: "clean" as const,
    outline: "none" as const,
    godrays: false,
    light: "soft" as const,
    keyIntensity: 1,
    formatId: "youtube",
    players: [
      {
        id: "p_anim",
        name: "Steve",
        source: "builtin" as const,
        username: null,
        model: "default" as const,
        poseId: "idle",
        joints: poseById("idle").joints,
        clip: "custom" as const,
        clipSpeed: 1,
        customAnimation: animation,
        showOuter: true,
        layerMode: "flat" as const,
        position: { x: 0, y: 0, z: 0 },
        scale: 1,
        nametag: "",
        bubble: "",
        showCape: true,
        capeUrl: null,
      },
    ],
  };
}

/** Accept a v2 scene, a v1 animation, or a share/project payload. */
export function loadAnyScene(value: unknown, skins: { steve: string; alex: string }): ParseSceneResult {
  if (isRecord(value) && value.v === 1 && Array.isArray((value as { keyframes?: unknown }).keyframes)) {
    return wrapAnimationDocument(value, skins);
  }
  return parseSceneDocument(value, skins);
}

export type { SceneDocStage as StageDoc, SceneDocCamera as CameraDoc };
export { catalogIdKind };
