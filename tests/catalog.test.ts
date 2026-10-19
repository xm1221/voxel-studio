import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  CATALOG_CATEGORIES,
  LEGACY_IDS,
  catalogCounts,
  catalogEntry,
  catalogIdKind,
  catalogLabel,
  installCatalog,
  isCatalogId,
  normalizeCatalogId,
  resetCatalog,
  searchCatalog,
  setCatalog,
  type Catalog,
  type CatalogEntry,
} from "../lib/catalog.ts";

after(() => resetCatalog());

function entry(partial: Partial<CatalogEntry> & Pick<CatalogEntry, "id" | "en" | "zh">): CatalogEntry {
  return {
    kind: "block",
    category: "building",
    icon: "block/stone.png",
    ...partial,
  };
}

const FIXTURE: Catalog = {
  schema: 1,
  version: "26.3",
  blocks: 3,
  items: 2,
  entities: 1,
  entries: [
    entry({ id: "block:stone", en: "Stone", zh: "石头", category: "building" }),
    entry({ id: "block:stone_bricks", en: "Stone Bricks", zh: "石砖", category: "building" }),
    entry({ id: "block:redstone_wire", en: "Redstone Dust", zh: "红石粉", category: "redstone" }),
    entry({ id: "item:stone_sword", en: "Stone Sword", zh: "石剑", kind: "item", category: "combat", icon: "item/stone_sword.png" }),
    entry({ id: "item:apple", en: "Apple", zh: "苹果", kind: "item", category: "food", icon: "item/apple.png" }),
    entry({ id: "entity:creeper", en: "Creeper", zh: "苦力怕", kind: "entity", category: "hostile", icon: "entity/creeper/creeper.png" }),
  ],
};

describe("catalog ids", () => {
  it("maps every legacy shelf id onto a catalog id", () => {
    assert.deepEqual(LEGACY_IDS, {
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
    });
    assert.equal(normalizeCatalogId("creeper"), "entity:creeper");
    assert.equal(normalizeCatalogId("grass"), "block:grass_block");
    assert.equal(normalizeCatalogId("sword"), "item:diamond_sword");
  });

  it("accepts catalog and custom ids and rejects everything else", () => {
    assert.equal(normalizeCatalogId("block:oak_log"), "block:oak_log");
    assert.equal(normalizeCatalogId("item:diamond_sword"), "item:diamond_sword");
    assert.equal(normalizeCatalogId("entity:slime"), "entity:slime");
    assert.equal(normalizeCatalogId("custom:my_prop-1"), "custom:my_prop-1");
    assert.equal(normalizeCatalogId("  block:stone  "), "block:stone");
    for (const junk of [
      "",
      "Stone",
      "block:",
      "block:Stone",
      "block:stone!",
      "blocks:stone",
      "custom:",
      "custom:has space",
      "item:ünicode",
      "minecraft:stone",
      42,
      null,
      undefined,
      {},
    ]) {
      assert.equal(normalizeCatalogId(junk), null, `expected ${String(junk)} to be rejected`);
    }
    assert.equal(normalizeCatalogId(`block:${"a".repeat(65)}`), null);
  });

  it("reports the kind of a well-formed id", () => {
    assert.equal(catalogIdKind("block:stone"), "block");
    assert.equal(catalogIdKind("item:apple"), "item");
    assert.equal(catalogIdKind("entity:pig"), "entity");
    assert.equal(catalogIdKind("custom:x"), null);
  });

  it("lists categories per kind", () => {
    assert.deepEqual(CATALOG_CATEGORIES.block.map((item) => item.id), ["building", "colored", "natural", "plants", "functional", "redstone"]);
    assert.deepEqual(CATALOG_CATEGORIES.item.map((item) => item.id), ["tools", "combat", "food", "materials", "spawn_eggs", "misc"]);
    assert.deepEqual(CATALOG_CATEGORIES.entity.map((item) => item.id), ["passive", "neutral", "hostile", "ambient"]);
  });
});

