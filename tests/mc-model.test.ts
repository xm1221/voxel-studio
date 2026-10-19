import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeBlockstate, defaultFaceUv, resolveModel, rotateElements, type ModelDocument, type ModelLibrary } from "../lib/mc-model.ts";
import { modelQuads } from "../lib/model-mesh.ts";

function library(documents: Record<string, ModelDocument>): ModelLibrary {
  return {
    get(path) {
      return documents[path] ?? null;
    },
  };
}

const CUBE_ALL: ModelDocument = {
  parent: "block/cube",
  textures: { particle: "#all", down: "#all", up: "#all", north: "#all", east: "#all", south: "#all", west: "#all" },
};

const CUBE: ModelDocument = {
  parent: "block/block",
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        down: { texture: "#down", cullface: "down" },
        up: { texture: "#up", cullface: "up" },
        north: { texture: "#north", cullface: "north" },
        south: { texture: "#south", cullface: "south" },
        west: { texture: "#west", cullface: "west" },
        east: { texture: "#east", cullface: "east" },
      },
    },
  ],
};

const BLOCK: ModelDocument = {};

const CROSS: ModelDocument = {
  ambientocclusion: false,
  textures: { particle: "#cross" },
  elements: [
    { from: [0.8, 0, 8], to: [15.2, 16, 8], rotation: { origin: [8, 8, 8], axis: "y", angle: 45, rescale: true }, faces: { north: { uv: [0, 0, 16, 16], texture: "#cross" }, south: { uv: [0, 0, 16, 16], texture: "#cross" } } },
    { from: [8, 0, 0.8], to: [8, 16, 15.2], rotation: { origin: [8, 8, 8], axis: "y", angle: 45, rescale: true }, faces: { west: { uv: [0, 0, 16, 16], texture: "#cross" }, east: { uv: [0, 0, 16, 16], texture: "#cross" } } },
  ],
};

const SLAB: ModelDocument = {
  parent: "block/block",
  textures: { particle: "#side" },
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 8, 16],
      faces: {
        down: { uv: [0, 0, 16, 16], texture: "#bottom", cullface: "down" },
        up: { uv: [0, 0, 16, 16], texture: "#top" },
        north: { uv: [0, 8, 16, 16], texture: "#side", cullface: "north" },
        south: { uv: [0, 8, 16, 16], texture: "#side", cullface: "south" },
        west: { uv: [0, 8, 16, 16], texture: "#side", cullface: "west" },
        east: { uv: [0, 8, 16, 16], texture: "#side", cullface: "east" },
      },
    },
  ],
};

const STAIRS: ModelDocument = {
  parent: "block/block",
  textures: { particle: "#side" },
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 8, 16],
      faces: {
        down: { uv: [0, 0, 16, 16], texture: "#bottom", cullface: "down" },
        up: { uv: [0, 0, 16, 16], texture: "#top" },
        north: { uv: [0, 8, 16, 16], texture: "#side", cullface: "north" },
        south: { uv: [0, 8, 16, 16], texture: "#side", cullface: "south" },
        west: { uv: [0, 8, 16, 16], texture: "#side", cullface: "west" },
        east: { uv: [0, 8, 16, 16], texture: "#side", cullface: "east" },
      },
    },
    {
      from: [8, 8, 0],
      to: [16, 16, 16],
      faces: {
        up: { uv: [8, 0, 16, 16], texture: "#top", cullface: "up" },
        north: { uv: [0, 0, 8, 8], texture: "#side", cullface: "north" },
        south: { uv: [8, 0, 16, 8], texture: "#side", cullface: "south" },
        west: { uv: [0, 0, 16, 8], texture: "#side" },
        east: { uv: [0, 0, 16, 8], texture: "#side", cullface: "east" },
      },
    },
  ],
};

function baseDocs(): Record<string, ModelDocument> {
  return {
    block: BLOCK,
    "block/cube": CUBE,
    "block/cube_all": CUBE_ALL,
    "block/cross": CROSS,
    "block/slab": SLAB,
    "block/stairs": STAIRS,
    "block/block": BLOCK,
    "item/generated": { parent: "builtin/generated" },
    "item/handheld": { parent: "item/generated" },
  };
}

