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
export type BuiltinClipId = "none" | "idle" | "walk" | "run" | "wave" | "cheer";
export type ClipId = BuiltinClipId | "custom";
export type LayerMode = "flat" | "voxel";

export type AnimationKeyframe = {
  time: number;
  /** Missing joints fall back to the player's current pose when sampled. */
  joints: Partial<Joints>;
  bob: number;
  sway: number;
  roll: number;
  cape: number;
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
  position: {
    x: number;
    y: number;
    z: number;
  };
  /** Degrees around Y. */
  rotationY: number;
  scale: number;
};

export type SceneDraft = {
  players: PlayerDraft[];
  activeId: string;
  /** Blocks, items, and simple entities standing with the skins. */
  props: SceneProp[];
  activePropId: string | null;
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
