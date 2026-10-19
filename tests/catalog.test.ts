import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { catalogCounts, catalogEntry, catalogLabel, installCatalog, isCatalogId, resetCatalog } from "../lib/catalog.ts";

after(() => resetCatalog());

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