describe("vanilla model resolver", () => {
  it("walks parents and resolves texture variables", () => {
    const docs = baseDocs();
    docs["block/stone"] = { parent: "minecraft:block/cube_all", textures: { all: "minecraft:block/stone" } };
    const model = resolveModel(library(docs), "minecraft:block/stone");
    assert.ok(model);
    assert.equal(model.elements.length, 1);
    const faces = model.elements[0].faces;
    assert.deepEqual(Object.keys(faces).sort(), ["down", "east", "north", "south", "up", "west"]);
    for (const face of Object.values(faces)) assert.equal(face?.texture, "block/stone.png");
    assert.equal(model.particle, "block/stone.png");
  });

  it("reads a slab's explicit element UVs", () => {
    const docs = baseDocs();
    docs["block/stone_slab"] = { parent: "block/slab", textures: { bottom: "block/stone", top: "block/stone", side: "block/stone" } };
    const model = resolveModel(library(docs), "block/stone_slab");
    assert.ok(model);
    assert.deepEqual(model.elements[0].from, [0, 0, 0]);
    assert.deepEqual(model.elements[0].to, [16, 8, 16]);
    assert.deepEqual(model.elements[0].faces.north?.uv, [0, 8, 16, 16]);
  });

  it("bakes stairs: a straight bottom variant rotated by the blockstate", () => {
    const docs = baseDocs();
    docs["block/oak_stairs"] = { parent: "block/stairs", textures: { bottom: "block/oak_planks", top: "block/oak_planks", side: "block/oak_planks" } };
    const model = bakeBlockstate(library(docs), {
      variants: {
        "facing=east,half=bottom,shape=straight": { model: "block/oak_stairs" },
        "facing=east,half=top,shape=straight": { model: "block/oak_stairs", x: 180, uvlock: true },
      },
    });
    assert.ok(model);
    assert.equal(model.elements.length, 2);
    assert.deepEqual(model.elements[1].from, [8, 8, 0]);
  });

  it("rotates an element box for a blockstate y rotation and keeps UV lock", () => {
    const docs = baseDocs();
    docs["block/oak_stairs"] = { parent: "block/stairs", textures: { bottom: "block/oak_planks", top: "block/oak_planks", side: "block/oak_planks" } };
    const source = resolveModel(library(docs), "block/oak_stairs", undefined);
    assert.ok(source);
    const rotated = rotateElements(source.elements, 0, 90, true);
    // The upper step at x 8..16 swings to the south side for y=90.
    assert.deepEqual(rotated[1].from, [0, 8, 8]);
    assert.deepEqual(rotated[1].to, [16, 16, 16]);
  });

  it("prefers the plain, unsnowed blockstate variant", () => {
    const docs = baseDocs();
    docs["block/grass_block"] = { parent: "block/cube_bottom_top", textures: { bottom: "block/dirt", top: "block/grass_block_top", side: "block/grass_block_side" } };
    docs["block/grass_block_snow"] = { parent: "block/cube_bottom_top", textures: { bottom: "block/dirt", top: "block/grass_block_top", side: "block/grass_block_snow" } };
    docs["block/cube_bottom_top"] = { parent: "block/cube", textures: { particle: "#side", down: "#bottom", up: "#top", north: "#side", east: "#side", south: "#side", west: "#side" } };
    const model = bakeBlockstate(library(docs), {
      variants: {
        "snowy=false": [{ model: "block/grass_block" }, { model: "block/grass_block", y: 90 }],
        "snowy=true": { model: "block/grass_block_snow" },
      },
    });
    assert.ok(model);
    assert.equal(model.elements[0].faces.north?.texture, "block/grass_block_side.png");
  });

  it("keeps cross models and their element rotation", () => {
    const docs = baseDocs();
    docs["block/short_grass"] = { parent: "block/cross", textures: { cross: "block/short_grass" } };
    const model = resolveModel(library(docs), "block/short_grass");
    assert.ok(model);
    assert.equal(model.elements.length, 2);
    assert.deepEqual(model.elements[0].rotation, { origin: [8, 8, 8], axis: "y", angle: 45, rescale: true });
  });

  it("resolves generated item layers", () => {
    const docs = baseDocs();
    docs["item/apple"] = { parent: "minecraft:item/generated", textures: { layer0: "minecraft:item/apple" } };
    const model = resolveModel(library(docs), "item/apple");
    assert.ok(model);
    assert.deepEqual(model.layers, ["item/apple.png"]);
    assert.equal(model.elements.length, 1);
    assert.equal(model.elements[0].faces.south?.texture, "item/apple.png");
  });

  it("handles heavy_core's bare texture variable", () => {
    const docs = baseDocs();
    docs["block/heavy_core"] = {
      texture_size: [16, 16],
      textures: { all: "block/heavy_core", particle: "block/heavy_core" },
      elements: [
        {
          from: [4, 0, 4],
          to: [12, 8, 12],
          faces: {
            north: { uv: [0, 8, 8, 16], texture: "all" },
            east: { uv: [0, 8, 8, 16], texture: "all" },
            south: { uv: [0, 8, 8, 16], texture: "all" },
            west: { uv: [0, 8, 8, 16], texture: "all" },
            up: { uv: [0, 0, 8, 8], texture: "all" },
            down: { uv: [8, 0, 16, 8], texture: "all" },
          },
        },
      ],
    };
    const model = resolveModel(library(docs), "block/heavy_core");
    assert.ok(model);
    for (const face of Object.values(model.elements[0].faces)) assert.equal(face?.texture, "block/heavy_core.png");
    const quads = modelQuads(model);
    assert.equal(quads.length, 6);
  });

  it("treats an undefined texture variable as a texture path, not a loop", () => {
    const docs = baseDocs();
    docs["block/odd"] = {
      textures: { particle: "block/odd" },
      elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: "#missing" }, down: { texture: "block/odd" } } }],
    };
    const model = resolveModel(library(docs), "block/odd");
    assert.ok(model);
    assert.equal(model.elements[0].faces.up, undefined);
    assert.equal(model.elements[0].faces.down?.texture, "block/odd.png");
  });

  it("returns null for an unknown model", () => {
    assert.equal(resolveModel(library(baseDocs()), "block/never_heard_of_it"), null);
  });
});

