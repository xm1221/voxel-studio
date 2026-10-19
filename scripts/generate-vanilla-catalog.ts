/**
 * Build the vanilla block/item catalog from the official Minecraft Java client.
 *
 *   node --experimental-strip-types scripts/generate-vanilla-catalog.ts
 *
 * Downloads the latest release (or MC_VERSION) via piston-meta, reads blockstates,
 * models, and language, and writes public/vanilla plus lib/generated.
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ENTITIES } from "../lib/entities.ts";
import { bakeBlockstate, modelPath, particleOf, resolveModel, textureFile, type ModelDocument, type ModelLibrary } from "../lib/mc-model.ts";
import type { CompiledModel, TintKind } from "../lib/model-types.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = join(ROOT, ".cache/vanilla");
const PUBLIC = join(ROOT, "public/vanilla");
const GENERATED = join(ROOT, "lib/generated");

const LEGACY_KEYS = new Set([
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
  "entity/creeper.png",
  "entity/pig.png",
  "entity/chicken.png",
  "entity/slime.png",
  "colormap/grass.png",
]);

const ENTITY_ALIAS: Record<string, string> = {
  "entity/creeper.png": "entity/creeper/creeper.png",
  "entity/pig.png": "entity/pig/pig_temperate.png",
  "entity/chicken.png": "entity/chicken/chicken_temperate.png",
  "entity/slime.png": "entity/slime/slime.png",
};

const SKIP_BLOCKS = new Set(["air", "cave_air", "void_air", "light", "structure_void", "moving_piston"]);

type Lang = Record<string, string>;
type Entry = {
  id: string;
  kind: "block" | "item" | "entity";
  category: string;
  icon: string;
  en: string;
  zh: string;
  crop?: [number, number, number, number];
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

function blockCategory(id: string) {
  if (/redstone|piston|observer|hopper|dropper|dispenser|repeater|comparator|rail|daylight|note_block|tripwire|sculk_sensor|target|lever|button|pressure_plate/.test(id)) return "redstone";
  if (/chest|furnace|crafting|anvil|enchant|beacon|brewing|cauldron|barrel|smoker|blast|loom|cartography|grindstone|smithing|stonecutter|campfire|bed|respawn|shulker_box|lectern|composter|jukebox|bell|crafter|vault/.test(id)) return "functional";
  if (/ore|dirt|grass|sand|gravel|leaves|log|wood|sapling|flower|coral|ice|snow|netherrack|nylium|end_stone|obsidian|sculk|moss|mud|clay|mycelium|podzol|rooted|dripstone|amethyst|basalt|blackstone|deepslate|tuff|calcite|ancient|magma|soul|warped|crimson|nether|azalea|spore|vine|kelp|seagrass|lily|bamboo|cactus|sugar|pumpkin|melon|wheat|carrot|potato|beet|torchflower|pitcher|cobweb|mushroom|fungus|roots|wart|chorus|honey|slime|tnt|sponge|bedrock|barrier/.test(id) && !/stairs|slab|fence|wall|door|trapdoor|planks|bricks|button/.test(id)) return "natural";
  return "building";
}

function itemCategory(id: string) {
  if (/sword|axe|pickaxe|shovel|hoe|bow|crossbow|trident|shield|helmet|chestplate|leggings|boots|mace|spear|_arrow$/.test(id)) return "combat";
  if (/apple|bread|beef|pork|chicken|mutton|cod|salmon|stew|soup|potato|carrot|berry|melon|cookie|pie|honey|rabbit|rotten|spider_eye|puffer|tropical|kelp|chorus|glow_berries|sweet_berries|beetroot|dried|golden_apple|pumpkin_pie/.test(id)) return "food";
  if (/spawn_egg|bucket|boat|minecart|music_disc|potion|banner|book|map|saddle|elytra|lead|name_tag|clock|compass|fishing|shears|flint|brush|spyglass|goat_horn|recovery/.test(id)) return "tools";
  return "materials";
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

async function ensureClient() {
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
  return { version, jarUrl: meta.downloads.client.url, sha1: meta.downloads.client.sha1, extract, zhFile };
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

async function main() {
  const client = await ensureClient();
  const assets = join(client.extract, "assets/minecraft");
  const library = mainLibrary(join(assets, "models"));
  const en = readJson(join(assets, "lang/en_us.json")) as Lang;
  const zh = readJson(client.zhFile) as Lang;
  const used = new Set<string>();
  const entries: Entry[] = [];
  let skipped = 0;

  const blockFiles = readdirSync(join(assets, "blockstates")).filter((name) => name.endsWith(".json"));
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
      if (!resolved || !resolved.elements.length) {
        const fallback = textureFile(`item/${id}`);
        const fallbackFile = join(assets, "textures", fallback);
        if (!existsSync(fallbackFile)) {
          skipped += 1;
          continue;
        }
        const sprite = resolveModel({ get: () => ({ parent: "builtin/generated", textures: { layer0: fallback } }) }, "item/fallback", picked.hint);
        if (!sprite) {
          skipped += 1;
          continue;
        }
        entries.push({
          id: `item:${id}`,
          kind: "item",
          category: itemCategory(id),
          icon: fallback,
          en: en[`item.minecraft.${id}`] || en[`block.minecraft.${id}`] || titleCase(id),
          zh: zh[`item.minecraft.${id}`] || zh[`block.minecraft.${id}`] || en[`item.minecraft.${id}`] || titleCase(id),
          model: sprite,
        });
        used.add(fallback);
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
    const source = ENTITY_ALIAS[entity.texture] ?? entity.texture;
    used.add(entity.texture);
    for (const box of entity.boxes) {
      if (box.texture) used.add(box.texture);
    }
    entries.push({
      id: `entity:${entity.id}`,
      kind: "entity",
      category: entity.category,
      icon: entity.texture,
      crop: entity.crop,
      en: en[`entity.minecraft.${entity.id}`] || titleCase(entity.id),
      zh: zh[`entity.minecraft.${entity.id}`] || en[`entity.minecraft.${entity.id}`] || titleCase(entity.id),
    });
    if (!existsSync(join(assets, "textures", source)) && !existsSync(join(assets, "textures", entity.texture))) {
      console.warn(`Missing entity texture ${entity.id}: ${source}`);
    }
  }

  used.add("colormap/grass.png");
  used.add("colormap/foliage.png");

  const textureRoot = join(PUBLIC, client.version);
  rmSync(textureRoot, { recursive: true, force: true });
  mkdirSync(textureRoot, { recursive: true });
  let copied = 0;
  const missing: string[] = [];
  for (const key of used) {
    const sourceRel = ENTITY_ALIAS[key] ?? key;
    const from = join(assets, "textures", sourceRel);
    if (!existsSync(from)) {
      missing.push(key);
      continue;
    }
    const dest = join(textureRoot, key);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(from));
    copied += 1;
  }

  const blocks = entries.filter((entry) => entry.kind === "block").length;
  const items = entries.filter((entry) => entry.kind === "item").length;
  const entities = entries.filter((entry) => entry.kind === "entity").length;
  const catalog = { version: client.version, blocks, items, entities, entries };
  mkdirSync(PUBLIC, { recursive: true });
  writeFileSync(join(PUBLIC, "catalog.json"), JSON.stringify(catalog));
  writeFileSync(
    join(PUBLIC, "SOURCE.md"),
    `# Vanilla textures\n\nFiles under \`${client.version}/\` are unmodified PNGs from the official Minecraft Java client **${client.version}**.\n\n- Version manifest: \`https://piston-meta.mojang.com/mc/game/version_manifest_v2.json\`\n- Client jar: \`${client.jarUrl}\`\n- SHA-1: \`${client.sha1}\`\n- Chinese names: official \`minecraft/lang/zh_cn.json\` from that version’s asset index\n\n\`scripts/generate-vanilla-catalog.ts\` reads blockstates, models, and item definitions and bakes them with the vanilla JSON model format (parents, elements, UV, rotation, grass and foliage tint). Nothing here was drawn or traced.\n\nGrass and leaf tint samples \`colormap/grass.png\` and \`colormap/foliage.png\` at plains climate (temperature 0.8, downfall 0.4).\n\nThose textures are copyright Mojang. Pixelstage is not affiliated with Mojang and does not own the files.\n`,
  );

  mkdirSync(GENERATED, { recursive: true });
  const ids = entries.map((entry) => entry.id);
  writeFileSync(join(GENERATED, "catalog-ids.ts"), `/** Generated by scripts/generate-vanilla-catalog.ts. */\nexport const CATALOG_VERSION = ${JSON.stringify(client.version)};\nexport const CATALOG_IDS: readonly string[] = ${JSON.stringify(ids)};\n`);
  const extra = [...used].filter((key) => !LEGACY_KEYS.has(key) && !key.startsWith("custom:")).sort();
  writeFileSync(join(GENERATED, "texture-keys.ts"), `/** Generated by scripts/generate-vanilla-catalog.ts. */\nexport const EXTRA_TEXTURE_KEYS: readonly string[] = ${JSON.stringify(extra)};\n`);

  const catalogBytes = readFileSync(join(PUBLIC, "catalog.json")).byteLength;
  console.log(`Version ${client.version}`);
  console.log(`Blocks ${blocks}, items ${items}, entities ${entities}, skipped ${skipped}`);
  console.log(`Textures copied ${copied}, missing ${missing.length}, catalog ${Math.round(catalogBytes / 1024)} KB`);
  if (missing.length) console.log(missing.slice(0, 20).join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
