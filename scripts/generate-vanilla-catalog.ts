/**
 * Build the vanilla block/item catalog from the official Minecraft Java client.
 *
 *   npm run catalog             # fast path: keep an up-to-date catalog, no network
 *   npm run catalog -- --force  # download (or reuse the cache) and rebuild
 *
 * Downloads the latest release (or MC_VERSION) via piston-meta, reads
 * blockstates, models, and language, and writes public/vanilla/gen: catalog.json
 * plus the textures the models reference. The textures are Mojang's; the folder
 * is gitignored and fetched at build time.
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ENTITIES } from "../lib/entities.ts";
import { bakeBlockstate, modelPath, particleOf, resolveModel, type ModelDocument, type ModelLibrary } from "../lib/mc-model.ts";
import type { CompiledModel, TintKind } from "../lib/model-types.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = join(ROOT, ".cache/vanilla");
const PUBLIC = join(ROOT, "public/vanilla");
const GENERATED = join(PUBLIC, "gen");
const CATALOG_FILE = join(GENERATED, "catalog.json");

/** Bump when the catalog shape or its generation changes. `npm run catalog` checks it. */
const CATALOG_SCHEMA = 1;

const SKIP_BLOCKS = new Set(["air", "cave_air", "void_air", "light", "structure_void", "moving_piston"]);

const DYE_COLORS = [
  "white",
  "orange",
  "magenta",
  "light_blue",
  "yellow",
  "lime",
  "pink",
  "gray",
  "light_gray",
  "cyan",
  "purple",
  "blue",
  "brown",
  "green",
  "red",
  "black",
];

/** Mob temperament overrides. Everything else comes from lib/entities.ts. */
const NEUTRAL = new Set([
  "wolf",
  "bee",
  "iron_golem",
  "snow_golem",
  "llama",
  "goat",
  "panda",
  "polar_bear",
  "spider",
  "cave_spider",
  "enderman",
  "piglin",
  "zombified_piglin",
  "copper_golem",
]);

type Lang = Record<string, string>;
type Entry = {
  id: string;
  kind: "block" | "item" | "entity";
  category: string;
  icon: string;
  en: string;
  zh: string;
  crop?: [number, number, number, number];
  texW?: number;
  texH?: number;
  model?: CompiledModel;
};

async function download(url: string, dest: string) {
  mkdirSync(dirname(dest), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed ${response.status} ${url}`);
  await pipeline(Readable.fromWeb(response.body as import("stream/web").ReadableStream), createWriteStream(dest));
}

async function json(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${url}`);
  return response.json() as Promise<unknown>;
}