describe("gizmo-branch model cases", () => {
  it("fills a missing cube face UV from the element box", () => {
    const model = resolveModel(
      library({
        "block/cube": {
          elements: [
            {
              from: [0, 0, 0],
              to: [8, 16, 16],
              faces: { up: { texture: "#up" } },
            },
          ],
        },
        "block/stone": { parent: "block/cube", textures: { up: "block/stone" } },
      }),
      "block/stone",
    );
    assert.equal(model?.elements[0].faces.up?.texture, "block/stone.png");
    assert.deepEqual(model?.elements[0].faces.up?.uv, defaultFaceUv("up", [0, 0, 0], [8, 16, 16]));
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

  it("reads a sprite texture object and stacks generated layers", () => {
    const sword = resolveModel(
      library({
        "item/generated": { textures: { layer0: "#layer0" } },
        "item/diamond_sword": { parent: "item/generated", textures: { layer0: "item/diamond_sword", layer1: "item/diamond_sword" } },
      }),
      "item/diamond_sword",
    );
    assert.equal(sword?.layers?.length, 2);

    const apple = resolveModel(
      library({
        "builtin/generated": {},
        "item/apple": {
          parent: "builtin/generated",
          textures: { layer0: { sprite: "minecraft:item/apple", force_translucent: true } },
        },
      }),
      "item/apple",
    );
    assert.equal(apple?.layers?.[0], "item/apple.png");
    assert.equal(apple?.elements[0].faces.south?.texture, "item/apple.png");
  });
});
