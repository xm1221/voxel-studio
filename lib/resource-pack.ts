import { code } from "./i18n.ts";
import { readZip } from "./unzip.ts";

/**
 * Files the stage floors always use. Any other PNG under textures/block,
 * textures/item, textures/entity, or textures/colormap is also accepted, keyed
 * by its real jar path (for example `entity/pig/pig_temperate.png`).
 */
export const PROP_TEXTURE_KEYS = [
  "block/grass_block_side.png",
  "block/grass_block_top.png",
  "block/dirt.png",
  "block/stone.png",
  "block/oak_log.png",
  "block/oak_log_top.png",
  "block/oak_planks.png",
  "block/sand.png",
  "block/tnt_side.png",
  "block/tnt_top.png",
  "block/tnt_bottom.png",
  "block/crafting_table_front.png",
  "block/crafting_table_side.png",
  "block/crafting_table_top.png",
  "block/glass.png",
  "block/torch.png",
  "item/diamond_sword.png",
  "item/diamond_pickaxe.png",
  "item/apple.png",
  "entity/creeper/creeper.png",
  "entity/pig/pig_temperate.png",
  "entity/chicken/chicken_temperate.png",
  "entity/slime/slime.png",
  "colormap/grass.png",
] as const;

/** Any texture path under the four accepted roots. */
export type PropTextureKey = string;

const KEYS = new Set<string>(PROP_TEXTURE_KEYS);

const TEXTURE_ROOTS = new Set(["block", "item", "entity", "colormap"]);

/** Older pack layouts mapped onto the real jar paths. Higher rank wins. */
const ALIASES: Record<string, { key: PropTextureKey; rank: number }> = {
  "blocks/grass_side.png": { key: "block/grass_block_side.png", rank: 40 },
  "blocks/grass_top.png": { key: "block/grass_block_top.png", rank: 40 },
  "blocks/dirt.png": { key: "block/dirt.png", rank: 40 },
  "blocks/stone.png": { key: "block/stone.png", rank: 40 },
  "blocks/log_oak.png": { key: "block/oak_log.png", rank: 40 },
  "blocks/log_oak_top.png": { key: "block/oak_log_top.png", rank: 40 },
  "blocks/planks_oak.png": { key: "block/oak_planks.png", rank: 40 },
  "blocks/sand.png": { key: "block/sand.png", rank: 40 },
  "blocks/tnt_side.png": { key: "block/tnt_side.png", rank: 40 },
  "blocks/tnt_top.png": { key: "block/tnt_top.png", rank: 40 },
  "blocks/tnt_bottom.png": { key: "block/tnt_bottom.png", rank: 40 },
  "blocks/crafting_table_front.png": { key: "block/crafting_table_front.png", rank: 40 },
  "blocks/crafting_table_side.png": { key: "block/crafting_table_side.png", rank: 40 },
  "blocks/crafting_table_top.png": { key: "block/crafting_table_top.png", rank: 40 },
  "blocks/glass.png": { key: "block/glass.png", rank: 40 },
  "blocks/torch_on.png": { key: "block/torch.png", rank: 40 },
  "items/diamond_sword.png": { key: "item/diamond_sword.png", rank: 40 },
  "items/diamond_pickaxe.png": { key: "item/diamond_pickaxe.png", rank: 40 },
  "items/apple.png": { key: "item/apple.png", rank: 40 },
  // Flat, pre-1.21.4 entity sheets.
  "entity/creeper.png": { key: "entity/creeper/creeper.png", rank: 80 },
  "entity/slime.png": { key: "entity/slime/slime.png", rank: 80 },
  "entity/pig.png": { key: "entity/pig/pig_temperate.png", rank: 80 },
  "entity/chicken.png": { key: "entity/chicken/chicken_temperate.png", rank: 80 },
  // The old temperate names, still seen in packs.
  "entity/pig/pig.png": { key: "entity/pig/pig_temperate.png", rank: 50 },
  "entity/chicken/chicken.png": { key: "entity/chicken/chicken_temperate.png", rank: 50 },
};

export const MAX_PACK_BYTES = 256 * 1024 * 1024;
export const MAX_TEXTURE_BYTES = 8 * 1024 * 1024;

export type PackTexture = { key: PropTextureKey; bytes: Uint8Array };

export type PackFile = { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

const PNG = [0x89, 0x50, 0x4e, 0x47] as const;

export function classifyPackPath(path: string): { key: PropTextureKey; rank: number } | null {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const marker = "minecraft/textures/";
  const at = normalized.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = normalized.slice(at + marker.length);
  if (!rest.endsWith(".png")) return null;
  const alias = ALIASES[rest];
  if (alias) return alias;
  const root = rest.slice(0, rest.indexOf("/"));
  if (!TEXTURE_ROOTS.has(root)) return null;
  return { key: rest, rank: KEYS.has(rest) ? 100 : 90 };
}

/** Catalog files the pack did not replace. The mesh loads the bundled vanilla PNG for each of these. */
export function vanillaFallbackKeys(textures: PackTexture[]): PropTextureKey[] {
  const present = new Set(textures.map((texture) => texture.key));
  return PROP_TEXTURE_KEYS.filter((key) => !present.has(key));
}

export function texturesFromPackFiles(entries: Array<{ path: string; bytes: Uint8Array }>): PackTexture[] {
  const best = new Map<PropTextureKey, { rank: number; bytes: Uint8Array }>();
  for (const entry of entries) {
    const classified = classifyPackPath(entry.path);
    if (!classified) continue;
    if (!isPng(entry.bytes) || entry.bytes.byteLength > MAX_TEXTURE_BYTES) continue;
    const current = best.get(classified.key);
    if (current && current.rank >= classified.rank) continue;
    best.set(classified.key, { rank: classified.rank, bytes: entry.bytes });
  }
  if (!best.size) throw new Error(code("err.packEmpty"));
  return [...best.entries()].map(([key, value]) => ({ key, bytes: value.bytes }));
}

export async function readResourcePack(file: PackFile): Promise<{ name: string; textures: PackTexture[] }> {
  if (file.size > MAX_PACK_BYTES) throw new Error(code("err.packBig"));
  let entries;
  try {
    entries = await readZip(new Uint8Array(await file.arrayBuffer()), {
      include: (name) => classifyPackPath(name) !== null,
      maxEntryBytes: MAX_TEXTURE_BYTES,
    });
  } catch (reason) {
    if (reason instanceof Error && reason.message.startsWith("err.")) throw reason;
    throw new Error(code("err.packBad"));
  }
  return { name: file.name, textures: texturesFromPackFiles(entries.map((entry) => ({ path: entry.name, bytes: entry.bytes }))) };
}

export async function texturesFromFolder(files: PackFile[]): Promise<PackTexture[]> {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_PACK_BYTES) throw new Error(code("err.packBig"));
  const entries: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const file of files) {
    if (file.size > MAX_TEXTURE_BYTES) continue;
    const path = file.name;
    if (!classifyPackPath(path)) continue;
    entries.push({ path, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  return texturesFromPackFiles(entries);
}

function isPng(bytes: Uint8Array) {
  return bytes.byteLength >= 8 && PNG.every((value, index) => bytes[index] === value);
}
