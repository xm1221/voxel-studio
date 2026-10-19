/**
 * Build lib/entities.ts from a Mojang LayerDefinition dump (layers.json).
 * Geometry is ModelPart trees (same as Blockbench Modded Entity / Java Entity).
 * Box UV matches Blockbench cube.js updateUV for box_uv (and ModelPart$Cube).
 *
 * Usage:
 *   node scripts/gen-entities-from-layers.mjs \
 *     /workspace/pixelstage-r2/vanilla/jdump/layers.json \
 *     /workspace/pixelstage-r2/vanilla/jdump/entity-tex-map.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const layersPath = process.argv[2] || join(ROOT, "../vanilla/jdump/layers.json");
const mapPath = process.argv[3] || join(ROOT, "../vanilla/jdump/entity-tex-map.json");
const outPath = join(ROOT, "lib/entities.ts");

const CURATED = [
  // passive
  "cow", "mooshroom", "pig", "sheep", "chicken", "wolf", "cat", "ocelot", "fox", "rabbit",
  "horse", "donkey", "mule", "llama", "trader_llama", "goat", "panda", "polar_bear",
  "turtle", "frog", "axolotl", "bee", "parrot", "bat", "armadillo", "camel", "sniffer",
  "iron_golem", "snow_golem", "villager", "wandering_trader", "allay", "copper_golem",
  // hostile / neutral
  "creeper", "zombie", "husk", "drowned", "skeleton", "stray", "bogged", "wither_skeleton",
  "spider", "cave_spider", "enderman", "blaze", "ghast", "happy_ghast", "slime", "magma_cube",
  "witch", "zombie_villager", "pillager", "vindicator", "evoker", "vex", "ravager",
  "piglin", "piglin_brute", "zombified_piglin", "hoglin", "zoglin", "strider",
  "guardian", "elder_guardian", "silverfish", "endermite", "phantom", "shulker",
  "warden", "breeze", "creaking", "wither",
  // aquatic
  "cod", "salmon", "tropical_fish", "pufferfish", "dolphin", "squid", "glow_squid", "nautilus",
];

/** Vanilla LivingEntityRenderer / special scales (model size multiplier). */
const SCALE = {
  wither_skeleton: 1.2,
  giant: 6,
  ghast: 4.5,
  happy_ghast: 4.0,
  elder_guardian: 2.35,
  cave_spider: 0.7,
  magma_cube: 1.0,
  slime: 1.0,
  endermite: 1,
  silverfish: 1,
  bat: 0.5,
  wither: 1.0,
};

const CATEGORY = {
  cow: "passive", mooshroom: "passive", pig: "passive", sheep: "passive", chicken: "passive",
  wolf: "neutral", cat: "passive", ocelot: "passive", fox: "passive", rabbit: "passive",
  horse: "passive", donkey: "passive", mule: "passive", llama: "passive", trader_llama: "passive",
  goat: "passive", panda: "passive", polar_bear: "neutral", turtle: "passive", frog: "passive",
  axolotl: "passive", bee: "neutral", parrot: "passive", bat: "ambient", armadillo: "passive",
  camel: "passive", sniffer: "passive", iron_golem: "neutral", snow_golem: "passive",
  villager: "passive", wandering_trader: "passive", allay: "passive", copper_golem: "passive",
  creeper: "hostile", zombie: "hostile", husk: "hostile", drowned: "hostile",
  skeleton: "hostile", stray: "hostile", bogged: "hostile", wither_skeleton: "hostile",
  spider: "hostile", cave_spider: "hostile", enderman: "hostile", blaze: "hostile",
  ghast: "hostile", happy_ghast: "passive", slime: "hostile", magma_cube: "hostile",
  witch: "hostile", zombie_villager: "hostile", pillager: "hostile", vindicator: "hostile",
  evoker: "hostile", vex: "hostile", ravager: "hostile", piglin: "neutral",
  piglin_brute: "hostile", zombified_piglin: "neutral", hoglin: "hostile", zoglin: "hostile",
  strider: "passive", guardian: "hostile", elder_guardian: "hostile", silverfish: "hostile",
  endermite: "hostile", phantom: "hostile", shulker: "hostile", warden: "hostile",
  breeze: "hostile", creaking: "hostile", wither: "hostile",
  cod: "water", salmon: "water", tropical_fish: "water", pufferfish: "water",
  dolphin: "water", squid: "water", glow_squid: "water", nautilus: "water",
};

