import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ENTITIES, entityDef } from "../lib/entities.ts";
import { entityQuads, geometryFromQuads } from "../lib/model-mesh.ts";

const ASSETS = join(process.cwd(), ".cache/vanilla/26.3/assets/minecraft/textures");
const HAS_CACHE = existsSync(join(ASSETS, "entity/creeper/creeper.png"));

/** Vanilla EntityType height (blocks) × 16 × renderer scale — tolerance ±30%. */
const HEIGHTS: Record<string, number> = {
  cow: 1.4 * 16,
  pig: 0.9 * 16,
  sheep: 1.3 * 16,
  chicken: 0.9 * 16, // model is taller than the 0.7 hitbox
  creeper: 1.7 * 16,
  zombie: 1.95 * 16,
  skeleton: 1.99 * 16,
  wither_skeleton: 2.0 * 16 * 1.2,
  spider: 0.9 * 16,
  enderman: 2.9 * 16,
  iron_golem: 2.7 * 16,
  ghast: 7.5 * 16, // body 16px * 4.5 plus tentacles
  villager: 1.95 * 16,
  wolf: 0.85 * 16,
  horse: 2.0 * 16, // adult horse model ~2 blocks tall
  camel: 2.375 * 16,
  warden: 2.9 * 16,
};

function bounds(id: string) {
  const def = entityDef(id);
  assert.ok(def, id);
  const quads = entityQuads(def);
  const xs = quads.flatMap((q) => q.positions.map((p) => p[0]));
  const ys = quads.flatMap((q) => q.positions.map((p) => p[1]));
  const zs = quads.flatMap((q) => q.positions.map((p) => p[2]));
  return {
    def,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

describe("vanilla entity catalog", () => {
  it("lists curated mobs with ModelPart roots", () => {
    assert.ok(ENTITIES.length >= 40);
    for (const entity of ENTITIES) {
      assert.ok(entity.root, entity.id);
      assert.ok(entity.texture.startsWith("entity/"), entity.id);
    }
  });

  it("has textures on disk when the client cache is present", function () {
    if (!HAS_CACHE) this.skip();
    for (const entity of ENTITIES) {
      assert.ok(existsSync(join(ASSETS, entity.texture)), entity.texture);
    }
  });

  for (const [id, expected] of Object.entries(HEIGHTS)) {
    it(`${id} height is within 30% of vanilla`, () => {
      const b = bounds(id);
      const height = b.maxY - b.minY;
      assert.ok(height > expected * 0.7 && height < expected * 1.3, `${id} height ${height} vs ${expected}`);
      if (!b.def.float) {
        assert.ok(b.minY > -3 && b.minY < 4, `${id} feet ${b.minY}`);
      }
      const cx = (b.minX + b.maxX) / 2;
      assert.ok(Math.abs(cx) < 8, `${id} x-center ${cx}`);
    });
  }

  it("emits entity geometry without the block centering shift", () => {
    const def = entityDef("creeper");
    assert.ok(def);
    const geo = geometryFromQuads(entityQuads(def), { center: "entity" });
    const block = geometryFromQuads(entityQuads(def)); // default block shift
    assert.notEqual(geo.getAttribute("position").getX(0), block.getAttribute("position").getX(0));
  });
});
