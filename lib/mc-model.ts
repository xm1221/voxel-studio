import type { CompiledElement, CompiledFace, CompiledModel, CompiledRotation, FaceName, TintKind } from "./model-types.ts";
import { FACE_NAMES } from "./model-types.ts";

export type ModelDocument = {
  parent?: string;
  /** Strings, `#variables`, or `{ sprite, force_translucent }` from 26.x models. */
  textures?: Record<string, unknown>;
  elements?: RawElement[];
  ambientocclusion?: boolean;
};

type RawFace = {
  uv?: number[];
  texture?: string;
  tintindex?: number;
  rotation?: number;
  cullface?: string;
};

type RawElement = {
  from?: number[];
  to?: number[];
  rotation?: { origin?: number[]; axis?: string; angle?: number; rescale?: boolean };
  faces?: Partial<Record<string, RawFace>>;
  shade?: boolean;
};

export type ModelLibrary = {
  get(path: string): ModelDocument | null;
};

const GENERATED_PARENTS = new Set(["builtin/generated", "item/generated", "item/handheld", "builtin/entity"]);

const FACE_SET = new Set<string>(FACE_NAMES);

/** `minecraft:block/stone` → `block/stone.png`. Custom keys (`custom:…`) stay untouched. */
export function textureFile(reference: string) {
  const cleaned = reference.trim().replace(/^minecraft:/, "");
  if (!cleaned || cleaned.startsWith("#")) return "";
  if (cleaned.startsWith("custom:")) return cleaned;
  return cleaned.endsWith(".png") ? cleaned : `${cleaned}.png`;
}

export function modelPath(reference: string) {
  return reference.trim().replace(/^minecraft:/, "");
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function triple(value: number[] | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!value || value.length < 3) return fallback;
  return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
}

export function defaultFaceUv(face: FaceName, from: [number, number, number], to: [number, number, number]): [number, number, number, number] {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  switch (face) {
    case "down":
      return [x1, 16 - z2, x2, 16 - z1];
    case "up":
      return [x1, z1, x2, z2];
    case "north":
      return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case "south":
      return [x1, 16 - y2, x2, 16 - y1];
    case "west":
      return [z1, 16 - y2, z2, 16 - y1];
    case "east":
      return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
  }
}

export function tintForTexture(texture: string, tintindex: number | undefined, hint?: TintKind): TintKind | undefined {
  if (tintindex === undefined && !hint) return undefined;
  const name = texture.toLowerCase();
  if (name.includes("leaves") || name.includes("vine")) return "foliage";
  if (name.includes("water")) return "water";
  if (name.includes("redstone_dust") || name.includes("redstone")) return "redstone";
  if (hint && tintindex !== undefined) return hint;
  if (tintindex === undefined) return undefined;
  return hint ?? "grass";
}

function resolveTexture(name: string | undefined, textures: Record<string, string>, seen = new Set<string>()): string {
  if (!name || typeof name !== "string") return "";
  let current = name;
  for (let hop = 0; hop < 8; hop += 1) {
    // Vanilla writes `#variable`, but 26.x models such as heavy_core also use a
    // bare variable name (`"texture": "all"`). Treat a bare name as a variable
    // when the model defines it; otherwise it is a texture path.
    const key = current.startsWith("#") ? current.slice(1) : current;
    if (!current.startsWith("#") && !Object.prototype.hasOwnProperty.call(textures, key)) return textureFile(current);
    if (seen.has(key)) return "";
    seen.add(key);
    const next = textures[key];
    if (!next) return "";
    current = next;
  }
  return "";
}

function textureRef(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "sprite" in value && typeof (value as { sprite?: unknown }).sprite === "string") {
    return (value as { sprite: string }).sprite;
  }
  return "";
}

function mergeTextures(parent: Record<string, string>, child: Record<string, unknown> | undefined) {
  const merged = { ...parent };
  for (const [key, value] of Object.entries(child ?? {})) {
    const ref = textureRef(value);
    if (ref) merged[key] = ref;
  }
  return merged;
}

function generatedModel(textures: Record<string, string>, hint?: TintKind): CompiledModel {
  const layers = ["layer0", "layer1", "layer2"]
    .map((key) => resolveTexture(textures[key]?.startsWith("#") ? textures[key] : textures[key] ? `#${key}` : undefined, textures))
    .filter(Boolean);
  const particle = resolveTexture(textures.particle ? "#particle" : "#layer0", textures) || layers[0];
  const elements: CompiledElement[] = layers.map((texture, index) => {
    const inset = index * 0.1;
    const tint = hint && index > 0 ? hint : tintForTexture(texture, hint && index > 0 ? 0 : undefined, hint);
    const face: CompiledFace = { uv: [0, 0, 16, 16], texture, ...(tint ? { tint } : {}) };
    return {
      from: [0, 0, 7.5 - inset],
      to: [16, 16, 8.5 - inset],
      faces: {
        south: face,
        north: { ...face, uv: [16, 0, 0, 16] },
      },
    };
  });
  return { elements, ...(particle ? { particle } : {}), ...(layers.length ? { layers } : {}) };
}

