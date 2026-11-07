import { poseById } from "./poses.ts";
import type { PosterText } from "./poster.ts";
import type {
  AnimationDef,
  BackgroundFit,
  BackgroundId,
  CameraSnapshot,
  ClipId,
  GradeId,
  LightId,
  OutlineId,
  PlayerDraft,
  SceneDraft,
  SceneProp,
   Vec3,
} from "./types.ts";

export type StarterSceneId =
  | "wilderness-hero"
  | "cave-encounter"
  | "nether-expedition"
  | "pastoral-rest"
  | "duo-showdown"
  | "sword-combo";

export type StarterPropDef = Omit<SceneProp, "id"> & {
  id?: string;
};

export type StarterSecondaryPlayer = {
  poseId: string;
  clip: ClipId;
  clipSpeed: number;
  position: Vec3;
  yaw: number;
};

export type StarterScene = {
  id: StarterSceneId;
  name: string;
  hint: string;
  poseId: string;
  clip: ClipId;
  clipSpeed: number;
  customAnimation?: AnimationDef | null;
  playerPosition?: Vec3;
  playerYaw?: number;
  secondaryPlayer?: StarterSecondaryPlayer;
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

const SWORD_COMBO_ANIMATION: AnimationDef = {
  name: "Sword Combo",
  duration: 1.8,
  loop: true,
  keyframes: [
    {
      time: 0,
      easing: "easeInOut",
      joints: {
        headX: 4,
        headY: -12,
        bodyX: 6,
        rArmX: -48,
        rArmZ: -16,
        rElbow: -38,
        lArmX: -45,
        lArmZ: 22,
        lElbow: -55,
        rLegX: -18,
        rKnee: 20,
        lLegX: 16,
        lKnee: 10,
      },
    },
    {
      time: 0.45,
      easing: "easeIn",
      joints: {
        headX: -8,
        headY: -24,
        bodyX: -8,
        rArmX: -125,
        rArmZ: -35,
        rElbow: -45,
        lArmX: 25,
        lArmZ: 28,
        lElbow: -30,
        rLegX: 22,
        rKnee: 15,
        lLegX: -28,
        lKnee: 30,
      },
      yaw: -18,
    },
    {
      time: 0.85,
      easing: "easeOut",
      joints: {
        headX: 10,
        headY: 22,
        bodyX: 18,
        rArmX: -32,
        rArmZ: 28,
        rElbow: -18,
        lArmX: 42,
        lArmZ: 36,
        lElbow: -35,
        rLegX: -45,
        rKnee: 48,
        lLegX: 34,
        lKnee: 18,
      },
      bob: -1.2,
      yaw: 24,
    },
    {
      time: 1.35,
      easing: "easeInOut",
      joints: {
        headX: -6,
        headY: 8,
        bodyX: 4,
        rArmX: -85,
        rArmZ: -42,
        rElbow: -25,
        lArmX: -30,
        lArmZ: 26,
        lElbow: -40,
        rLegX: -24,
        rKnee: 25,
        lLegX: 20,
        lKnee: 12,
      },
      yaw: 6,
    },
  ],
};

export const STARTER_SCENES: StarterScene[] = [
  {
    id: "wilderness-hero",
    name: "荒野英雄",
    hint: "持剑戒备、营地工作台、正午体积光海报",
    poseId: "guard",
    clip: "idle",
    clipSpeed: 1,
    playerPosition: { x: 0, y: 0, z: 0 },
    playerYaw: 12,
    background: "noon",
    grade: "clean",
    outline: "ink",
    godrays: true,
    light: "hard",
    keyIntensity: 1.3,
    formatId: "story",
    camera: { p: [16, 6, 42], t: [0, 4, 0] },
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
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "block:crafting_table",
        name: "Crafting Table",
        position: { x: 14, y: 0, z: -6 },
        rotation: { x: 0, y: -22, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:torch",
        name: "Camp Torch",
        position: { x: 14, y: 16, z: -6 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:grass_block",
        name: "",
        position: { x: -14, y: 0, z: -8 },
        rotation: { x: 0, y: 15, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "entity:chicken",
        name: "Chicken",
        position: { x: -12, y: 0, z: 8 },
        rotation: { x: 0, y: 35, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
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
    hint: "左手高举火把、右手握钻石镐、身后苦力怕逼近",
    poseId: "torch",
    clip: "idle",
    clipSpeed: 0.85,
    playerPosition: { x: -2, y: 0, z: 2 },
    playerYaw: -10,
    background: "night",
    grade: "comic",
    outline: "sticker",
    godrays: false,
    light: "moon",
    keyIntensity: 1.25,
    formatId: "square",
    camera: { p: [24, 8, 44], t: [1, 4, -2] },
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
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "lHand" },
      },
      {
        catalogId: "item:diamond_pickaxe",
        name: "Diamond Pickaxe",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "entity:creeper",
        name: "Creeper",
        position: { x: 12, y: 0, z: -12 },
        rotation: { x: 0, y: -28, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:stone",
        name: "",
        position: { x: -16, y: 0, z: -10 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:stone",
        name: "",
        position: { x: -16, y: 16, z: -10 },
        rotation: { x: 0, y: 90, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:tnt",
        name: "TNT",
        position: { x: -14, y: 0, z: 6 },
        rotation: { x: 0, y: 20, z: 0 },
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
    hint: "横扫劈砍、下界红雾体积光、电影级宽屏",
    poseId: "slash",
    clip: "idle",
    clipSpeed: 1,
    playerPosition: { x: -4, y: 0, z: 0 },
    playerYaw: -18,
    background: "nether",
    grade: "clean",
    outline: "ink",
    godrays: true,
    light: "hard",
    keyIntensity: 1.35,
    formatId: "youtube",
    camera: { p: [20, 6, 44], t: [0, 4, 0] },
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
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "block:tnt",
        name: "TNT",
        position: { x: -16, y: 0, z: 6 },
        rotation: { x: 0, y: 25, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "entity:slime",
        name: "Magma Slime",
        position: { x: 14, y: 0, z: 6 },
        rotation: { x: 0, y: -45, z: 0 },
        scale: { x: 1.15, y: 1.15, z: 1.15 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:netherrack",
        name: "",
        position: { x: 16, y: 0, z: -10 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
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
    hint: "安坐原木长椅、手持红苹果、黄昏暖光与农场伙伴",
    poseId: "sit",
    clip: "sit",
    clipSpeed: 1,
    // Seated thighs rest at y = -12 + playerPosition.y = -8, right on top of the log bench (top at y = -8).
    playerPosition: { x: 0, y: 4, z: 2 },
    playerYaw: 0,
    background: "sunset",
    grade: "clean",
    outline: "none",
    godrays: true,
    light: "soft",
    keyIntensity: 1.15,
    formatId: "desktop",
    camera: { p: [18, 9, 46], t: [0, 3, 0] },
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
        catalogId: "item:apple",
        name: "Apple",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "block:oak_log",
        name: "Oak Bench",
        position: { x: 0, y: -8, z: -2 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:oak_log",
        name: "Oak Bench Side",
        position: { x: -16, y: -8, z: -2 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:crafting_table",
        name: "Crafting Table",
        position: { x: 16, y: 0, z: -6 },
        rotation: { x: 0, y: -20, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
      {
        catalogId: "block:torch",
        name: "Lantern Torch",
        position: { x: 16, y: 16, z: -6 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
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
        position: { x: 12, y: 0, z: 9 },
        rotation: { x: 0, y: -35, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
    ],
  },
  {
    id: "duo-showdown",
    name: "双人对决",
    hint: "双角色同台交锋、刀镐相向、黄昏史诗海报",
    poseId: "guard",
    clip: "idle",
    clipSpeed: 1,
    playerPosition: { x: -11, y: 0, z: 3 },
    playerYaw: 48,
    secondaryPlayer: {
      poseId: "slash",
      clip: "idle",
      clipSpeed: 1,
      position: { x: 11, y: 0, z: -2 },
      yaw: -132,
    },
    background: "sunset",
    grade: "clean",
    outline: "ink",
    godrays: true,
    light: "hard",
    keyIntensity: 1.35,
    formatId: "youtube",
    camera: { p: [6, 7, 48], t: [0, 4, 0] },
    poster: {
      template: "lower-third",
      title: "RIVAL SHOWDOWN",
      subtitle: "ONLY ONE STANDS TALL",
      kicker: "PVP ARENA",
      scale: 1,
      panel: true,
    },
    props: [
      {
        catalogId: "item:diamond_sword",
        name: "Hero Sword",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "item:diamond_pickaxe",
        name: "Rival Pickaxe",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "__secondary__", slot: "rHand" },
      },
      {
        catalogId: "block:tnt",
        name: "TNT",
        position: { x: 0, y: 0, z: -12 },
        rotation: { x: 0, y: 15, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: null,
      },
    ],
  },
  {
    id: "sword-combo",
    name: "挥剑连击动画",
    hint: "自带四关键帧挥砍连招时间轴，一键预览/导出 GIF 与 MP4",
    poseId: "slash",
    clip: "custom",
    clipSpeed: 1,
    customAnimation: SWORD_COMBO_ANIMATION,
    playerPosition: { x: 0, y: 0, z: 0 },
    playerYaw: 0,
    background: "noon",
    grade: "comic",
    outline: "ink",
    godrays: true,
    light: "hard",
    keyIntensity: 1.3,
    formatId: "square",
    camera: { p: [20, 7, 44], t: [0, 4, 0] },
    poster: {
      template: "mod-promo",
      title: "BLADE COMBO",
      subtitle: "KEYFRAME ANIMATION",
      kicker: "ACTION CLIP",
      scale: 1,
      panel: true,
    },
    props: [
      {
        catalogId: "item:diamond_sword",
        name: "Diamond Sword",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        pivot: { x: 0, y: 0, z: 0 },
        hidden: false,
        locked: false,
        attach: { playerId: "", slot: "rHand" },
      },
      {
        catalogId: "entity:creeper",
        name: "Target Dummy",
        position: { x: 10, y: 0, z: 12 },
        rotation: { x: 0, y: -140, z: 0 },
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
  fallbackSecondSkin?: { skinUrl: string; model?: "default" | "slim"; name?: string },
): { scene: SceneDraft; camera: CameraSnapshot; poster: PosterText } {
  const activeId = current.activeId;
  const pose = poseById(template.poseId);

  const players: PlayerDraft[] = current.players.map((player) => {
    if (player.id !== activeId) return player;
    return {
      ...player,
      poseId: template.poseId,
      joints: { ...pose.joints },
      clip: template.clip,
      clipSpeed: template.clipSpeed,
      customAnimation: template.customAnimation ? structuredClone(template.customAnimation) : null,
      position: template.playerPosition ? { ...template.playerPosition } : { x: 0, y: 0, z: 0 },
      yaw: template.playerYaw ?? 0,
    };
  });

  let secondaryId = players.find((p) => p.id !== activeId)?.id ?? "";
  if (template.secondaryPlayer) {
    const secPose = poseById(template.secondaryPlayer.poseId);
    if (secondaryId) {
      for (let i = 0; i < players.length; i += 1) {
        if (players[i].id === secondaryId) {
          players[i] = {
            ...players[i],
            poseId: template.secondaryPlayer.poseId,
            joints: { ...secPose.joints },
            clip: template.secondaryPlayer.clip,
            clipSpeed: template.secondaryPlayer.clipSpeed,
            customAnimation: null,
            position: { ...template.secondaryPlayer.position },
            yaw: template.secondaryPlayer.yaw,
          };
          break;
        }
      }
    } else {
      const primary = players.find((p) => p.id === activeId) ?? players[0];
      secondaryId = `${activeId}_2`;
      players.push({
        id: secondaryId,
        name: fallbackSecondSkin?.name ?? "Alex",
        source: "builtin",
        username: null,
        skinUrl: fallbackSecondSkin?.skinUrl ?? primary.skinUrl,
        capeUrl: null,
        showCape: true,
        model: fallbackSecondSkin?.model ?? "slim",
        showOuter: true,
        layerMode: primary.layerMode,
        poseId: template.secondaryPlayer.poseId,
        joints: { ...secPose.joints },
        clip: template.secondaryPlayer.clip,
        clipSpeed: template.secondaryPlayer.clipSpeed,
        customAnimation: null,
        position: { ...template.secondaryPlayer.position },
        yaw: template.secondaryPlayer.yaw,
        scale: 1,
        nametag: "",
        bubble: "",
      });
    }
  }

  const props: SceneProp[] = template.props.map((propDef, index) => {
    let targetPlayerId = activeId;
    if (propDef.attach?.playerId === "__secondary__") {
      targetPlayerId = secondaryId || activeId;
    } else if (propDef.attach?.playerId) {
      targetPlayerId = propDef.attach.playerId;
    }
    return {
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
            playerId: targetPlayerId,
            slot: propDef.attach.slot,
          }
        : null,
    };
  });

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