const EXTRA_LAYERS = {
  slime: [{ layer: "outer", texture: null, translucent: true }],
  sheep: [{ layer: "wool", texture: "entity/sheep/sheep_wool.png" }],
};

const FLOATERS = new Set(["ghast", "happy_ghast", "phantom", "bee", "bat", "allay", "vex", "blaze", "wither", "breeze"]);

function round(n) {
  return Math.round(n * 10000) / 10000;
}

function convertPart(node) {
  const pose = node.pose || {};
  const part = {};
  const px = pose.x || 0, py = pose.y || 0, pz = pose.z || 0;
  if (px || py || pz) part.pivot = [round(px), round(py), round(pz)];
  const xr = pose.xr || 0, yr = pose.yr || 0, zr = pose.zr || 0;
  if (xr || yr || zr) part.rot = [round(xr), round(yr), round(zr)];
  const cubes = [];
  for (const c of node.cubes || []) {
    const cube = {
      u: c.u, v: c.v,
      x: round(c.x), y: round(c.y), z: round(c.z),
      w: round(c.w), h: round(c.h), d: round(c.d),
    };
    const gx = c.gx || 0, gy = c.gy || 0, gz = c.gz || 0;
    if (gx || gy || gz) {
      if (gx === gy && gy === gz) cube.inflate = round(gx);
      else cube.grow = [round(gx), round(gy), round(gz)];
    }
    if (c.mirror) cube.mirror = true;
    cubes.push(cube);
  }
  if (cubes.length) part.cubes = cubes;
  const children = {};
  for (const [name, child] of Object.entries(node.children || {})) {
    children[name] = convertPart(child);
  }
  if (Object.keys(children).length) part.children = children;
  return part;
}

function findHeadCrop(root) {
  const visit = (node, name) => {
    if (/head|hat/i.test(name || "") && node.cubes?.length) {
      const c = node.cubes[0];
      // Blockbench north face of box UV: from [d, d] size [w, h]
      return [c.u + c.d, c.v + c.d, c.w, c.h];
    }
    for (const [n, ch] of Object.entries(node.children || {})) {
      const hit = visit(ch, n);
      if (hit) return hit;
    }
    return null;
  };
  return visit(root, "root") || [0, 0, 8, 8];
}

function mergeLayerOnto(baseRoot, layerRoot, texture) {
  // Attach layer cubes as extra children under matching bone names when possible;
  // otherwise hang as sibling parts under a synthetic child.
  const out = structuredClone(baseRoot);
  const graft = (dst, src, path) => {
    for (const [name, child] of Object.entries(src.children || {})) {
      if (dst.children?.[name]) {
        // append cubes with texture override via a twin child
        const twin = convertPart(child);
        if (texture) twin.texture = texture;
        const key = `${name}__overlay`;
        dst.children = dst.children || {};
        // Prefer merging cubes into an overlay child with same pivot
        dst.children[key] = twin;
      } else {
        dst.children = dst.children || {};
        const twin = convertPart(child);
        if (texture) twin.texture = texture;
        dst.children[name] = twin;
      }
    }
    // root cubes
    if (src.cubes?.length) {
      dst.children = dst.children || {};
      dst.children[`__layer_${path}`] = { ...(texture ? { texture } : {}), cubes: convertPart(src).cubes };
    }
  };
  graft(out, layerRoot, "extra");
  return out;
}

const layers = JSON.parse(readFileSync(layersPath, "utf8"));
const texMap = Object.fromEntries(JSON.parse(readFileSync(mapPath, "utf8")).ok);