describe("catalog search", () => {
  it("ranks exact, then prefix, then substring, keeping catalog order", () => {
    const ids = searchCatalog(FIXTURE.entries, { query: "stone" }).map((item) => item.id);
    assert.deepEqual(ids, ["block:stone", "block:stone_bricks", "item:stone_sword", "block:redstone_wire"]);

    const prefix = searchCatalog(FIXTURE.entries, { query: "sto" }).map((item) => item.id);
    assert.deepEqual(prefix, ["block:stone", "block:stone_bricks", "item:stone_sword", "block:redstone_wire"]);

    const brick = searchCatalog(FIXTURE.entries, { query: "bricks" }).map((item) => item.id);
    assert.deepEqual(brick, ["block:stone_bricks"]);
  });

  it("matches ids without the prefix and is case-insensitive", () => {
    assert.deepEqual(searchCatalog(FIXTURE.entries, { query: "REDSTONE" }).map((item) => item.id), ["block:redstone_wire"]);
    assert.deepEqual(searchCatalog(FIXTURE.entries, { query: "wire" }).map((item) => item.id), ["block:redstone_wire"]);
    assert.deepEqual(searchCatalog(FIXTURE.entries, { query: "stone_sword" }).map((item) => item.id), ["item:stone_sword"]);
  });

  it("searches Chinese names", () => {
    assert.deepEqual(searchCatalog(FIXTURE.entries, { query: "石" }).map((item) => item.id), [
      "block:stone",
      "block:stone_bricks",
      "item:stone_sword",
      "block:redstone_wire",
    ]);
    assert.deepEqual(searchCatalog(FIXTURE.entries, { query: "苦力" }).map((item) => item.id), ["entity:creeper"]);
  });

  it("filters by kind and category", () => {
    assert.deepEqual(searchCatalog(FIXTURE.entries, { kind: "item" }).map((item) => item.id), ["item:stone_sword", "item:apple"]);
    assert.deepEqual(searchCatalog(FIXTURE.entries, { kind: "item", category: "food" }).map((item) => item.id), ["item:apple"]);
    assert.deepEqual(searchCatalog(FIXTURE.entries, { kind: "entity", query: "stone" }), []);
    assert.deepEqual(searchCatalog(FIXTURE.entries, { category: "redstone" }).map((item) => item.id), ["block:redstone_wire"]);
  });

  it("returns everything, in order, for an empty query", () => {
    assert.deepEqual(searchCatalog(FIXTURE.entries).map((item) => item.id), FIXTURE.entries.map((item) => item.id));
    assert.deepEqual(searchCatalog(FIXTURE.entries, { query: "   " }).length, FIXTURE.entries.length);
  });

  it("looks entries up only after a catalog is installed", () => {
    setCatalog(null);
    assert.equal(catalogEntry("block:stone"), undefined);
    setCatalog(FIXTURE);
    assert.equal(catalogEntry("block:stone")?.en, "Stone");
    assert.equal(catalogEntry("entity:creeper")?.zh, "苦力怕");
    assert.equal(catalogEntry("block:missing"), undefined);
    setCatalog(null);
  });
});

describe("catalog interface", () => {
  it("serves the built-in shelf until a generated file is installed", () => {
    resetCatalog();
    const counts = catalogCounts();
    assert.equal(counts.source, "fallback");
    assert.equal(counts.blocks + counts.items + counts.entities, 17);
    assert.equal(isCatalogId("creeper"), true);
    assert.equal(isCatalogId("block:stone"), true);
    assert.equal(isCatalogId("custom:gem_ab12"), true);
    assert.equal(isCatalogId("nope"), false);
    assert.equal(catalogLabel("grass", "zh"), "草方块");
    assert.equal(catalogEntry("block:stone"), undefined);
  });

  it("plugs generated entries in front of the legacy ids", () => {
    installCatalog({
      version: "26.3",
      entries: [
        {
          id: "block:grass_block",
          kind: "block",
          category: "natural",
          icon: "block/grass_block_top.png",
          en: "Grass Block",
          zh: "草方块",
          model: { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { uv: [0, 0, 16, 16], texture: "block/grass_block_top.png" } } }] },
        },
      ],
    });
    assert.equal(catalogCounts().source, "file");
    assert.equal(catalogCounts().blocks, 1);
    assert.equal(catalogEntry("grass")?.id, "block:grass_block");
    assert.equal(catalogEntry("grass")?.model?.elements.length, 1);
    assert.equal(catalogLabel("block:grass_block", "en"), "Grass Block");
    resetCatalog();
  });
});
