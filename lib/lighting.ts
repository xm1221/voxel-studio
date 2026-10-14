import { AmbientLight, DirectionalLight, HemisphereLight, type Scene } from "three";
import type { LightId, SceneDraft } from "./types";

export const LIGHT_PRESETS: Record<
  LightId,
  { key: number; fill: number; rim: number; keyColor: number; fillColor: number; rimColor: number; hemi: number }
> = {
  soft: { key: 2.35, fill: 0.85, rim: 1.45, keyColor: 0xfff1dc, fillColor: 0xc9d6ff, rimColor: 0xffe2c4, hemi: 0.62 },
  hard: { key: 3.5, fill: 0.28, rim: 1.9, keyColor: 0xffffff, fillColor: 0x9eb0d1, rimColor: 0xfff6ea, hemi: 0.34 },
  neon: { key: 2.5, fill: 1.35, rim: 2.3, keyColor: 0xff4fd8, fillColor: 0x3de1ff, rimColor: 0xb388ff, hemi: 0.28 },
  moon: { key: 1.85, fill: 0.4, rim: 1.55, keyColor: 0xd5e4ff, fillColor: 0x1b3b6a, rimColor: 0xf4f8ff, hemi: 0.22 },
};

export type StudioLights = {
  hemi: HemisphereLight;
  key: DirectionalLight;
  fill: DirectionalLight;
  rim: DirectionalLight;
};

export function createLights(scene: Scene): StudioLights {
  const hemi = new HemisphereLight(0xfff6ec, 0x241c18, 0.62);
  scene.add(hemi);
  scene.add(new AmbientLight(0xffffff, 0.18));
  const key = new DirectionalLight(0xfff1dc, 2.35);
  key.position.set(28, 52, 34);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00045;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new DirectionalLight(0xc9d6ff, 0.85);
  fill.position.set(-36, 18, 28);
  scene.add(fill);
  const rim = new DirectionalLight(0xffe2c4, 1.45);
  rim.position.set(-8, 26, -42);
  scene.add(rim);
  return { hemi, key, fill, rim };
}

export function applyLights(lights: StudioLights, draft: SceneDraft) {
  const preset = LIGHT_PRESETS[draft.light];
  const gain = draft.keyIntensity;
  lights.key.intensity = preset.key * gain;
  lights.fill.intensity = preset.fill;
  lights.rim.intensity = preset.rim;
  lights.key.color.set(preset.keyColor);
  lights.fill.color.set(preset.fillColor);
  lights.rim.color.set(preset.rimColor);
  lights.hemi.intensity = preset.hemi;
  lights.hemi.color.set(draft.light === "moon" ? 0xb7c8e6 : draft.light === "neon" ? 0xffd0f5 : 0xfff6ec);
  const span = 36 + draft.players.length * 16;
  const shadow = lights.key.shadow.camera;
  shadow.left = -span;
  shadow.right = span;
  shadow.top = span;
  shadow.bottom = -span;
  shadow.near = 8;
  shadow.far = 180;
  shadow.updateProjectionMatrix();
}