function compileElements(raw: RawElement[], textures: Record<string, string>, hint?: TintKind): CompiledElement[] {
  const elements: CompiledElement[] = [];
  for (const element of raw) {
    const from = triple(element.from, [0, 0, 0]);
    const to = triple(element.to, [16, 16, 16]);
    const faces: CompiledElement["faces"] = {};
    for (const [name, face] of Object.entries(element.faces ?? {})) {
      if (!FACE_SET.has(name) || !face) continue;
      const texture = resolveTexture(face.texture, textures);
      if (!texture) continue;
      const uv = face.uv && face.uv.length >= 4 ? (face.uv.slice(0, 4).map((value) => round(Number(value) || 0)) as CompiledFace["uv"]) : defaultFaceUv(name as FaceName, from, to).map((value) => round(value)) as CompiledFace["uv"];
      const tint = tintForTexture(texture, face.tintindex, hint);
      const rotation = face.rotation === 90 || face.rotation === 180 || face.rotation === 270 ? face.rotation : undefined;
      faces[name as FaceName] = { uv, texture, ...(tint ? { tint } : {}), ...(rotation ? { rotation } : {}) };
    }
    if (!Object.keys(faces).length) continue;
    let rotation: CompiledRotation | undefined;
    if (element.rotation && (element.rotation.axis === "x" || element.rotation.axis === "y" || element.rotation.axis === "z")) {
      rotation = {
        origin: triple(element.rotation.origin, [8, 8, 8]),
        axis: element.rotation.axis,
        angle: Number(element.rotation.angle) || 0,
        ...(element.rotation.rescale ? { rescale: true } : {}),
      };
    }
    elements.push({ from, to, ...(rotation ? { rotation } : {}), faces });
  }
  return elements;
}

type Chain = { textures: Record<string, string>; elements?: RawElement[]; generated: boolean };

function collectChain(library: ModelLibrary, reference: string, seen = new Set<string>()): Chain | null {
  const path = modelPath(reference);
  if (!path || seen.has(path)) return null;
  seen.add(path);
  if (path === "builtin/generated" || path === "builtin/entity") return { textures: {}, generated: true };
  const document = library.get(path);
  if (!document) return GENERATED_PARENTS.has(path) ? { textures: {}, generated: true } : null;
  const parent = document.parent ? collectChain(library, document.parent, seen) : null;
  const textures = mergeTextures(parent?.textures ?? {}, document.textures);
  if (document.elements?.length) return { textures, elements: document.elements, generated: false };
  if (parent?.elements?.length) return { textures, elements: parent.elements, generated: false };
  return { textures, generated: Boolean(parent?.generated || GENERATED_PARENTS.has(path) || GENERATED_PARENTS.has(modelPath(document.parent ?? ""))) };
}

/** Resolve parent chains, texture variables, and generated-item layers. */
export function resolveModel(library: ModelLibrary, reference: string, hint?: TintKind): CompiledModel | null {
  const chain = collectChain(library, reference);
  if (!chain) return null;
  if (chain.elements?.length) {
    const elements = compileElements(chain.elements, chain.textures, hint);
    if (!elements.length) return null;
    const particle = resolveTexture(chain.textures.particle ? "#particle" : undefined, chain.textures) || elements[0]?.faces.up?.texture || elements[0]?.faces.north?.texture || elements[0]?.faces.south?.texture;
    return { elements, ...(particle ? { particle } : {}) };
  }
  if (chain.generated || chain.textures.layer0) return generatedModel(chain.textures, hint);
  return null;
}

const Y_CYCLE: FaceName[] = ["north", "east", "south", "west"];
const X_CYCLE: FaceName[] = ["north", "down", "south", "up"];

function cycleFaces(order: FaceName[], steps: number) {
  const map = new Map<FaceName, FaceName>();
  const turns = ((steps % 4) + 4) % 4;
  order.forEach((face, index) => {
    map.set(face, order[(index + turns) % 4]);
  });
  return map;
}

function remapFaces(faces: CompiledElement["faces"], map: Map<FaceName, FaceName>, uvTurns: number) {
  const next: CompiledElement["faces"] = {};
  for (const [name, face] of Object.entries(faces)) {
    if (!face) continue;
    const target = map.get(name as FaceName) ?? (name as FaceName);
    const rotation = ((face.rotation ?? 0) + uvTurns * 90) % 360;
    next[target] = { ...face, ...(rotation ? { rotation } : {}) };
  }
  return next;
}

