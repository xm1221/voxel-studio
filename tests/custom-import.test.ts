import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customFromBbmodel, customFromJavaModel, customFromPng, parseCustomFile } from "../lib/custom-import.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("custom import", () => {
  it("extrudes a PNG into an item and a cube", () => {
    const item = customFromPng({ name: "Gem", kind: "item", images: { all: PNG }, id: "custom:gem_ab12cd" });
    assert.equal(item.kind, "item");
    assert.ok(item.model.elements.length >= 1);
    assert.equal(item.textures["custom:gem_ab12cd:sprite"], PNG);
    const block = customFromPng({
      name: "Crate",
      kind: "block",
      id: "custom:crate_ab12cd",
      images: { north: PNG, south: PNG, up: PNG },
    });
    assert.equal(block.model.elements[0].faces.north?.texture, "custom:crate_ab12cd:north");
    assert.equal(block.model.elements[0].faces.east, undefined);
  });

  it("resolves a Java cube_all model and a Blockbench element", () => {
    const java = customFromJavaModel({ parent: "block/cube_all", textures: { all: "block/stone" } }, new Map(), { name: "Stone", id: "custom:stone_ab12cd" });
    assert.equal(java.model.elements[0].faces.up?.texture, "block/stone.png");
    const bench = customFromBbmodel(
      {
        name: "Crate",
        resolution: { width: 32, height: 32 },
        textures: [{ name: "t", source: PNG }],
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { uv: [0, 0, 32, 32], texture: 0 } } }],
        meta: { model_format: "java_block" },
      },
      { id: "custom:crate_bb1234" },
    );
    assert.deepEqual(bench.model.elements[0].faces.north?.uv, [0, 0, 16, 16]);
    assert.equal(bench.textures["custom:crate_bb1234:tex0"], PNG);
  });

  it("rejects a model with no elements", () => {
    assert.throws(() => parseCustomFile("empty.json", "{}"), /err.customModel/);
    assert.throws(() => customFromPng({ name: "Nope", kind: "item", images: {} }), /err.customPng/);
  });
});
