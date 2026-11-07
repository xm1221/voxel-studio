import type { Vec3 } from "./model-types.ts";
import type { PropAttachment, PropAttachSlot, SceneProp } from "./types.ts";
import { canonicalCatalogId, normalizeCatalogId } from "./catalog.ts";
import { customAsset } from "./custom-assets.ts";

export const PROP_ATTACH_SLOTS: ReadonlyArray<Exclude<PropAttachSlot, "world">> = ["rHand", "lHand", "head", "back"];

export const ATTACH_SLOT_OFFSETS: Record<Exclude<PropAttachSlot, "world">, Vec3> = {
  rHand: { x: 0, y: -5, z: 1.5 },
  lHand: { x: 0, y: -5, z: 1.5 },
  head: { x: 0, y: 8.5, z: 0 },
  back: { x: 0, y: 1, z: -2.5 },
};

export type PropDisplayArchetype =
  | "handheld"
  | "torch"
  | "bow"
  | "shield"
  | "block"
  | "generated"
  | "entity";

export type PropDisplayTransform = {
  archetype: PropDisplayArchetype;
  /** Model-space point that acts as the grip/center origin before rotation & scale. */
  modelOrigin: Vec3;
  /** Base position in the attachment bone's local coordinate space. */
  position: Vec3;
  /** Base Euler XYZ rotation in degrees applied around `modelOrigin`. */
  rotation: Vec3;
  /** Base uniform scale matching Minecraft's third-person display transform. */
  scale: number;
};

const HANDHELD_ITEM_PATTERN = /(?:^|_)(?:sword|pickaxe|axe|shovel|hoe|mace|trident|stick|rod|brush)(?:$|_)/;
const TORCH_BLOCK_PATTERN = /(?:^|_)(?:torch|end_rod|lightning_rod|candle|lantern)(?:$|_)/;

/**
 * Classify a prop into its Minecraft third-person display archetype so held
 * weapons, torches, 3D blocks, and flat items each use the proper grip and scale.
 */
export function classifyPropDisplayArchetype(catalogId: string): PropDisplayArchetype {
  const canonical = canonicalCatalogId(catalogId.trim());
  if (canonical.startsWith("custom:")) {
    const asset = customAsset(canonical);
    if (asset?.kind === "block") return "block";
    if (HANDHELD_ITEM_PATTERN.test(asset?.name?.toLowerCase() ?? "") || HANDHELD_ITEM_PATTERN.test(canonical.toLowerCase())) {
      return "handheld";
    }
    return "generated";
  }
  if (canonical.startsWith("entity:")) return "entity";
  if (canonical.startsWith("block:")) {
    const bare = canonical.slice(6);
    if (TORCH_BLOCK_PATTERN.test(bare)) return "torch";
    return "block";
  }
  if (canonical.startsWith("item:")) {
    const bare = canonical.slice(5);
    if (bare === "shield") return "shield";
    if (bare === "bow" || bare === "crossbow") return "bow";
    if (HANDHELD_ITEM_PATTERN.test(bare)) return "handheld";
    return "generated";
  }
  return "generated";
}

/**
 * Return the Minecraft-aligned base display transform for a prop attached to a rig slot.
 * User-configured `prop.position`, `prop.rotation`, and `prop.scale` act as fine-tune
 * offsets on top of this base transform (so neutral user values are pos=0, rot=0, scale=1).
 */
