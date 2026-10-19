import type { CompiledModel } from "./model-types";
import { withBasePath } from "./paths.ts";
import { PROP_SPECS, isCatalogId } from "./props.ts";
import { customAsset } from "./custom-assets.ts";

/**
 * Plug-in catalog. The vanilla generator (owned by the other agent) writes
 * `public/vanilla/catalog.json`. This module loads that file when it is present
 * and otherwise serves the built-in shelf. Generated ids are
 * `block:<name>`, `item:<name>`, and `entity:<name>`.
 *
 * Entry shape:
 * `{ id, kind, category, icon, en, zh, crop?: [u, v, w, h], model?: CompiledModel }`
 * File shape:
 * `{ version, blocks, items, entities, entries: CatalogEntry[] }`
 */
export type CatalogEntry = {
  id: string;
  kind: "block" | "item" | "entity";
  category: string;
  /** Path under `/vanilla/<version>/`, such as `block/stone.png`. */
  icon: string;
  en: string;
  zh: string;
  crop?: [number, number, number, number];
  model?: CompiledModel;
};

export type CatalogFile = {
  version: string;
  blocks: number;
  items: number;
  entities: number;
  entries: CatalogEntry[];
};

/** Short ids already stored in share links, and the namespaced id they display as. */
export const LEGACY_CANONICAL: Record<string, string> = {
  grass: "block:grass_block",
  dirt: "block:dirt",
  stone: "block:stone",
  log: "block:oak_log",
  planks: "block:oak_planks",
  sand: "block:sand",
  tnt: "block:tnt",
  crafting: "block:crafting_table",
  glass: "block:glass",
  sword: "item:diamond_sword",
  pickaxe: "item:diamond_pickaxe",
  apple: "item:apple",
  torch: "block:torch",
  creeper: "entity:creeper",
  pig: "entity:pig",
  chicken: "entity:chicken",
  slime: "entity:slime",
};

const LEGACY_ICON: Record<string, string> = {
  grass: "block/grass_block_side.png",
  dirt: "block/dirt.png",
  stone: "block/stone.png",
  log: "block/oak_log.png",
  planks: "block/oak_planks.png",
  sand: "block/sand.png",
  tnt: "block/tnt_side.png",
  crafting: "block/crafting_table_front.png",
  glass: "block/glass.png",
  sword: "item/diamond_sword.png",
  pickaxe: "item/diamond_pickaxe.png",
  apple: "item/apple.png",
  torch: "block/torch.png",
  creeper: "entity/creeper.png",
  pig: "entity/pig.png",
  chicken: "entity/chicken.png",
  slime: "entity/slime.png",
};

const LEGACY_NAME: Record<string, { en: string; zh: string; category: string }> = {
  grass: { en: "Grass", zh: "草方块", category: "natural" },
  dirt: { en: "Dirt", zh: "泥土", category: "natural" },
  stone: { en: "Stone", zh: "石头", category: "building" },
  log: { en: "Oak log", zh: "橡木", category: "natural" },
  planks: { en: "Planks", zh: "木板", category: "building" },
  sand: { en: "Sand", zh: "沙子", category: "natural" },
  tnt: { en: "TNT", zh: "TNT", category: "redstone" },
  crafting: { en: "Crafting table", zh: "工作台", category: "functional" },
  glass: { en: "Glass", zh: "玻璃", category: "building" },
  sword: { en: "Sword", zh: "剑", category: "combat" },
  pickaxe: { en: "Pickaxe", zh: "镐", category: "combat" },
  apple: { en: "Apple", zh: "苹果", category: "food" },
  torch: { en: "Torch", zh: "火把", category: "materials" },
  creeper: { en: "Creeper", zh: "苦力怕", category: "hostile" },
  pig: { en: "Pig", zh: "猪", category: "passive" },
  chicken: { en: "Chicken", zh: "鸡", category: "passive" },
  slime: { en: "Slime", zh: "史莱姆", category: "hostile" },
};

export { isCatalogId };

const listeners = new Set<() => void>();
let loaded = false;
let version = "";
let entries: CatalogEntry[] = [];
let index = new Map<string, CatalogEntry>();

