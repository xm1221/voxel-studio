import type { Vec3 } from "./model-types.ts";
import type { SceneProp } from "./types.ts";

export const MAX_PROPS = 64;
export const PROP_POSITION_LIMIT = 64;
export const PROP_HEIGHT_MIN = -16;
export const PROP_HEIGHT_MAX = 64;

export type PropKind = "block" | "item" | "entity";

export type BlockTexture =
  | "grass"
  | "dirt"
  | "stone"
  | "log"
  | "planks"
  | "sand"
  | "tnt"
  | "crafting"
  | "glass";

type BlockSpec = {
  id: string;
  kind: "block";
  /** Shelf chip only. The mesh uses the vanilla PNG named by `texture`. */
  swatch: string;
  texture: BlockTexture;
};

type BuiltSpec = {
  id: string;
  kind: "item" | "entity";
  /** Shelf chip only. The mesh uses the vanilla item or entity PNG. */
  swatch: string;
};

export type PropSpec = BlockSpec | BuiltSpec;

export const PROP_SPECS: PropSpec[] = [
  { id: "grass", kind: "block", swatch: "#5d9b3a", texture: "grass" },
  { id: "dirt", kind: "block", swatch: "#8a5a32", texture: "dirt" },
  { id: "stone", kind: "block", swatch: "#8b8b8b", texture: "stone" },
  { id: "log", kind: "block", swatch: "#6b4e2e", texture: "log" },
  { id: "planks", kind: "block", swatch: "#c4a15a", texture: "planks" },
  { id: "sand", kind: "block", swatch: "#e6d7a2", texture: "sand" },
  { id: "tnt", kind: "block", swatch: "#d6453d", texture: "tnt" },
  { id: "crafting", kind: "block", swatch: "#8b5a2b", texture: "crafting" },
  { id: "glass", kind: "block", swatch: "#b9e4f5", texture: "glass" },
  { id: "sword", kind: "item", swatch: "#d7dbe2" },
  { id: "pickaxe", kind: "item", swatch: "#8d97a3" },
  { id: "apple", kind: "item", swatch: "#d63c3c" },
  { id: "torch", kind: "item", swatch: "#f0b429" },
  { id: "creeper", kind: "entity", swatch: "#3a9b32" },
  { id: "pig", kind: "entity", swatch: "#f0a5a2" },
  { id: "chicken", kind: "entity", swatch: "#f4f4f4" },
  { id: "slime", kind: "entity", swatch: "#67c24a" },
];

const SPEC_BY_ID = new Map(PROP_SPECS.map((spec) => [spec.id, spec]));

const SLOTS: Array<[number, number, number]> = [
  [18, 0, 4],
  [-20, 0, 4],
  [6, 0, 14],
  [9, 0, 8],
  [0, 0, 18],
  [0, 0, -20],
  [10, 0, 14],
  [-10, 0, 14],
  [28, 0, 0],
  [-28, 0, 0],
  [12, 0, -18],
  [-12, 0, -18],
  [26, 0, 14],
  [-26, 0, 14],
  [8, 0, 24],
  [-8, 0, 24],
];

export function propSpec(id: string): PropSpec | undefined {
  return SPEC_BY_ID.get(id);
}

const CATALOG_ID = /^(block|item|entity):[a-z0-9_]{1,64}$/;
const CUSTOM_ID = /^custom:[a-z0-9_]{1,40}$/;

/** Legacy shelf ids, `block:` / `item:` / `entity:` ids, and imported `custom:` ids. */
export function isCatalogId(id: string) {
  return SPEC_BY_ID.has(id) || CATALOG_ID.test(id) || CUSTOM_ID.test(id);
}

export function clampPropPosition(position: Vec3): Vec3 {
  return {
    x: finite(position.x, -PROP_POSITION_LIMIT, PROP_POSITION_LIMIT, 0),
    y: finite(position.y, PROP_HEIGHT_MIN, PROP_HEIGHT_MAX, 0),
    z: finite(position.z, -PROP_POSITION_LIMIT, PROP_POSITION_LIMIT, 0),
  };
}

function vec3From(value: unknown, min: number, max: number, fallback: number, uniform = false): Vec3 {
  if (typeof value === "number" || uniform) {
    const next = finite(value, min, max, fallback);
    return { x: next, y: next, z: next };
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    x: finite(record.x, min, max, fallback),
    y: finite(record.y, min, max, fallback),
    z: finite(record.z, min, max, fallback),
  };
}

function rotationFrom(record: Record<string, unknown>): Vec3 {
  if (record.rotation && typeof record.rotation === "object" && !Array.isArray(record.rotation)) {
    return vec3From(record.rotation, -720, 720, 0);
  }
  return { x: 0, y: finite(record.rotationY, -720, 720, 0), z: 0 };
}

function finite(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function newPropId(used: Set<string>) {
  let id = "";
  do {
    id = `o_${Math.random().toString(36).slice(2, 8)}`;
  } while (used.has(id));
  return id;
}

/** Drop unknown or broken props. Old share links simply have none. */
export function parseSceneProps(value: unknown): SceneProp[] {
  if (!Array.isArray(value)) return [];
  const props: SceneProp[] = [];
  const used = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.catalogId !== "string" || !isCatalogId(record.catalogId)) continue;
    if (typeof record.id !== "string" || !/^[a-zA-Z0-9_-]{1,24}$/.test(record.id) || used.has(record.id)) continue;
    const position = record.position;
    const point = position && typeof position === "object" && !Array.isArray(position) ? (position as Record<string, unknown>) : {};
    used.add(record.id);
    props.push({
      id: record.id,
      catalogId: record.catalogId,
      name: typeof record.name === "string" ? record.name.trim().slice(0, 48) : "",
      position: {
        x: finite(point.x, -PROP_POSITION_LIMIT, PROP_POSITION_LIMIT, 0),
        y: finite(point.y, PROP_HEIGHT_MIN, PROP_HEIGHT_MAX, 0),
        z: finite(point.z, -PROP_POSITION_LIMIT, PROP_POSITION_LIMIT, 0),
      },
      rotation: rotationFrom(record),
      scale: vec3From(record.scale, 0.05, 8, 1, typeof record.scale === "number"),
      pivot: vec3From(record.pivot, -64, 64, 0),
      hidden: record.hidden === true,
      locked: record.locked === true,
    });
    if (props.length >= MAX_PROPS) break;
  }
  return props;
}

export function activePropFrom(value: unknown, props: SceneProp[]): string | null {
  if (typeof value !== "string") return null;
  return props.some((prop) => prop.id === value) ? value : null;
}

export function placeProp(catalogId: string, existing: SceneProp[]): SceneProp | null {
  if (!isCatalogId(catalogId) || existing.length >= MAX_PROPS) return null;
  const slot = SLOTS[existing.length] ?? SLOTS[SLOTS.length - 1];
  return {
    id: newPropId(new Set(existing.map((prop) => prop.id))),
    catalogId,
    name: "",
    position: { x: slot[0], y: slot[1], z: slot[2] },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    pivot: { x: 0, y: 0, z: 0 },
    hidden: false,
    locked: false,
  };
}

export function duplicateProp(prop: SceneProp, existing: SceneProp[]): SceneProp | null {
  if (existing.length >= MAX_PROPS) return null;
  const position = clampPropPosition({ ...prop.position, x: prop.position.x + 4 });
  return {
    ...prop,
    id: newPropId(new Set(existing.map((item) => item.id))),
    name: prop.name,
    position,
    rotation: { ...prop.rotation },
    scale: { ...prop.scale },
    pivot: { ...prop.pivot },
  };
}