export function getPropDisplayTransform(
  catalogId: string,
  slot: Exclude<PropAttachSlot, "world">,
): PropDisplayTransform {
  const archetype = classifyPropDisplayArchetype(catalogId);

  if (slot === "head") {
    if (archetype === "block") {
      // Wearable full block helmet (like carved pumpkin / glass / TNT on head in MC)
      return {
        archetype,
        modelOrigin: { x: 0, y: 8, z: 0 },
        position: { x: 0, y: 4, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 0.625,
      };
    }
    return {
      archetype,
      modelOrigin: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 8.2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 0.75,
    };
  }

  if (slot === "back") {
    if (archetype === "block") {
      return {
        archetype,
        modelOrigin: { x: 0, y: 8, z: 0 },
        position: { x: 0, y: 0, z: -3.8 },
        rotation: { x: 0, y: 180, z: 0 },
        scale: 0.5,
      };
    }
    // Handheld weapons & items slung diagonally across the back
    return {
      archetype,
      modelOrigin: { x: 0, y: 8, z: 0 },
      position: { x: 0, y: 0.5, z: -2.6 },
      rotation: { x: 0, y: 180, z: 0 },
      scale: 0.85,
    };
  }

  // rHand or lHand (parented to rig.rElbow / rig.lElbow)
  switch (archetype) {
    case "handheld":
      // 2D extruded sprite has handle grip at (-4.5, 3.5, 0) and blade tip at (+6.5, 14.5, 0).
      // Pivoting at (-4.5, 3.5, 0) with R_z(-65°) then R_y(-90°) places the flat blade in the
      // forearm's YZ plane (x=0), locks the hilt inside the closed fist (0, -4.8, 0.8), and
      // lets user rotations/scales pivot naturally around the fist grip.
      return {
        archetype,
        modelOrigin: { x: -4.5, y: 3.5, z: 0 },
        position: { x: 0, y: -4.8, z: 0.8 },
        rotation: { x: 0, y: -90, z: -65 },
        scale: 0.85,
      };

    case "torch":
      // Torch stick spans y=0..10. Pivot at grip (0, 2.5, 0) and rotate +110° around X
      // so the torch extends out the thumb side of the fist (+Z) and 20° along (-Y).
      return {
        archetype,
        modelOrigin: { x: 0, y: 2.5, z: 0 },
        position: { x: 0, y: -4.8, z: 1.0 },
        rotation: { x: 110, y: 0, z: 0 },
        scale: 0.85,
      };

    case "bow":
      return {
        archetype,
        modelOrigin: { x: 0, y: 8, z: 0 },
        position: { x: 0, y: -5.0, z: 2.0 },
        rotation: { x: 0, y: -90, z: -45 },
        scale: 0.9,
      };

    case "shield":
      return {
        archetype,
        modelOrigin: { x: 0, y: 8, z: 0 },
        position: { x: slot === "rHand" ? -2.6 : 2.6, y: -3.5, z: 1.5 },
        rotation: { x: 90, y: 0, z: 0 },
        scale: 0.85,
      };

    case "block":
      // Vanilla models/block/block.json thirdperson_righthand: scale 0.375, rot [75, 45, 0]
      return {
        archetype,
        modelOrigin: { x: 0, y: 8, z: 0 },
        position: { x: 0, y: -5.2, z: 2.2 },
        rotation: { x: 75, y: 45, z: 0 },
        scale: 0.375,
      };

    case "entity":
      return {
        archetype,
        modelOrigin: { x: 0, y: 0, z: 0 },
        position: { x: 0, y: -5.2, z: 2.5 },
        rotation: { x: 90, y: 0, z: 0 },
        scale: 0.35,
      };

    case "generated":
    default:
      // Vanilla models/item/generated.json thirdperson_righthand: scale 0.55, YZ plane in hand
      return {
        archetype,
        modelOrigin: { x: 0, y: 8, z: 0 },
        position: { x: 0, y: -5.0, z: 2.0 },
        rotation: { x: 0, y: -90, z: -20 },
        scale: 0.55,
      };
  }
}

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

export type PropParseIssue = { path: string; message: string; code?: string };

const PROP_ID = /^[a-zA-Z0-9_-]{1,24}$/;

/**
 * One prop reader for v1 share payloads and v2 scene documents.
 * Share links (`strict: false`) drop broken entries and require an existing id.
 * Scene documents (`strict: true`) report issues and assign `o_1`, `o_2`, …
 * when an id is missing, so `getScene()` does not mint a new random id.
 * Both paths read the same fields: catalog id or legacy `item`, name, pivot,
 * locked, hidden, rotation (including legacy `rotationY`), and scale.
 */
export function parseSceneProps(
  value: unknown,
  options?: { strict?: boolean; onIssue?: (issue: PropParseIssue) => void },
): SceneProp[] {
  const strict = options?.strict === true;
  const onIssue = options?.onIssue;
  if (!Array.isArray(value)) {
    if (strict && value !== undefined) {
      onIssue?.({ path: "props", message: "props must be an array.", code: "err.sceneProps" });
    }
    return [];
  }
  const props: SceneProp[] = [];
  const used = new Set<string>();
  const list = strict ? value.slice(0, MAX_PROPS) : value;
  for (let index = 0; index < list.length; index += 1) {
    if (!strict && props.length >= MAX_PROPS) break;
    const entry = list[index];
    const path = `props[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      if (strict) onIssue?.({ path, message: "Each prop must be an object.", code: "err.sceneProps" });
      continue;
    }
    const record = entry as Record<string, unknown>;
    const rawId = record.catalogId ?? record.item;
    const catalogId = normalizeCatalogId(rawId);
    if (!catalogId) {
      if (strict) {
        onIssue?.({
          path: `${path}.item`,
          message: `Unknown prop "${String(rawId)}". Use a catalog id like block:stone.`,
          code: "err.sceneProp",
        });
      }
      continue;
    }
    const given = typeof record.id === "string" && PROP_ID.test(record.id) ? record.id : "";
    let id = given;
    if (strict) {
      if (!id) id = `o_${props.length + 1}`;
      while (used.has(id)) id = `${id}_`;
    } else if (!id || used.has(id)) {
      continue;
    }
    const position = record.position;
    const point = position && typeof position === "object" && !Array.isArray(position) ? (position as Record<string, unknown>) : {};
    let attach: PropAttachment | null = null;
    if (record.attach && typeof record.attach === "object" && !Array.isArray(record.attach)) {
      const att = record.attach as Record<string, unknown>;
      const slot = typeof att.slot === "string" && (PROP_ATTACH_SLOTS as readonly string[]).includes(att.slot)
        ? (att.slot as Exclude<PropAttachSlot, "world">)
        : null;
      const playerId = typeof att.playerId === "string" && att.playerId.trim() ? att.playerId.trim() : "";
      if (slot && playerId) {
        attach = { playerId, slot };
      } else if (strict) {
        onIssue?.({
          path: `${path}.attach`,
          message: `Invalid attach: slot must be one of ${PROP_ATTACH_SLOTS.join(", ")} and playerId must be specified.`,
          code: "err.scenePropAttach",
        });
      }
    }
    used.add(id);
    props.push({
      id,
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
      attach,
    });
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
    attach: null,
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
    attach: prop.attach ? { ...prop.attach } : null,
  };
}