function titleCase(id: string) {
  return id.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function hasColorName(id: string) {
  return DYE_COLORS.some((color) => id.startsWith(`${color}_`) || id.includes(`_${color}_`) || id.endsWith(`_${color}`));
}

function blockCategory(id: string) {
  if (/redstone|piston|observer|hopper|dropper|dispenser|repeater|comparator|rail|daylight|note_block|tripwire|sculk_sensor|target|lever|button|pressure_plate/.test(id)) return "redstone";
  if (hasColorName(id) && /wool|carpet|concrete|terracotta|glass|candle|bed|banner|shulker_box/.test(id)) return "colored";
  if (/chest|furnace|crafting|anvil|enchant|beacon|brewing|cauldron|barrel|smoker|blast|loom|cartography|grindstone|smithing|stonecutter|campfire|respawn|shulker_box|lectern|composter|jukebox|bell|crafter|vault|bookshelf|chiseled_bookshelf|decorated_pot|flower_pot|bed$|door|trapdoor|sign|banner|skull|head$/.test(id)) return "functional";
  if (
    /sapling|flower|petal|tulip|orchid|allium|bluet|daisy|poppy|dandelion|mushroom|fungus|roots|wart|vine|kelp|seagrass|grass|fern|bush|coral|bamboo|cactus|sugar_cane|pumpkin|melon|wheat|carrot|potato|beet|crop|leaves|azalea|spore|torchflower|pitcher|dripleaf|lily_pad|sea_pickle|lichen|moss_carpet|hanging|chorus_flower|cocoa|nether_sprouts|weeping|twisting/.test(id) &&
    !/stairs|slab|fence|wall|planks|bricks|block$|ore$/.test(id)
  )
    return "plants";
  if (
    /ore|dirt|grass|sand|gravel|leaves|log|wood|ice|snow|netherrack|nylium|end_stone|obsidian|sculk|moss|mud|clay|mycelium|podzol|rooted|dripstone|amethyst|basalt|blackstone|deepslate|tuff|calcite|ancient|magma|soul|warped|crimson|nether|azalea|spore|vine|kelp|seagrass|lily|bamboo|cactus|sugar|pumpkin|melon|wheat|carrot|potato|beet|torchflower|pitcher|cobweb|mushroom|fungus|roots|wart|chorus|honey|slime|tnt|sponge|bedrock|barrier/.test(id) &&
    !/stairs|slab|fence|wall|door|trapdoor|planks|bricks|button/.test(id)
  )
    return "natural";
  return "building";
}

function itemCategory(id: string) {
  if (id.endsWith("_spawn_egg")) return "spawn_eggs";
  if (/sword|bow|crossbow|trident|shield|helmet|chestplate|leggings|boots|mace|spear|_arrow$|totem|armor/.test(id)) return "combat";
  if (/pickaxe|_axe$|shovel|hoe|shears|flint_and_steel|fishing_rod|brush|spyglass|clock|compass|lead|name_tag|saddle|elytra|bucket|boat|minecart|goat_horn|recovery/.test(id)) return "tools";
  if (/apple|bread|beef|pork|chicken|mutton|cod|salmon|stew|soup|potato|carrot|berry|melon|cookie|pie|honey|rabbit|rotten|spider_eye|puffer|tropical|kelp|chorus|glow_berries|sweet_berries|beetroot|dried|pumpkin_pie|milk_bucket|mushroom_stew/.test(id)) return "food";
  if (/potion|music_disc|banner|book|map|disc|pattern|smithing_template|firework|experience_bottle|ominous_bottle|enchanted_book/.test(id)) return "misc";
  return "materials";
}

function entityCategory(id: string, fallback: string) {
  if (NEUTRAL.has(id)) return "neutral";
  return fallback;
}

function tintHint(tints: unknown): TintKind | undefined {
  if (!Array.isArray(tints) || !tints.length) return undefined;
  const type = String((tints[0] as { type?: string }).type ?? "");
  if (type.includes("foliage")) return "foliage";
  if (type.includes("water")) return "water";
  if (type.includes("grass")) return "grass";
  if (type.includes("redstone")) return "redstone";
  return undefined;
}

function firstModel(node: unknown, depth = 0): { model: string; hint?: TintKind } | null {
  if (!node || typeof node !== "object" || depth > 8) return null;
  const record = node as { type?: string; model?: unknown; base?: string; on_false?: unknown; on_true?: unknown; fallback?: unknown; entries?: Array<{ model?: unknown }>; models?: unknown[]; tints?: unknown };
  const type = record.type ?? "";
  if (type === "minecraft:model" && typeof record.model === "string") return { model: record.model, hint: tintHint(record.tints) };
  if (type === "minecraft:special" && typeof record.base === "string") return { model: record.base, hint: tintHint(record.tints) };
  if (type === "minecraft:condition") return firstModel(record.on_false, depth + 1) ?? firstModel(record.on_true, depth + 1);
  if (type === "minecraft:select" || type === "minecraft:range_dispatch") {
    return firstModel(record.fallback, depth + 1) ?? firstModel(record.entries?.[0]?.model, depth + 1);
  }
  if (type === "minecraft:composite" && record.models?.length) return firstModel(record.models[0], depth + 1);
  if (typeof record.model === "object") return firstModel(record.model, depth + 1);
  return null;
}

function readJson(file: string) {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function pngSize(file: string): [number, number] | null {
  try {
    const bytes = readFileSync(file);
    if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  } catch {
    return null;
  }
}

type Client = { version: string; jarUrl: string; sha1: string; extract: string; zhFile: string };

async function downloadClient(): Promise<Client> {
  const manifest = (await json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")) as {
    latest: { release: string };
    versions: Array<{ id: string; url: string }>;
  };
  const version = process.env.MC_VERSION || manifest.latest.release;
  const listed = manifest.versions.find((entry) => entry.id === version);
  if (!listed) throw new Error(`Version ${version} is not in the manifest`);
  const meta = (await json(listed.url)) as {
    downloads: { client: { url: string; sha1: string; size: number } };
    assetIndex: { url: string };
  };
  mkdirSync(CACHE, { recursive: true });
  const jar = join(CACHE, `client-${version}.jar`);
  if (!existsSync(jar)) {
    console.log(`Downloading ${version} client…`);
    await download(meta.downloads.client.url, jar);
  }
  const extract = join(CACHE, version);
  const marker = join(extract, "assets/minecraft/models/block/cube.json");
  if (!existsSync(marker)) {
    mkdirSync(extract, { recursive: true });
    console.log("Extracting models, blockstates, items, textures, language…");
    const result = spawnSync("unzip", ["-q", "-o", jar, "-d", extract, "assets/minecraft/models/*", "assets/minecraft/blockstates/*", "assets/minecraft/items/*", "assets/minecraft/textures/block/*", "assets/minecraft/textures/item/*", "assets/minecraft/textures/entity/*", "assets/minecraft/textures/colormap/*", "assets/minecraft/lang/en_us.json"], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("unzip failed");
  }
  const index = (await json(meta.assetIndex.url)) as { objects: Record<string, { hash: string }> };
  const zhHash = index.objects["minecraft/lang/zh_cn.json"]?.hash;
  if (!zhHash) throw new Error("zh_cn.json is missing from the asset index");
  const zhFile = join(CACHE, `zh_cn-${zhHash.slice(0, 8)}.json`);
  if (!existsSync(zhFile)) {
    await download(`https://resources.download.minecraft.net/${zhHash.slice(0, 2)}/${zhHash}`, zhFile);
  }
  writeFileSync(join(CACHE, `meta-${version}.json`), JSON.stringify({ jarUrl: meta.downloads.client.url, sha1: meta.downloads.client.sha1 }));
  return { version, jarUrl: meta.downloads.client.url, sha1: meta.downloads.client.sha1, extract, zhFile };
}

/** Offline fallback: the already extracted version, plus whatever metadata we saved. */
function cachedClient(): Client | null {
  if (!existsSync(CACHE)) return null;
  const versions = readdirSync(CACHE)
    .filter((name) => /^\d/.test(name) && existsSync(join(CACHE, name, "assets/minecraft/models/block/cube.json")))
    .sort();
  const version = versions.at(-1);
  if (!version) return null;
  const zhFile = readdirSync(CACHE).filter((name) => /^zh_cn-[0-9a-f]+\.json$/.test(name)).map((name) => join(CACHE, name)).at(-1);
  if (!zhFile) return null;
  let meta: { jarUrl?: string; sha1?: string } = {};
  try {
    meta = readJson(join(CACHE, `meta-${version}.json`)) as typeof meta;
  } catch {
    meta = {};
  }
  return { version, jarUrl: meta.jarUrl ?? "(cached)", sha1: meta.sha1 ?? "(cached)", extract: join(CACHE, version), zhFile };
}

async function prepareClient(): Promise<Client> {
  try {
    return await downloadClient();
  } catch (reason) {
    const cached = cachedClient();
    if (!cached) throw reason;
    console.warn(`Network unavailable (${reason instanceof Error ? reason.message : String(reason)}); using cached ${cached.version}.`);
    return cached;
  }
}

function mainLibrary(modelsRoot: string): ModelLibrary {
  const cache = new Map<string, ModelDocument | null>();
  return {
    get(reference) {
      const path = modelPath(reference);
      if (cache.has(path)) return cache.get(path) ?? null;
      const file = join(modelsRoot, `${path}.json`);
      if (!existsSync(file)) {
        cache.set(path, null);
        return null;
      }
      const document = readJson(file) as ModelDocument;
      cache.set(path, document);
      return document;
    },
  };
}

function cap(model: CompiledModel): CompiledModel {
  return model.elements.length > 80 ? { ...model, elements: model.elements.slice(0, 80) } : model;
}

function texturesOf(model: CompiledModel | undefined) {
  const files = new Set<string>();
  if (!model) return files;
  if (model.particle) files.add(model.particle);
  for (const layer of model.layers ?? []) files.add(layer);
  for (const element of model.elements) {
    for (const face of Object.values(element.faces)) {
      if (face?.texture && !face.texture.startsWith("custom:")) files.add(face.texture);
    }
  }
  return files;
}

function isCurrent() {
  if (!existsSync(CATALOG_FILE)) return false;
  try {
    return (readJson(CATALOG_FILE) as { schema?: number }).schema === CATALOG_SCHEMA;
  } catch {
    return false;
  }
}

async function main() {
  if (!process.argv.includes("--force") && isCurrent()) {
    console.log("Vanilla catalog is up to date.");
    return;
  }
  const client = await prepareClient();
  const assets = join(client.extract, "assets/minecraft");
  const library = mainLibrary(join(assets, "models"));
  const en = readJson(join(assets, "lang/en_us.json")) as Lang;
  const zh = readJson(client.zhFile) as Lang;
  const used = new Set<string>();
  const entries: Entry[] = [];
  let skipped = 0;

  const blockFiles = readdirSync(join(assets, "blockstates")).filter((name) => name.endsWith(".json"));
  const blockIds = new Set(blockFiles.map((file) => file.replace(/\.json$/, "")));
  for (const file of blockFiles) {
    const id = file.replace(/\.json$/, "");
    if (SKIP_BLOCKS.has(id)) continue;
    try {
      const baked = bakeBlockstate(library, readJson(join(assets, "blockstates", file)));
      if (!baked || !baked.elements.length) {
        skipped += 1;
        continue;
      }
      const model = cap(baked);
      const icon = particleOf(model);
      if (!icon) {
        skipped += 1;
        continue;
      }
      entries.push({
        id: `block:${id}`,
        kind: "block",
        category: blockCategory(id),
        icon,
        en: en[`block.minecraft.${id}`] || titleCase(id),
        zh: zh[`block.minecraft.${id}`] || en[`block.minecraft.${id}`] || titleCase(id),
        model,
      });
      for (const texture of texturesOf(model)) used.add(texture);
    } catch {
      skipped += 1;
    }
  }

  const itemFiles = readdirSync(join(assets, "items")).filter((name) => name.endsWith(".json"));
  let duplicates = 0;
  for (const file of itemFiles) {
    const id = file.replace(/\.json$/, "");
    try {
      const definition = readJson(join(assets, "items", file)) as { model?: unknown };
      const picked = firstModel(definition.model);
      if (!picked) {
        skipped += 1;
        continue;
      }
      const resolved = resolveModel(library, picked.model, picked.hint);
      if (!resolved) {
        skipped += 1;
        continue;
      }
      // A full element model that matches a block is the same prop twice. Flat
      // generated sprites (doors, seeds, buckets) are their own thing.
      const flat = Boolean(resolved.layers?.length);
      if (!flat && blockIds.has(id)) {
        duplicates += 1;
        continue;
      }
      const model = cap(resolved);
      const icon = particleOf(model);
      if (!icon) {
        skipped += 1;
        continue;
      }
      entries.push({
        id: `item:${id}`,
        kind: "item",
        category: itemCategory(id),
        icon,
        en: en[`item.minecraft.${id}`] || en[`block.minecraft.${id}`] || titleCase(id),
        zh: zh[`item.minecraft.${id}`] || zh[`block.minecraft.${id}`] || en[`item.minecraft.${id}`] || titleCase(id),
        model,
      });
      for (const texture of texturesOf(model)) used.add(texture);
    } catch {
      skipped += 1;
    }
  }

  for (const entity of ENTITIES) {
    used.add(entity.texture);
    for (const box of entity.boxes) {
      if (box.texture) used.add(box.texture);
    }
    entries.push({
      id: `entity:${entity.id}`,
      kind: "entity",
      category: entityCategory(entity.id, entity.category),
      icon: entity.texture,
      texW: entity.texW,
      texH: entity.texH,
      crop: entity.crop,
      en: en[`entity.minecraft.${entity.id}`] || titleCase(entity.id),
      zh: zh[`entity.minecraft.${entity.id}`] || en[`entity.minecraft.${entity.id}`] || titleCase(entity.id),
    });
    if (!existsSync(join(assets, "textures", entity.texture))) {
      console.warn(`Missing entity texture ${entity.id}: ${entity.texture}`);
    }
  }

  used.add("colormap/grass.png");
  used.add("colormap/foliage.png");

  rmSync(GENERATED, { recursive: true, force: true });
  const textureRoot = join(GENERATED, client.version);
  mkdirSync(textureRoot, { recursive: true });
  let copied = 0;
  const missing: string[] = [];
  /** Animated PNGs: the mesh has to sample the first square frame. */
  const textureSizes: Record<string, [number, number]> = {};
  for (const key of used) {
    const from = join(assets, "textures", key);
    if (!existsSync(from)) {
      missing.push(key);
      continue;
    }
    const dest = join(textureRoot, key);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(from));
    copied += 1;
    const size = pngSize(from);
    if (size && size[1] > size[0] && existsSync(`${from}.mcmeta`)) textureSizes[key] = size;
  }

  const blocks = entries.filter((entry) => entry.kind === "block").length;
  const items = entries.filter((entry) => entry.kind === "item").length;
  const entities = entries.filter((entry) => entry.kind === "entity").length;
  const catalog = { schema: CATALOG_SCHEMA, version: client.version, blocks, items, entities, textureSizes, entries };
  writeFileSync(CATALOG_FILE, JSON.stringify(catalog));
  writeFileSync(
    join(GENERATED, "SOURCE.md"),
    `# Vanilla textures\n\nFiles under \`${client.version}/\` are unmodified PNGs from the official Minecraft Java client **${client.version}**.\n\n- Version manifest: \`https://piston-meta.mojang.com/mc/game/version_manifest_v2.json\`\n- Client jar: \`${client.jarUrl}\`\n- SHA-1: \`${client.sha1}\`\n- Chinese names: official \`minecraft/lang/zh_cn.json\` from that version’s asset index\n\n\`scripts/generate-vanilla-catalog.ts\` reads blockstates, models, and item definitions and bakes them with the vanilla JSON model format (parents, elements, UV, rotation, grass and foliage tint). Nothing here was drawn or traced.\n\nGrass and leaf tint samples \`colormap/grass.png\` and \`colormap/foliage.png\` at plains climate (temperature 0.8, downfall 0.4).\n\nThis whole folder is generated and gitignored. Those textures are copyright Mojang. Pixelstage is not affiliated with Mojang and does not own the files.\n`,
  );

  const catalogBytes = readFileSync(CATALOG_FILE).byteLength;
  console.log(`Version ${client.version}`);
  console.log(`Blocks ${blocks}, items ${items} (${duplicates} block duplicates dropped), entities ${entities}, skipped ${skipped}`);
  console.log(`Textures copied ${copied}, animated ${Object.keys(textureSizes).length}, missing ${missing.length}, catalog ${Math.round(catalogBytes / 1024)} KB`);
  if (missing.length) console.log(missing.slice(0, 20).join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
