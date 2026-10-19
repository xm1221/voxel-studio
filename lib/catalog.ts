import type { CompiledModel } from "./model-types.ts";
import { customAsset } from "./custom-assets.ts";
import { withBasePath } from "./paths.ts";

export type PropKind = "block" | "item" | "entity";

export type CatalogEntry = {
  id: string;
  kind: PropKind;
  category: string;
  /** Path under the vanilla texture root, such as `block/stone.png`. */
  icon: string;
  en: string;
  zh: string;
  /** Blocks and items only. Entities are built from lib/entities.ts. */
  model?: CompiledModel;
  /** Entity texture sheet and the icon crop inside it. */
  texW?: number;
  texH?: number;
  crop?: [number, number, number, number];
};

export type Catalog = {
  schema: number;
  version: string;
  blocks: number;
  items: number;
  entities: number;
  entries: CatalogEntry[];
};

/** Same shape as `Catalog`. Kept so older call sites still type-check. */
export type CatalogFile = Catalog;

export type CatalogSearch = {
  query?: string;
  kind?: PropKind | "all";
  category?: string | "all";
  lang?: "zh" | "en" | string;
};

/** Shelf categories, in display order. `key` is an i18n message id. */
export const CATALOG_CATEGORIES: Record<PropKind, ReadonlyArray<{ id: string; key: string }>> = {
  block: [
    { id: "building", key: "cat.block.building" },
    { id: "colored", key: "cat.block.colored" },
    { id: "natural", key: "cat.block.natural" },
    { id: "plants", key: "cat.block.plants" },
    { id: "functional", key: "cat.block.functional" },
    { id: "redstone", key: "cat.block.redstone" },
  ],
  item: [
    { id: "tools", key: "cat.item.tools" },
    { id: "combat", key: "cat.item.combat" },
    { id: "food", key: "cat.item.food" },
    { id: "materials", key: "cat.item.materials" },
    { id: "spawn_eggs", key: "cat.item.spawn_eggs" },
    { id: "misc", key: "cat.item.misc" },
  ],
  entity: [
    { id: "passive", key: "cat.entity.passive" },
    { id: "neutral", key: "cat.entity.neutral" },
    { id: "hostile", key: "cat.entity.hostile" },
    { id: "ambient", key: "cat.entity.ambient" },
  ],
};

/** Ids from the first, hand-written shelf. Old share links still carry these. */
export const LEGACY_IDS: Readonly<Record<string, string>> = {
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

/** Alias used by the gizmo-era catalog plug-in. */
export const LEGACY_CANONICAL = LEGACY_IDS;

const LEGACY_NAME: Record<string, { en: string; zh: string }> = {
  grass: { en: "Grass", zh: "草方块" },
  dirt: { en: "Dirt", zh: "泥土" },
  stone: { en: "Stone", zh: "石头" },
  log: { en: "Oak log", zh: "橡木" },
  planks: { en: "Planks", zh: "木板" },
  sand: { en: "Sand", zh: "沙子" },
  tnt: { en: "TNT", zh: "TNT" },
  crafting: { en: "Crafting table", zh: "工作台" },
  glass: { en: "Glass", zh: "玻璃" },
  sword: { en: "Sword", zh: "剑" },
  pickaxe: { en: "Pickaxe", zh: "镐" },
  apple: { en: "Apple", zh: "苹果" },
  torch: { en: "Torch", zh: "火把" },
  creeper: { en: "Creeper", zh: "苦力怕" },
  pig: { en: "Pig", zh: "猪" },
  chicken: { en: "Chicken", zh: "鸡" },
  slime: { en: "Slime", zh: "史莱姆" },
};

const CATALOG_ID = /^(block|item|entity):[a-z0-9_]{1,64}$/;
/** Reserved for imported custom props; this module only checks the shape. */
const CUSTOM_ID = /^custom:[A-Za-z0-9_-]{1,64}$/;

/**
 * Validate a catalog id and fold the old hand-written ids onto their catalog
 * equivalents. Returns null for junk. Unknown but well-formed ids are kept:
 * the catalog loads asynchronously, so rendering decides what exists.
 */
export function normalizeCatalogId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  const legacy = LEGACY_IDS[value];
  if (legacy) return legacy;
  if (CATALOG_ID.test(value) || CUSTOM_ID.test(value)) return value;
  return null;
}

export function isCatalogId(id: string) {
  return normalizeCatalogId(id) !== null;
}

export function catalogIdKind(id: string): PropKind | null {
  if (id.startsWith("block:")) return "block";
  if (id.startsWith("item:")) return "item";
  if (id.startsWith("entity:")) return "entity";
  return null;
}

export function canonicalCatalogId(id: string) {
  return LEGACY_IDS[id] ?? id;
}

export function entryName(entry: CatalogEntry | undefined, lang: string | undefined): string {
  if (!entry) return "";
  return lang === "zh" ? entry.zh || entry.en : entry.en || entry.zh;
}

function rankField(field: string, query: string): number {
  if (!field) return 3;
  const value = field.toLowerCase();
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (value.includes(query)) return 2;
  return 3;
}

/**
 * Case-insensitive search over English and Chinese names and the id. Ranking is
 * exact > prefix > substring; equal ranks keep catalog order.
 */
