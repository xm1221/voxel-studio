import type { BackgroundFit, BackgroundId, SceneDraft } from "./types";

export const DEFAULT_SCENE_LOOK = {
  background: "studio",
  backgroundImage: null,
  backgroundFit: "cover",
  grade: "clean",
  outline: "none",
  godrays: false,
  light: "soft",
  keyIntensity: 1,
} as const satisfies Pick<
  SceneDraft,
  "background" | "backgroundImage" | "backgroundFit" | "grade" | "outline" | "godrays" | "light" | "keyIntensity"
>;

/** Lights, grade, outline, godrays, and background — including a local background image. */
export function resetSceneLook(scene: SceneDraft): SceneDraft {
  return { ...scene, ...DEFAULT_SCENE_LOOK, pack: null };
}

export const BACKGROUNDS: Record<Exclude<BackgroundId, "none">, number> = {
  studio: 0xe4eef9,
  noon: 0x79b4ea,
  sunset: 0xe08a52,
  night: 0x0d1424,
  nether: 0x401512,
};

export type StageLook = {
  customImage: boolean;
  studioFloor: boolean;
  grass: boolean;
  nether: boolean;
  shadowFloor: boolean;
  shadowOpacity: number;
  /** Preset sky color. Null means a transparent clear. A custom image paints over this. */
  sky: number | null;
  fog: boolean;
  rays: boolean;
  rayColor: number;
  rayOpacity: number;
};

/** Where to draw an image so it covers or sits inside the view. */
export function backgroundDrawRect(
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number,
  fit: BackgroundFit,
) {
  const iw = Math.max(imageWidth, 1);
  const ih = Math.max(imageHeight, 1);
  const vw = Math.max(viewWidth, 1);
  const vh = Math.max(viewHeight, 1);
  const imageAspect = iw / ih;
  const viewAspect = vw / vh;
  const scale =
    fit === "contain"
      ? imageAspect > viewAspect
        ? vw / iw
        : vh / ih
      : imageAspect > viewAspect
        ? vh / ih
        : vw / iw;
  const width = iw * scale;
  const height = ih * scale;
  return { x: (vw - width) / 2, y: (vh - height) / 2, width, height };
}

/** Floor, sky, and fog for one background. A custom image hides preset floors and fog but keeps the shadow. */
export function stageLook(draft: Pick<SceneDraft, "background" | "godrays" | "light" | "backgroundImage">): StageLook {
  const customImage = Boolean(draft.backgroundImage);
  const outdoor = draft.background === "noon" || draft.background === "sunset" || draft.background === "night";
  return {
    customImage,
    studioFloor: !customImage && draft.background === "studio",
    grass: !customImage && outdoor,
    nether: !customImage && draft.background === "nether",
    shadowFloor: true,
    shadowOpacity: !customImage && draft.background === "none" ? 0.45 : customImage ? 0.42 : 0.28,
    sky: draft.background === "none" ? null : BACKGROUNDS[draft.background],
    fog: !customImage && draft.background !== "none" && draft.background !== "studio",
    rays: Boolean(draft.godrays) && !customImage && draft.background !== "none",
    rayColor: draft.background === "night" || draft.light === "moon" ? 0xc5d7ff : draft.background === "nether" ? 0xff7844 : 0xfff0d0,
    rayOpacity: draft.background === "noon" ? 0.07 : 0.11,
  };
}