function rotatePointY(x: number, z: number, degrees: number): [number, number] {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = x - 8;
  const dz = z - 8;
  return [round(8 + dx * c + dz * s), round(8 + dx * s - dz * c)];
}

function rotatePointX(y: number, z: number, degrees: number): [number, number] {
  const rad = (-degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dy = y - 8;
  const dz = z - 8;
  return [round(8 + dy * c - dz * s), round(8 + dy * s + dz * c)];
}

function bounds(points: Array<[number, number, number]>): { from: [number, number, number]; to: [number, number, number] } {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const zs = points.map((point) => point[2]);
  return {
    from: [round(Math.min(...xs)), round(Math.min(...ys)), round(Math.min(...zs))],
    to: [round(Math.max(...xs)), round(Math.max(...ys)), round(Math.max(...zs))],
  };
}

function corners(element: CompiledElement): Array<[number, number, number]> {
  const [x1, y1, z1] = element.from;
  const [x2, y2, z2] = element.to;
  return [
    [x1, y1, z1],
    [x2, y1, z1],
    [x2, y2, z1],
    [x1, y2, z1],
    [x1, y1, z2],
    [x2, y1, z2],
    [x2, y2, z2],
    [x1, y2, z2],
  ];
}

function rotateOrigin(origin: [number, number, number], x: number, y: number): [number, number, number] {
  let [ox, oy, oz] = origin;
  if (x) {
    const rotated = rotatePointX(oy, oz, x);
    oy = rotated[0];
    oz = rotated[1];
  }
  if (y) {
    const rotated = rotatePointY(ox, oz, y);
    ox = rotated[0];
    oz = rotated[1];
  }
  return [ox, oy, oz];
}

function rotateAxis(axis: "x" | "y" | "z", x: number, y: number): "x" | "y" | "z" {
  let current = axis;
  const xSteps = (((x / 90) % 4) + 4) % 4;
  const ySteps = (((y / 90) % 4) + 4) % 4;
  for (let step = 0; step < xSteps; step += 1) {
    if (current === "y") current = "z";
    else if (current === "z") current = "y";
  }
  for (let step = 0; step < ySteps; step += 1) {
    if (current === "x") current = "z";
    else if (current === "z") current = "x";
  }
  return current;
}

/** Bake a blockstate `x` / `y` rotation. Y+90 turns an east-facing stair toward south. */
export function rotateElements(elements: CompiledElement[], xDeg = 0, yDeg = 0, uvlock = false): CompiledElement[] {
  const x = ((Math.round(xDeg / 90) * 90) % 360 + 360) % 360;
  const y = ((Math.round(yDeg / 90) * 90) % 360 + 360) % 360;
  if (!x && !y) return elements;
  const xSteps = x / 90;
  const ySteps = y / 90;
  const xMap = cycleFaces(X_CYCLE, xSteps);
  const yMap = cycleFaces(Y_CYCLE, ySteps);
  return elements.map((element) => {
    let points = corners(element);
    if (x) points = points.map(([px, py, pz]) => {
      const [ny, nz] = rotatePointX(py, pz, x);
      return [px, ny, nz] as [number, number, number];
    });
    if (y) points = points.map(([px, py, pz]) => {
      const [nx, nz] = rotatePointY(px, pz, y);
      return [nx, py, nz] as [number, number, number];
    });
    const box = bounds(points);
    let faces = remapFaces(element.faces, xMap, uvlock ? xSteps : 0);
    faces = remapFaces(faces, yMap, uvlock ? ySteps : 0);
    let rotation = element.rotation;
    if (rotation) {
      rotation = {
        ...rotation,
        origin: rotateOrigin(rotation.origin, x, y),
        axis: rotateAxis(rotation.axis, x, y),
      };
    }
    return { from: box.from, to: box.to, ...(rotation ? { rotation } : {}), faces };
  });
}

type VariantApply = { model?: string; x?: number; y?: number; uvlock?: boolean };

function asApply(value: unknown): VariantApply | null {
  if (!value || typeof value !== "object") return null;
  const record = value as VariantApply;
  return typeof record.model === "string" ? record : null;
}

export function variantScore(key: string) {
  if (!key) return 1000;
  const props = Object.fromEntries(key.split(",").filter(Boolean).map((part) => part.split("=") as [string, string]));
  let score = 0;
  if (props.half === "bottom" || props.type === "bottom") score += 80;
  if (props.shape === "straight") score += 60;
  if (props.axis === "y") score += 40;
  if (props.facing === "east" || props.facing === "north") score += 20;
  if (props.open === "false" || props.powered === "false" || props.lit === "false" || props.waterlogged === "false") score += 10;
  // Unpowered, unsnowed, closed variants are the plain look. Without this,
  // `snowy=true` wins the tie-break by being the shorter key.
  for (const value of Object.values(props)) {
    if (value === "false") score += 6;
    else if (value === "true") score -= 2;
  }
  if (props.age) score += Number(props.age) || 0;
  return score;
}

export function showcaseProperties(blockstate: unknown): Record<string, string> {
  const text = JSON.stringify(blockstate);
  // Walls, fences, redstone, and rails use three-state side values. Give the
  // connected showcase: a straight north-south run, or a lone dot.
  const wall = text.includes('"low"') || text.includes('"tall"');
  const sided = text.includes('"none"');
  if (wall) {
    return { north: "low", south: "low", east: "none", west: "none", up: "true", down: "false" };
  }
  if (sided) {
    return { north: "none", south: "none", east: "none", west: "none", up: "false", down: "false" };
  }
  return { north: "true", south: "true", east: "false", west: "false", up: "true", down: "false" };
}

function whenMatches(when: unknown, state: Record<string, string>): boolean {
  if (!when || typeof when !== "object") return true;
  const record = when as Record<string, unknown>;
  if (Array.isArray(record.OR)) return record.OR.some((entry) => whenMatches(entry, state));
  if (Array.isArray(record.AND)) return record.AND.every((entry) => whenMatches(entry, state));
  for (const [key, value] of Object.entries(record)) {
    if (key === "OR" || key === "AND") continue;
    const expected = String(state[key] ?? "");
    const options = String(value).split("|");
    if (!options.includes(expected)) return false;
  }
  return true;
}

function applyVariant(library: ModelLibrary, apply: VariantApply, hint?: TintKind): CompiledElement[] {
  const resolved = resolveModel(library, apply.model ?? "", hint);
  if (!resolved) return [];
  return rotateElements(resolved.elements, apply.x ?? 0, apply.y ?? 0, Boolean(apply.uvlock));
}

/** Pick one readable blockstate: a straight bottom variant, or a north-south connected multipart. */
export function bakeBlockstate(library: ModelLibrary, blockstate: unknown, hint?: TintKind): CompiledModel | null {
  if (!blockstate || typeof blockstate !== "object") return null;
  const record = blockstate as { variants?: Record<string, unknown>; multipart?: Array<{ apply?: unknown; when?: unknown }> };
  if (record.variants) {
    const keys = Object.keys(record.variants);
    // At equal scores prefer the key with fewer properties, then the plainest
    // value list (`false` before `true`), then alphabetical order.
    keys.sort(
      (a, b) =>
        variantScore(b) - variantScore(a) ||
        a.split(",").filter(Boolean).length - b.split(",").filter(Boolean).length ||
        (a.includes("=true") ? 1 : 0) - (b.includes("=true") ? 1 : 0) ||
        a.length - b.length ||
        a.localeCompare(b),
    );
    const chosen = record.variants[keys[0] ?? ""];
    const apply = asApply(Array.isArray(chosen) ? chosen[0] : chosen);
    if (!apply) return null;
    const resolved = resolveModel(library, apply.model ?? "", hint);
    if (!resolved) return null;
    return { ...resolved, elements: rotateElements(resolved.elements, apply.x ?? 0, apply.y ?? 0, Boolean(apply.uvlock)) };
  }
  if (!record.multipart) return null;
  const state = showcaseProperties(blockstate);
  const elements: CompiledElement[] = [];
  let particle: string | undefined;
  for (const part of record.multipart) {
    if (!whenMatches(part.when, state)) continue;
    const applies = Array.isArray(part.apply) ? part.apply : [part.apply];
    for (const entry of applies) {
      const apply = asApply(entry);
      if (!apply) continue;
      if (!particle) particle = resolveModel(library, apply.model ?? "", hint)?.particle;
      elements.push(...applyVariant(library, apply, hint));
    }
  }
  if (!elements.length) return null;
  return { elements, ...(particle ? { particle } : {}) };
}

export function cubeElements(textures: Partial<Record<FaceName, string>>, hint?: TintKind): CompiledElement[] {
  const faces: CompiledElement["faces"] = {};
  for (const face of FACE_NAMES) {
    const texture = textures[face];
    if (!texture) continue;
    const tint = tintForTexture(texture, hint ? 0 : undefined, hint);
    faces[face] = { uv: [0, 0, 16, 16], texture, ...(tint ? { tint } : {}) };
  }
  return [{ from: [0, 0, 0], to: [16, 16, 16], faces }];
}

export function particleOf(model: CompiledModel | null) {
  if (!model) return "";
  return model.particle || model.layers?.[0] || model.elements[0]?.faces.up?.texture || model.elements[0]?.faces.south?.texture || model.elements[0]?.faces.north?.texture || "";
}