export function searchCatalog(entries: readonly CatalogEntry[], options: CatalogSearch = {}): CatalogEntry[] {
  const query = (options.query ?? "").trim().toLowerCase();
  const kind = options.kind ?? "all";
  const category = options.category ?? "all";
  const ranked: Array<{ entry: CatalogEntry; rank: number; index: number }> = [];
  entries.forEach((entry, index) => {
    if (kind !== "all" && entry.kind !== kind) return;
    if (category !== "all" && entry.category !== category) return;
    if (!query) {
      ranked.push({ entry, rank: 0, index });
      return;
    }
    const bare = entry.id.slice(entry.id.indexOf(":") + 1);
    const rank = Math.min(
      rankField(entry.en, query),
      rankField(entry.zh, query),
      rankField(entry.id, query),
      rankField(bare, query),
    );
    if (rank > 2) return;
    ranked.push({ entry, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map((item) => item.entry);
}

const CATALOG_PATH = "/vanilla/gen/catalog.json";
const FALLBACK_VERSION = "26.3";

let catalog: Catalog | null = null;
let catalogVersion = FALLBACK_VERSION;
let byId = new Map<string, CatalogEntry>();
let pending: Promise<Catalog> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeCatalog(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test and embed hook: install a catalog without touching the network. */
export function setCatalog(next: Catalog | null) {
  catalog = next;
  catalogVersion = next?.version || FALLBACK_VERSION;
  byId = new Map((next?.entries ?? []).map((entry) => [entry.id, entry]));
  notify();
}

export function loadedCatalog(): Catalog | null {
  return catalog;
}

export function catalogReady() {
  return catalog !== null;
}

/** Fetch the generated catalog once. Later calls share the same promise. */
export function loadCatalog(): Promise<Catalog> {
  if (catalog) return Promise.resolve(catalog);
  if (!pending) {
    pending = fetch(withBasePath(CATALOG_PATH))
      .then((response) => {
        if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
        return response.json() as Promise<Catalog>;
      })
      .then((next) => {
        setCatalog(next);
        return next;
      })
      .catch((reason) => {
        pending = null;
        throw reason;
      });
  }
  return pending;
}

export function catalogEntry(id: string): CatalogEntry | undefined {
  const direct = byId.get(id);
  if (direct) return direct;
  const canonical = LEGACY_IDS[id];
  if (canonical) return byId.get(canonical);
  return undefined;
}

export function catalogEntries(): CatalogEntry[] {
  return catalog?.entries ?? [];
}

export function catalogVersionText() {
  return catalogVersion;
}

export function catalogCounts() {
  const list = catalog?.entries ?? [];
  return {
    version: catalog ? catalogVersion : "",
    source: catalog ? ("file" as const) : ("fallback" as const),
    blocks: catalog ? list.filter((entry) => entry.kind === "block").length : 9,
    items: catalog ? list.filter((entry) => entry.kind === "item").length : 4,
    entities: catalog ? list.filter((entry) => entry.kind === "entity").length : 4,
  };
}

export function catalogLabel(id: string, locale: "zh" | "en" | string) {
  const custom = customAsset(id);
  if (custom?.name) return custom.name;
  const entry = catalogEntry(id);
  if (entry) return locale === "zh" ? entry.zh : entry.en;
  const named = LEGACY_NAME[id];
  if (named) return locale === "zh" ? named.zh : named.en;
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
  const crop =
    Array.isArray(record.crop) && record.crop.length >= 4
      ? (record.crop.slice(0, 4).map((part) => Number(part) || 0) as [number, number, number, number])
      : undefined;
  const model = cleanModel(record.model);
  return {
    id: record.id,
    kind: record.kind,
    category: typeof record.category === "string" && record.category ? record.category : record.kind,
    icon: typeof record.icon === "string" ? record.icon : "",
    en: record.en,
    zh: record.zh,
    ...(typeof record.texW === "number" ? { texW: record.texW } : {}),
    ...(typeof record.texH === "number" ? { texH: record.texH } : {}),
    ...(crop ? { crop } : {}),
    ...(model ? { model } : {}),
  };
}

/** Replace the in-memory catalog. Used by the loader and by tests. */
export function installCatalog(value: unknown) {
  if (!value || typeof value !== "object") return;
  const record = value as Partial<Catalog>;
  if (!Array.isArray(record.entries)) return;
  const entries = record.entries.map(cleanEntry).filter((entry): entry is CatalogEntry => Boolean(entry));
  if (!entries.length) return;
  setCatalog({
    schema: typeof record.schema === "number" ? record.schema : 1,
    version: typeof record.version === "string" ? record.version : "",
    blocks: typeof record.blocks === "number" ? record.blocks : entries.filter((entry) => entry.kind === "block").length,
    items: typeof record.items === "number" ? record.items : entries.filter((entry) => entry.kind === "item").length,
    entities: typeof record.entities === "number" ? record.entities : entries.filter((entry) => entry.kind === "entity").length,
    entries,
  });
}

/** Drop a previously installed file. */
export function resetCatalog() {
  pending = null;
  setCatalog(null);
}

export function catalogTextureUrl(path: string): string {
  return withBasePath(`/vanilla/gen/${catalogVersion}/${path}`);
}
