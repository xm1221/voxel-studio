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
export type ClipId = "none" | "idle" | "walk" | "run" | "wave" | "cheer";
export type LayerMode = "flat" | "voxel";

export type SceneDraft = {
  players: PlayerDraft[];
  activeId: string;
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