function fallbackEntries(): CatalogEntry[] {
  return PROP_SPECS.map((spec) => {
    const named = LEGACY_NAME[spec.id];
    return {
      id: spec.id,
      kind: spec.kind,
      category: named?.category ?? (spec.kind === "block" ? "building" : "materials"),
      icon: LEGACY_ICON[spec.id] ?? "",
      en: named?.en ?? spec.id,
      zh: named?.zh ?? spec.id,
    };
  });
}

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeCatalog(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function catalogReady() {
  return loaded;
}

export function catalogVersion() {
  return version;
}

/** Active entries. Falls back to the built-in shelf until `catalog.json` loads. */
export function catalogEntries(): CatalogEntry[] {
  return loaded ? entries : fallbackEntries();
}

export function catalogCounts() {
  const list = catalogEntries();
  return {
    version,
    source: loaded ? ("file" as const) : ("fallback" as const),
    blocks: list.filter((entry) => entry.kind === "block").length,
    items: list.filter((entry) => entry.kind === "item").length,
    entities: list.filter((entry) => entry.kind === "entity").length,
  };
}

export function canonicalCatalogId(id: string) {
  return LEGACY_CANONICAL[id] ?? id;
}

export function catalogEntry(id: string): CatalogEntry | undefined {
  const direct = index.get(id);
  if (direct) return direct;
  const canonical = LEGACY_CANONICAL[id];
  if (canonical && index.has(canonical)) return index.get(canonical);
  if (!loaded) return fallbackEntries().find((entry) => entry.id === id);
  return undefined;
}

export function catalogLabel(id: string, locale: "zh" | "en") {
  const custom = customAsset(id);
  if (custom?.name) return custom.name;
  const entry = catalogEntry(id);
  if (entry) return locale === "zh" ? entry.zh : entry.en;
  const bare = id.split(":").pop() ?? id;
  return bare.replaceAll("_", " ");
}

function cleanModel(value: unknown): CompiledModel | undefined {
  if (!value || typeof value !== "object") return undefined;
  const elements = (value as CompiledModel).elements;
  if (!Array.isArray(elements) || elements.length === 0) return undefined;
  return value as CompiledModel;
}

function cleanEntry(value: unknown): CatalogEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<CatalogEntry>;
  if (typeof record.id !== "string" || !isCatalogId(record.id)) return null;
  if (record.kind !== "block" && record.kind !== "item" && record.kind !== "entity") return null;
  if (typeof record.en !== "string" || typeof record.zh !== "string") return null;
  const crop = Array.isArray(record.crop) && record.crop.length >= 4 ? (record.crop.slice(0, 4).map((part) => Number(part) || 0) as [number, number, number, number]) : undefined;
  const model = cleanModel(record.model);
  return {
    id: record.id,
    kind: record.kind,
    category: typeof record.category === "string" && record.category ? record.category : record.kind,
    icon: typeof record.icon === "string" ? record.icon : "",
    en: record.en,
    zh: record.zh,
    ...(crop ? { crop } : {}),
    ...(model ? { model } : {}),
  };
}

/** Replace the in-memory catalog. Used by the loader and by tests. */
export function installCatalog(value: unknown) {
  if (!value || typeof value !== "object") return;
  const record = value as Partial<CatalogFile>;
  if (!Array.isArray(record.entries)) return;
  const next = record.entries.map(cleanEntry).filter((entry): entry is CatalogEntry => Boolean(entry));
  if (!next.length) return;
  entries = next;
  index = new Map(next.map((entry) => [entry.id, entry]));
  version = typeof record.version === "string" ? record.version : "";
  loaded = true;
  notify();
}

/** Drop a previously installed file and return to the built-in shelf. */
export function resetCatalog() {
  entries = [];
  index = new Map();
  version = "";
  loaded = false;
  notify();
}

export async function loadCatalog() {
  if (typeof fetch === "undefined") return;
  try {
    const response = await fetch(withBasePath("/vanilla/catalog.json"));
    if (!response.ok) return;
    installCatalog(await response.json());
  } catch {
    // The built-in shelf stays available when the file is absent.
  }
}
