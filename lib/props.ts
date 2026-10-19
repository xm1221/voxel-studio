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

export type PropBox = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
};

type BlockSpec = {
  id: string;
  kind: "block";
  swatch: string;
  texture: BlockTexture;
};

type BuiltSpec = {
  id: string;
  kind: "item" | "entity";
  swatch: string;
  boxes: PropBox[];
};

export type PropSpec = BlockSpec | BuiltSpec;

const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string): PropBox => ({
  x,
  y,
  z,
  w,
  h,
  d,
  color,
});

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
  {
    id: "sword",
    kind: "item",
    swatch: "#d7dbe2",
    boxes: [
      box(0, 3, 0, 2, 6, 2, "#6b4423"),
      box(0, 7.2, 0, 5, 1.4, 2.2, "#d4a017"),
      box(0, 16, 0, 2.4, 16, 1.2, "#e7edf4"),
      box(0, 24.4, 0, 2.4, 1.2, 1.2, "#c5ced8"),
    ],
  },
  {
    id: "pickaxe",
    kind: "item",
    swatch: "#8d97a3",
    boxes: [
      box(0, 11, 0, 2, 20, 2, "#6b4423"),
      box(0, 21.5, 0, 14, 3, 3, "#9aa3ad"),
      box(-6, 23.2, 0, 4, 3, 3, "#7d868f"),
      box(6, 23.2, 0, 4, 3, 3, "#7d868f"),
    ],
  },
  {
    id: "apple",
    kind: "item",
    swatch: "#d63c3c",
    boxes: [
      box(0, 5, 0, 8, 8, 8, "#d63c3c"),
      box(0.6, 5.4, 1, 6, 6, 6, "#e85a4a"),
      box(0, 9.4, 0, 1.2, 2.4, 1.2, "#6b4423"),
      box(1.6, 10.2, 0, 3, 1.4, 2, "#3f8f32"),
    ],
  },
  {
    id: "torch",
    kind: "item",
    swatch: "#f0b429",
    boxes: [
      box(0, 6, 0, 2, 12, 2, "#6b4423"),
      box(0, 13.2, 0, 3, 3, 3, "#f5d76e"),
      box(0, 15.4, 0, 2, 2.2, 2, "#f08a24"),
    ],
  },
  {
    id: "creeper",
    kind: "entity",
    swatch: "#3a9b32",
    boxes: [
      box(-2, 3, -2, 4, 6, 4, "#2f7d28"),
      box(2, 3, -2, 4, 6, 4, "#2f7d28"),
      box(-2, 3, 2, 4, 6, 4, "#2f7d28"),
      box(2, 3, 2, 4, 6, 4, "#2f7d28"),
      box(0, 12, 0, 8, 12, 4, "#3a9b32"),
      box(0, 22, 0, 8, 8, 8, "#46b03a"),
      box(-1.6, 23.2, 4.2, 2, 2, 0.6, "#1a1a1a"),
      box(1.6, 23.2, 4.2, 2, 2.2, 0.6, "#1a1a1a"),
      box(0, 20.2, 4.2, 2, 3, 0.6, "#1a1a1a"),
      box(-1.2, 18.2, 4.2, 1.4, 2, 0.6, "#1a1a1a"),
      box(1.2, 18.2, 4.2, 1.4, 2, 0.6, "#1a1a1a"),
    ],
  },
  {
    id: "pig",
    kind: "entity",
    swatch: "#f0a5a2",
    boxes: [
      box(-3, 3, -4, 3, 6, 3, "#e08d8a"),
      box(3, 3, -4, 3, 6, 3, "#e08d8a"),
      box(-3, 3, 4, 3, 6, 3, "#e08d8a"),
      box(3, 3, 4, 3, 6, 3, "#e08d8a"),
      box(0, 9, -1, 10, 8, 16, "#f3b2ae"),
      box(0, 11, 9, 8, 8, 8, "#f7c4c0"),
      box(0, 9.2, 13.2, 4, 3, 2.2, "#e9899a"),
      box(-1.6, 13.6, 13.1, 1.2, 1.2, 0.4, "#2a2a2a"),
      box(1.6, 13.6, 13.1, 1.2, 1.2, 0.4, "#2a2a2a"),
    ],
  },
  {
    id: "chicken",
    kind: "entity",
    swatch: "#f4f4f4",
    boxes: [
      box(-1.2, 2, 0, 1.2, 4, 1.2, "#f0b429"),
      box(1.2, 2, 0, 1.2, 4, 1.2, "#f0b429"),
      box(0, 7, 0, 8, 8, 10, "#f7f7f7"),
      box(0, 8, 5.2, 6, 4, 2.4, "#f4f4f4"),
      box(0, 12, 2.4, 5, 5, 5, "#ffffff"),
      box(0, 11.4, 5.2, 2.2, 1.4, 2.4, "#f0b429"),
      box(0, 10.2, 5.4, 1.4, 1.6, 1.2, "#d6453d"),
      box(1.2, 12.6, 4.6, 0.8, 0.8, 0.4, "#222222"),
    ],
  },
  {
    id: "slime",
    kind: "entity",
    swatch: "#67c24a",
    boxes: [
      box(0, 8, 0, 16, 16, 16, "#5bb85a"),
      box(0, 8, 0, 10, 10, 10, "#8ad85a"),
      box(-1.6, 10, 5.3, 2, 2, 0.8, "#16331a"),
      box(1.8, 10, 5.3, 2, 2, 0.8, "#16331a"),
      box(0, 7.4, 5.3, 3.2, 1.2, 0.8, "#16331a"),
    ],
  },
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
