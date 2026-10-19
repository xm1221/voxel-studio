import { normalizeCatalogId } from "./catalog.ts";
import type { Vec3 } from "./model-types.ts";
import type { SceneProp } from "./types.ts";

export const MAX_PROPS = 64;
export const PROP_POSITION_LIMIT = 64;
export const PROP_HEIGHT_MIN = -16;
export const PROP_HEIGHT_MAX = 64;

/**
 * The first sixteen slots are the ones the hand-written shelf used, so old
 * scenes place props exactly where they used to. Later slots spiral outward.
 */
const BASE_SLOTS: ReadonlyArray<readonly [number, number, number]> = [
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

const SLOT_SPACING = 9;
const MIN_RADIUS = 8;

function spiralSlots(): Array<readonly [number, number, number]> {
  const slots: Array<readonly [number, number, number]> = [];
  const taken = new Set(BASE_SLOTS.map(([x, , z]) => `${x},${z}`));
  const ring = Math.ceil(Math.sqrt(MAX_PROPS * 3));
  // Walk a square spiral over a coarse grid; each step keeps a clear gap to
  // the players at the origin and never repeats a slot.
  for (let radius = 1; slots.length < MAX_PROPS * 2 && radius <= ring + 8; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = dx * SLOT_SPACING;
        const z = dz * SLOT_SPACING;
        if (Math.hypot(x, z) < MIN_RADIUS) continue;
        const key = `${x},${z}`;
        if (taken.has(key)) continue;
        taken.add(key);
        slots.push([x, 0, z]);
      }
    }
  }
  return slots;
}

const EXTRA_SLOTS = spiralSlots();

export function propSlot(index: number): readonly [number, number, number] {
  return BASE_SLOTS[index] ?? EXTRA_SLOTS[index - BASE_SLOTS.length] ?? [0, 0, 0];
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
    const catalogId = normalizeCatalogId(record.catalogId);
    if (!catalogId) continue;
    if (typeof record.id !== "string" || !/^[a-zA-Z0-9_-]{1,24}$/.test(record.id) || used.has(record.id)) continue;
    const position = record.position;
    const point = position && typeof position === "object" && !Array.isArray(position) ? (position as Record<string, unknown>) : {};
    used.add(record.id);
    props.push({
      id: record.id,
      catalogId,
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
  const normalized = normalizeCatalogId(catalogId);
  if (!normalized || existing.length >= MAX_PROPS) return null;
  const slot = propSlot(existing.length);
  return {
    id: newPropId(new Set(existing.map((prop) => prop.id))),
    catalogId: normalized,
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
