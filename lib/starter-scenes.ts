import { poseById } from "./poses.ts";
import type { PosterText } from "./poster.ts";
import type {
  BackgroundFit,
  BackgroundId,
  CameraSnapshot,
  ClipId,
  GradeId,
  LightId,
  OutlineId,
  SceneDraft,
  SceneProp,
} from "./types.ts";

export type StarterSceneId =
  | "wilderness-hero"
  | "cave-encounter"
  | "nether-expedition"
  | "pastoral-rest";

export type StarterPropDef = Omit<SceneProp, "id"> & {
  id?: string;
};

export type StarterScene = {
  id: StarterSceneId;
  name: string;
  hint: string;
  poseId: string;
  clip: ClipId;
  clipSpeed: number;
  background: BackgroundId;
  backgroundImage?: string | null;
  backgroundFit?: BackgroundFit;
  grade: GradeId;
  outline: OutlineId;
  godrays: boolean;
  light: LightId;
  keyIntensity: number;
  formatId: string;
  camera: CameraSnapshot;
  poster: PosterText;
  props: StarterPropDef[];
};

export const STARTER_SCENES: StarterScene[] = [
  {
    id: "wilderness-hero",
    name: "荒野英雄",
    hint: "持剑守护、正午阳光、仰拍海报",
    poseId: "guard",
    clip: "idle",
    clipSpeed: 1,
    background: "noon",
    grade: "clean",
    outline: "ink",
    godrays: true,
    light: "hard",
    keyIntensity: 1.3,
    formatId: "story",
    camera: { p: [12, 4, 38], t: [0, 8, 0] },
    poster: {
      template: "mod-promo",
      title: "WILDERNESS HERO",
      subtitle: "A NEW CHAPTER BEGINS",
      kicker: "SURVIVAL",
      scale: 1,
      panel: true,
    },
    props: [
      {
        catalogId: "item:diamond_sword",
        name: "Diamond Sword",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: -30, y: 0, z: 0 },
        scale: { x: 0.9, y: 0.9, z: 0.9 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "block:grass_block",
        name: "",
        position: { x: -8, y: 0, z: -4 },
        rotation: { x: 0, y: 15, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:stone",
        name: "",
        position: { x: 10, y: 0, z: 6 },
        rotation: { x: 0, y: -20, z: 0 },
        scale: { x: 0.8, y: 0.8, z: 0.8 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
    ],
  },
  {
    id: "cave-encounter",
    name: "矿洞奇遇",
    hint: "举火把探险、苦力怕逼近、月光冷调",
    poseId: "torch",
    clip: "crouch",
    clipSpeed: 0.8,
    background: "night",
    grade: "comic",
    outline: "sticker",
    godrays: false,
    light: "moon",
    keyIntensity: 1.25,
    formatId: "square",
    camera: { p: [26, 9, 44], t: [2, 6, -4] },
    poster: {
      template: "vertical-card",
      title: "DEEP IN THE CAVE",
      subtitle: "WATCH YOUR BACK",
      kicker: "DANGER",
      scale: 1,
      panel: true,
    },
    props: [
      {
        catalogId: "block:torch",
        name: "Torch",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 15, y: 0, z: 0 },
        scale: { x: 0.8, y: 0.8, z: 0.8 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "lHand" },
      },
      {
        catalogId: "item:diamond_pickaxe",
        name: "Diamond Pickaxe",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: -35, y: 0, z: 0 },
        scale: { x: 0.85, y: 0.85, z: 0.85 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "entity:creeper",
        name: "Creeper",
        position: { x: 14, y: 0, z: -16 },
        rotation: { x: 0, y: -25, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:stone",
        name: "",
        position: { x: -10, y: 0, z: 8 },
        rotation: { x: 0, y: 30, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
    ],
  },
  {
    id: "nether-expedition",
    name: "下界远征",
    hint: "横扫劈砍、下界红雾体积光、电影感",
    poseId: "slash",
    clip: "attack",
    clipSpeed: 1,
    background: "nether",
    grade: "clean",
    outline: "ink",
    godrays: true,
    light: "hard",
    keyIntensity: 1.35,
    formatId: "youtube",
    camera: { p: [18, 5, 42], t: [0, 8, 0] },
    poster: {
      template: "lower-third",
      title: "NETHER EXPEDITION",
      subtitle: "INTO THE FLAMES",
      kicker: "CHAPTER 2",
      scale: 1,
      panel: true,
    },
    props: [
      {
        catalogId: "item:diamond_sword",
        name: "Diamond Sword",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: -45, y: 20, z: -10 },
        scale: { x: 0.95, y: 0.95, z: 0.95 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "block:tnt",
        name: "TNT",
        position: { x: -12, y: 0, z: 6 },
        rotation: { x: 0, y: 25, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:stone",
        name: "",
        position: { x: 14, y: 0, z: -8 },
        rotation: { x: 0, y: -15, z: 0 },
        scale: { x: 1.1, y: 1.1, z: 1.1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
    ],
  },
  {
    id: "pastoral-rest",
    name: "田园小憩",
    hint: "坐在原木、黄昏柔光、猪与小鸡陪伴",
    poseId: "sit",
    clip: "sit",
    clipSpeed: 1,
    background: "sunset",
    grade: "clean",
    outline: "none",
    godrays: true,
    light: "soft",
    keyIntensity: 1.15,
    formatId: "desktop",
    camera: { p: [16, 10, 48], t: [0, 3, 0] },
    poster: {
      template: "clean",
      title: "PASTORAL REST",
      subtitle: "SUNSET AT THE FARM",
      kicker: "PEACEFUL",
      scale: 1,
      panel: true,
    },
    props: [
      {
        catalogId: "block:oak_log",
        name: "Oak Log",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "item:apple",
        name: "Apple",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.7, y: 0.7, z: 0.7 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "entity:pig",
        name: "Pig",
        position: { x: -14, y: 0, z: 10 },
        rotation: { x: 0, y: 40, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "entity:chicken",
        name: "Chicken",
        position: { x: 12, y: 0, z: 8 },
        rotation: { x: 0, y: -30, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
    ],
  },
];

export function starterSceneById(id: string): StarterScene | undefined {
  return STARTER_SCENES.find((scene) => scene.id === id);
}

/**
 * Apply a starter scene template while preserving current player's
 * skin, model (slim/default), cape, and name.
 */
export function applyStarterScene(
  current: SceneDraft,
  template: StarterScene,
): { scene: SceneDraft; camera: CameraSnapshot; poster: PosterText } {
  const activeId = current.activeId;
  const pose = poseById(template.poseId);

  const players = current.players.map((player) => {
    if (player.id !== activeId) return player;
    return {
      ...player,
      poseId: template.poseId,
      joints: { ...pose.joints },
      clip: template.clip,
      clipSpeed: template.clipSpeed,
      customAnimation: null,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    };
  });

  const props: SceneProp[] = template.props.map((propDef, index) => ({
    id: propDef.id || `prop_starter_${index + 1}`,
    catalogId: propDef.catalogId,
    name: propDef.name || "",
    position: { ...propDef.position },
    rotation: { ...propDef.rotation },
    scale: { ...propDef.scale },
    pivot: { ...propDef.pivot },
    hidden: Boolean(propDef.hidden),
    locked: Boolean(propDef.locked),
    attach: propDef.attach
      ? {
          playerId: propDef.attach.playerId || activeId,
          slot: propDef.attach.slot,
        }
      : null,
  }));

  const scene: SceneDraft = {
    ...current,
    players,
    props,
    activePropId: props.length > 0 ? props[0].id : null,
    propClip: null,
    pack: null,
    background: template.background,
    backgroundImage: template.backgroundImage ?? null,
    backgroundFit: template.backgroundFit ?? "cover",
    grade: template.grade,
    outline: template.outline,
    godrays: template.godrays,
    light: template.light,
    keyIntensity: template.keyIntensity,
    formatId: template.formatId,
  };

  return {
    scene,
    camera: { ...template.camera },
    poster: structuredClone(template.poster),
  };
}
