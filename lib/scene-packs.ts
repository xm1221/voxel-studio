import type { BackgroundFit, BackgroundId, CameraSnapshot, GradeId, LightId, OutlineId, SceneDraft } from "./types";

/**
 * One-click looks for a shot: lights, grade, outline, godrays, background, and
 * camera together. Packs never touch players, props, or the export size — they
 * only restyle what is already on the stage.
 */
export type ScenePack = {
  id: string;
  name: string;
  hint: string;
  background: BackgroundId;
  grade: GradeId;
  outline: OutlineId;
  godrays: boolean;
  light: LightId;
  keyIntensity: number;
  /** Camera for a single player. Stored in the same shape as share links. */
  camera: CameraSnapshot;
  /** Export size that suits the look, or null to keep the current one. */
  formatId: string | null;
};

export const SCENE_PACKS: ScenePack[] = [
  {
    id: "hero-studio",
    name: "英雄棚拍",
    hint: "柔光加墨线，正面平视，适合方图和封面。",
    background: "studio",
    grade: "clean",
    outline: "ink",
    godrays: false,
    light: "soft",
    keyIntensity: 1.15,
    camera: { p: [14, 8, 52], t: [0, 5, 0] },
    formatId: "square",
  },
  {
    id: "promo-poster",
    name: "Mod 宣传",
    hint: "硬光、贴纸描边和体积光，留出标题的位置。",
    background: "sunset",
    grade: "comic",
    outline: "sticker",
    godrays: true,
    light: "hard",
    keyIntensity: 1.3,
    camera: { p: [22, 9, 58], t: [0, 5, 0] },
    formatId: "story",
  },
  {
    id: "x-header",
    name: "X 头图",
    hint: "横幅比例，霓虹侧光，人物偏右，左边留给文字。",
    background: "night",
    grade: "hologram",
    outline: "none",
    godrays: true,
    light: "neon",
    keyIntensity: 1.1,
    camera: { p: [16, 7, 50], t: [-6, 5, 0] },
    formatId: "banner",
  },
  {
    id: "nether-cinema",
    name: "下界电影感",
    hint: "下界红雾、月光冷调、墨线，低机位仰拍。",
    background: "nether",
    grade: "clean",
    outline: "ink",
    godrays: true,
    light: "moon",
    keyIntensity: 1.2,
    camera: { p: [18, 4, 46], t: [0, 7, 0] },
    formatId: "youtube",
  },
  {
    id: "ice-sheen",
    name: "冰面高光",
    hint: "正午日光配冰肌理，干净描边，适合桌面壁纸。",
    background: "noon",
    grade: "ice",
    outline: "none",
    godrays: false,
    light: "hard",
    keyIntensity: 1.25,
    camera: { p: [20, 10, 54], t: [0, 5, 0] },
    formatId: "desktop",
  },
  {
    id: "sticker-sheet",
    name: "贴纸页",
    hint: "透明背景加白色贴纸边，方便抠进海报。",
    background: "none",
    grade: "clean",
    outline: "sticker",
    godrays: false,
    light: "soft",
    keyIntensity: 1.2,
    camera: { p: [12, 7, 48], t: [0, 5, 0] },
    formatId: "square",
  },
  {
    id: "vertical-hero",
    name: "竖版角色卡",
    hint: "竖屏机位拉近，柔光加墨线，留出上下标题区。",
    background: "sunset",
    grade: "clean",
    outline: "ink",
    godrays: true,
    light: "soft",
    keyIntensity: 1.1,
    camera: { p: [10, 6, 40], t: [0, 6, 0] },
    formatId: "story",
  },
  {
    id: "hologram-lab",
    name: "全息实验室",
    hint: "深夜蓝底、全息材质和霓虹补光，像展示模型。",
    background: "night",
    grade: "hologram",
    outline: "none",
    godrays: false,
    light: "neon",
    keyIntensity: 0.9,
    camera: { p: [16, 8, 46], t: [0, 5, 0] },
    formatId: "square",
  },
];

export const SCENE_PACK_IDS = new Set(SCENE_PACKS.map((pack) => pack.id));

export function scenePackById(id: string | undefined | null): ScenePack | null {
  return SCENE_PACKS.find((pack) => pack.id === id) ?? null;
}

/** What a pack changes on a scene. Players, props, and uploaded images stay. */
export type ScenePackLook = Pick<
  SceneDraft,
  "background" | "grade" | "outline" | "godrays" | "light" | "keyIntensity" | "formatId" | "backgroundFit"
>;

export function scenePackLook(pack: ScenePack, current?: Pick<SceneDraft, "backgroundFit">): ScenePackLook {
  return {
    background: pack.background,
    grade: pack.grade,
    outline: pack.outline,
    godrays: pack.godrays,
    light: pack.light,
    keyIntensity: pack.keyIntensity,
    formatId: pack.formatId ?? "youtube",
    backgroundFit: (current?.backgroundFit ?? "cover") as BackgroundFit,
  };
}

export function applyScenePack(scene: SceneDraft, pack: ScenePack): SceneDraft {
  return { ...scene, ...scenePackLook(pack, scene) };
}
