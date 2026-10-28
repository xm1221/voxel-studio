import type { PropClip } from "./prop-clip.ts";

export type ModelType = "default" | "slim";

export type PlayerSource = "builtin" | "username" | "upload";

export type Joints = {
  headX: number;
  headY: number;
  bodyX: number;
  rArmX: number;
  rArmZ: number;
  rElbow: number;
  lArmX: number;
  lArmZ: number;
  lElbow: number;
  rLegX: number;
  rKnee: number;
  lLegX: number;
  lKnee: number;
};

export type PlayerDraft = {
  id: string;
  name: string;
  source: PlayerSource;
  username: string | null;
  skinUrl: string;
  capeUrl: string | null;
  showCape: boolean;
  model: ModelType;
  poseId: string;
  joints: Joints;
  clip: ClipId;
  clipSpeed: number;
  /** Imported keyframe animation. Built-in clips stay in `clip`. */
  customAnimation: AnimationDef | null;
  showOuter: boolean;
  layerMode: LayerMode;
  position: {
    x: number;
    y: number;
    z: number;
  };
  scale: number;
  nametag: string;
  bubble: string;
};

export type BackgroundId = "studio" | "noon" | "sunset" | "night" | "nether" | "none";
export type BackgroundFit = "cover" | "contain";
export type GradeId = "clean" | "hologram" | "ice" | "comic";
export type OutlineId = "none" | "ink" | "sticker";
export type LightId = "soft" | "hard" | "neon" | "moon";
export type BuiltinClipId =
  | "none"
  | "idle"
  | "walk"
  | "run"
  | "wave"
  | "cheer"
  | "crouch"
  | "attack"
  | "fly"
  | "swim"
  | "nod"
  | "spin"
  | "jump"
  | "sit";
export type ClipId = BuiltinClipId | "custom";
export type LayerMode = "flat" | "voxel";

/** Interpolation used from this keyframe to the next. Missing means smoothstep (v1 behavior). */
export type EaseId = "linear" | "smoothstep" | "ease-in-out";

export type AnimationKeyframe = {
  time: number;
  /** Missing joints fall back to the player's current pose when sampled. */
  joints: Partial<Joints>;
  bob: number;
  sway: number;
  roll: number;
  cape: number;
  /** Optional. Absent segments keep the original v1 smoothstep. */
  ease?: EaseId;
  /** Turn of the whole body in degrees. Omitted when zero, so v1 files stay byte-identical. */
  yaw?: number;
};

/** Versioned keyframe animation format used by imports, exports, and share links. */
export type AnimationDef = {
  v: 1;
  name: string;
  duration: number;
  loop: boolean;
  keyframes: AnimationKeyframe[];
};

export type PropKind = "block" | "item" | "entity";

export type SceneProp = {
  id: string;
  catalogId: string;
  /** Empty until the user renames it. The shelf then falls back to the catalog label. */
  name: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  /** Degrees, XYZ Euler. */
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
  /** Offset of the mesh inside the rotation pivot. Zero keeps the old ground-center pivot. */
  pivot: {
    x: number;
    y: number;
    z: number;
  };
  hidden: boolean;
  locked: boolean;
};

export type SceneDraft = {
  players: PlayerDraft[];
  activeId: string;
  /** Blocks, items, and simple entities standing with the skins. */
  props: SceneProp[];
  activePropId: string | null;
  /** Keyframes for prop transforms. Omitted from older scenes. */
  propClip?: PropClip | null;
  background: BackgroundId;
  /** Data URL kept on this browser. Share links omit it. */
  backgroundImage: string | null;
  backgroundFit: BackgroundFit;
  grade: GradeId;
  outline: OutlineId;
  godrays: boolean;
  light: LightId;
  keyIntensity: number;
  formatId: string;
};

export type CameraSnapshot = {
  p: [number, number, number];
  t: [number, number, number];
};
