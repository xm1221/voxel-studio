import type { SceneProp } from "./types";

export const MAX_PROPS = 16;

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

export function isCatalogId(id: string) {
  return SPEC_BY_ID.has(id);
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
      position: {
        x: finite(point.x, -32, 32, 0),
        y: finite(point.y, -2, 32, 0),
        z: finite(point.z, -32, 32, 0),
      },
      rotationY: finite(record.rotationY, -180, 180, 0),
      scale: finite(record.scale, 0.4, 2.2, 1),
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
    position: { x: slot[0], y: slot[1], z: slot[2] },
    rotationY: 0,
    scale: 1,
  };
}
