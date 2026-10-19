import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeBlockstate, defaultFaceUv, resolveModel, rotateElements, type ModelDocument, type ModelLibrary } from "../lib/mc-model.ts";

function library(docs: Record<string, ModelDocument>): ModelLibrary {
  return { get: (path) => docs[path] ?? null };
}

const cube: ModelDocument = {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        down: { texture: "#down" },
        up: { texture: "#up" },
        north: { texture: "#north" },
        south: { texture: "#south" },
        west: { texture: "#west" },
        east: { texture: "#east" },
      },
    },
  ],
};

describe("minecraft model parser", () => {
  it("resolves a cube_all parent and default full-cube UVs", () => {
    const model = resolveModel(
      library({
        "block/cube": cube,
        "block/cube_all": {
          parent: "block/cube",
          textures: { particle: "#all", down: "#all", up: "#all", north: "#all", south: "#all", west: "#all", east: "#all" },
        },
        "block/stone": { parent: "block/cube_all", textures: { all: "block/stone" } },
      }),
      "block/stone",
    );
    assert.ok(model);
    assert.equal(model.elements[0].faces.up?.texture, "block/stone.png");
    assert.deepEqual(model.elements[0].faces.north?.uv, [0, 0, 16, 16]);
    assert.deepEqual(defaultFaceUv("up", [0, 0, 0], [8, 16, 16]), [0, 0, 8, 16]);
  });

  it("keeps cross-plant element rotation instead of flattening it", () => {
    const model = resolveModel(
      library({
        "block/cross": {
          textures: { cross: "block/poppy" },
          elements: [
            {
              from: [0.8, 0, 8],
              to: [15.2, 16, 8],
              rotation: { origin: [8, 8, 8], axis: "y", angle: 45, rescale: true },
              faces: { north: { texture: "#cross" }, south: { texture: "#cross" } },
            },
          ],
        },
      }),
      "block/cross",
    );
    assert.equal(model?.elements[0].rotation?.angle, 45);
    assert.equal(model?.elements[0].rotation?.rescale, true);
    assert.equal(model?.elements[0].faces.north?.texture, "block/poppy.png");
  });

  it("bakes a north-south fence as three elements", () => {
    const post = { from: [6, 0, 6], to: [10, 16, 10], faces: { up: { texture: "#texture" } } };
    const side = { from: [6, 6, 0], to: [10, 9, 6], faces: { north: { texture: "#texture" } } };
    const baked = bakeBlockstate(
      library({
        "block/oak_fence_post": { textures: { texture: "block/oak_planks" }, elements: [post] },
        "block/oak_fence_side": { textures: { texture: "block/oak_planks" }, elements: [side] },
      }),
      {
        multipart: [
          { apply: { model: "block/oak_fence_post" } },
          { when: { north: "true" }, apply: { model: "block/oak_fence_side" } },
          { when: { south: "true" }, apply: { model: "block/oak_fence_side", y: 180 } },
          { when: { east: "true" }, apply: { model: "block/oak_fence_side", y: 90 } },
          { when: { west: "true" }, apply: { model: "block/oak_fence_side", y: 270 } },
        ],
      },
    );
    assert.equal(baked?.elements.length, 3);
  });

  it("turns an east stair step toward south on y=90", () => {
    const rotated = rotateElements(
      [{ from: [8, 8, 0], to: [16, 16, 16], faces: { east: { uv: [0, 0, 16, 16], texture: "block/oak_planks.png" } } }],
      0,
      90,
    );
    assert.equal(rotated[0].from[2], 8);
    assert.equal(rotated[0].to[2], 16);
    assert.ok(rotated[0].faces.south);
  });

  it("extrudes generated layers and reads sprite texture objects", () => {
    const sword = resolveModel(
      { get: (path) => (path === "item/diamond_sword" ? { parent: "item/generated", textures: { layer0: "item/diamond_sword", layer1: "item/diamond_sword" } } : null) },
      "item/diamond_sword",
    );
    assert.equal(sword?.layers?.length, 2);
    assert.equal(sword?.elements.length, 2);
    assert.deepEqual(sword?.elements[0].from, [0, 0, 7.5]);
    assert.deepEqual(sword?.elements[0].faces.north?.uv, [16, 0, 0, 16]);

    const apple = resolveModel(
      {
        get: () => ({
          parent: "builtin/generated",
          textures: { layer0: { sprite: "minecraft:item/apple", force_translucent: true } },
        }),
      },
      "item/apple",
    );
    assert.equal(apple?.layers?.[0], "item/apple.png");
    assert.equal(apple?.elements[0].faces.south?.texture, "item/apple.png");
  });
});
