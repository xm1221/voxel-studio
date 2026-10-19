export const FACE_NAMES = ["east", "west", "up", "down", "south", "north"] as const;
export type FaceName = (typeof FACE_NAMES)[number];

export type TintKind = "grass" | "foliage" | "water" | "redstone";

export type CompiledFace = {
  uv: [number, number, number, number];
  /** Path under the vanilla texture root, such as `block/stone.png`, or a `custom:` key. */
  texture: string;
  tint?: TintKind;
  /** Clockwise UV rotation in degrees: 0, 90, 180, or 270. */
  rotation?: number;
};

export type CompiledRotation = {
  origin: [number, number, number];
  axis: "x" | "y" | "z";
  angle: number;
  rescale?: boolean;
};

export type CompiledElement = {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: CompiledRotation;
  faces: Partial<Record<FaceName, CompiledFace>>;
};

export type CompiledModel = {
  elements: CompiledElement[];
  particle?: string;
  /** Flat generated-item layers. Empty when the model is made of elements. */
  layers?: string[];
};

export type Vec3 = { x: number; y: number; z: number };

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}