const defs = [];
const skipped = [];
for (const id of CURATED) {
  const key = `minecraft:${id}#main`;
  if (!layers[key]) { skipped.push(id + " (no layer)"); continue; }
  const tex = texMap[id];
  if (!tex) { skipped.push(id + " (no texture)"); continue; }
  const layer = layers[key];
  let root = convertPart(layer.root);
  const extras = EXTRA_LAYERS[id] || [];
  for (const extra of extras) {
    const lk = `minecraft:${id}#${extra.layer}`;
    if (!layers[lk]) continue;
    const overlayTex = extra.texture || tex;
    root = mergeLayerOnto(root, layers[lk].root, overlayTex);
  }
  const crop = findHeadCrop(root);
  defs.push({
    id,
    category: CATEGORY[id] || "passive",
    texture: tex,
    texW: layer.texW,
    texH: layer.texH,
    crop,
    root,
    ...(SCALE[id] && SCALE[id] !== 1 ? { scale: SCALE[id] } : {}),
    ...(FLOATERS.has(id) ? { float: true } : {}),
    ...(id === "slime" || id === "magma_cube" ? { translucent: true } : {}),
  });
}

function emit(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "number")) return `[${value.join(", ")}]`;
    return `[\n${value.map((v) => pad + "  " + emit(v, indent + 1)).join(",\n")}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (!keys.length) return "{}";
    return `{\n${keys.map((k) => {
      const key = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : JSON.stringify(k);
      return `${pad}  ${key}: ${emit(value[k], indent + 1)}`;
    }).join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

const header = `/**
 * Vanilla entity models — ModelPart trees dumped from the official Minecraft
 * Java client (LayerDefinition / createBodyLayer), same structure Blockbench
 * uses for Modded Entity / Java Entity (bones + Box UV cubes).
 *
 * Generated by scripts/gen-entities-from-layers.mjs from layers.json.
 * Do not hand-tune cube UVs here; re-dump and regenerate.
 *
 * Box UV face layout matches Blockbench cube.js (box_uv) / ModelPart$Cube:
 *   east  [0, d]            size [d, h]
 *   north [d, d]            size [w, h]
 *   west  [d+w, d]          size [d, h]
 *   south [d+w+d, d]        size [w, h]
 *   up    [d, 0]            size [w, d]  (V flipped vs some docs; see mesh)
 *   down  [d+w, 0]          size [w, d]
 */

export type EntityCategory = "passive" | "hostile" | "neutral" | "ambient" | "water";

export type VCube = {
  u: number;
  v: number;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** Uniform inflate (CubeDeformation). */
  inflate?: number;
  /** Per-axis grow when not uniform. */
  grow?: [number, number, number];
  mirror?: boolean;
};

export type VPart = {
  pivot?: [number, number, number];
  /** Radians, vanilla xRot, yRot, zRot (applied as rotationZYX). */
  rot?: [number, number, number];
  cubes?: VCube[];
  children?: Record<string, VPart>;
  /** Optional texture override (e.g. sheep wool). */
  texture?: string;
};

export type EntityDef = {
  id: string;
  category: EntityCategory;
  texture: string;
  texW: number;
  texH: number;
  crop: [number, number, number, number];
  root: VPart;
  /** Vanilla renderer scale (ghast 4.5, wither skeleton 1.2, …). */
  scale?: number;
  /** Skip feet-on-ground assertion (flyers / swimmers). */
  float?: boolean;
  translucent?: boolean;
};

`;

const body = `export const ENTITIES: EntityDef[] = ${emit(defs)};

const BY_ID = new Map(ENTITIES.map((entity) => [entity.id, entity]));

export function entityDef(id: string) {
  return BY_ID.get(id.replace(/^entity:/, ""));
}
`;

writeFileSync(outPath, header + body);
console.log(`Wrote ${defs.length} entities to ${outPath}`);
console.log("Skipped:", skipped.join(", ") || "(none)");
