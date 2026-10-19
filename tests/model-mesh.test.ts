import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entityDef } from "../lib/entities.ts";
import {
  animatedFrame,
  boxRegions,
  elementFaceQuad,
  entityQuads,
  geometryFromQuads,
  groupQuads,
  itemExtrusionQuads,
  modelQuads,
  rotateUvCorners,
  type ModelQuad,
} from "../lib/model-mesh.ts";
import type { CompiledElement, CompiledModel } from "../lib/model-types.ts";

const CUBE: CompiledModel = {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        north: { uv: [0, 0, 16, 16], texture: "block/stone.png" },
        south: { uv: [0, 0, 16, 16], texture: "block/stone.png" },
        east: { uv: [0, 0, 16, 16], texture: "block/stone.png" },
        west: { uv: [0, 0, 16, 16], texture: "block/stone.png" },
        up: { uv: [0, 0, 16, 16], texture: "block/stone.png" },
        down: { uv: [0, 0, 16, 16], texture: "block/stone.png" },
      },
    },
  ],
};

function area(positions: ModelQuad["positions"]) {
  const [a, b, c] = positions;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  // Area of the triangle; a quad is two of them.
  return Math.hypot(cross[0], cross[1], cross[2]);
}

function normalOf(positions: ModelQuad["positions"]) {
  const [a, b, c] = positions;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  // `|| 0` turns -0 into 0 so deepEqual does not trip on the sign.
  return cross.map((value) => Math.sign(Math.round(value * 1000)) || 0);
}

describe("model quads", () => {
  it("makes six quads for a full cube, all facing out with full-face UVs", () => {
    const quads = modelQuads(CUBE);
    assert.equal(quads.length, 6);
    for (const quad of quads) {
      assert.equal(area(quad.positions), 256);
      assert.deepEqual(normalOf(quad.positions), quad.normal);
      const expected = quad.face === "up" || quad.face === "down"
        ? [[0, 0], [1, 0], [1, 1], [0, 1]]
        : [[0, 1], [0, 0], [1, 0], [1, 1]];
      assert.deepEqual(quad.uvs, expected);
      assert.equal(quad.texture, "block/stone.png");
    }
    const byFace = new Map(quads.map((quad) => [quad.face, quad]));
    assert.deepEqual(byFace.get("north")?.positions, [
      [16, 16, 0],
      [16, 0, 0],
      [0, 0, 0],
      [0, 16, 0],
    ]);
    assert.deepEqual(byFace.get("up")?.positions, [
      [0, 16, 16],
      [16, 16, 16],
      [16, 16, 0],
      [0, 16, 0],
    ]);
  });

  it("keeps explicit UVs and applies 90-degree face rotation", () => {
    const element: CompiledElement = {
      from: [0, 0, 0],
      to: [16, 8, 16],
      faces: { north: { uv: [0, 8, 16, 16], texture: "block/oak_planks.png" } },
    };
    const plain = elementFaceQuad(element, "north", element.faces.north!);
    assert.deepEqual(plain.uvs, [
      [0, 0.5],
      [0, 0],
      [1, 0],
      [1, 0.5],
    ]);
    const rotated = elementFaceQuad(element, "north", { ...element.faces.north!, rotation: 90 });
    // The corner that sampled the top-left now samples the bottom-left.
    assert.deepEqual(rotated.uvs, [
      [0, 0],
      [1, 0],
      [1, 0.5],
      [0, 0.5],
    ]);
    // Cycling corners four times comes back to the start.
    const corners: [ [number, number], [number, number], [number, number], [number, number] ] = [
      [0, 0.5],
      [0, 0],
      [1, 0],
      [1, 0.5],
    ];
    assert.deepEqual(rotateUvCorners(corners, 360), corners);
    assert.deepEqual(rotateUvCorners(corners, 90), [corners[1], corners[2], corners[3], corners[0]]);
  });

  it("rotates a whole element around its origin, with optional rescale", () => {
    const element: CompiledElement = {
      from: [7, 1, 7],
      to: [9, 11, 9],
      rotation: { origin: [8, 1, 8], axis: "x", angle: 45 },
      faces: { north: { uv: [7, 6, 9, 16], texture: "block/lever.png" } },
    };
    const quad = elementFaceQuad(element, "north", element.faces.north!);
    // The origin stays put, and the top swings back (negative Z).
    const origin = [8, 1, 8];
    for (const point of quad.positions) {
      assert.ok(Math.hypot(point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]) <= Math.hypot(1, 10, 1) + 0.001);
    }
    const top = quad.positions.filter((point) => point[1] > 5);
    assert.equal(top.length, 2);
    for (const point of top) assert.ok(point[2] > 7, "the rotated top leans south (right-hand rule around +X)");
    assert.notDeepEqual(quad.normal, [0, 0, -1]);
    assert.ok(Math.abs(Math.hypot(...quad.normal) - 1) < 0.001);

    // Rescale stretches along the rotation axis so the silhouette keeps its size.
    const rescaled = elementFaceQuad({ ...element, rotation: { ...element.rotation!, rescale: true } }, "north", element.faces.north!);
    const height = (positions: ModelQuad["positions"]) => Math.max(...positions.map((point) => point[1])) - Math.min(...positions.map((point) => point[1]));
    assert.ok(height(rescaled.positions) > height(quad.positions));
  });

  it("translates model space to world space: centered on x/z, bottom at y=0", () => {
    const geometry = geometryFromQuads(modelQuads(CUBE));
    const positions = geometry.getAttribute("position");
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    assert.deepEqual([minX, maxX, minY, maxY, minZ, maxZ], [-8, 8, 0, 16, -8, 8]);
    assert.equal(positions.count, 6 * 6);
    assert.equal(geometry.getAttribute("normal").count, 36);
    assert.equal(geometry.getAttribute("uv").count, 36);
  });

  it("groups quads by texture and tint", () => {
    const model: CompiledModel = {
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: {
            up: { uv: [0, 0, 16, 16], texture: "block/grass_block_top.png", tint: "grass" },
            down: { uv: [0, 0, 16, 16], texture: "block/dirt.png" },
            north: { uv: [0, 0, 16, 16], texture: "block/grass_block_side.png" },
            south: { uv: [0, 0, 16, 16], texture: "block/grass_block_side.png" },
          },
        },
      ],
    };
    const groups = groupQuads(modelQuads(model));
    assert.deepEqual(
      groups.map((group) => [group.texture, group.tint ?? null, group.quads.length]),
      [
        ["block/grass_block_top.png", "grass", 1],
        ["block/dirt.png", null, 1],
        ["block/grass_block_side.png", null, 2],
      ],
    );
    const geometry = geometryFromQuads(groups.flatMap((group) => group.quads));
    assert.equal(geometry.getAttribute("position").count, 24);
  });
});

describe("entity ModelPart / Blockbench box UV", () => {
  it("lays out the standard cube UV regions", () => {
    assert.deepEqual(boxRegions({ u: 0, v: 0, w: 8, h: 8, d: 8 }), {
      west: [0, 8, 8, 8],
      north: [8, 8, 8, 8],
      east: [16, 8, 8, 8],
      south: [24, 8, 8, 8],
      down: [8, 0, 8, 8],
      up: [16, 0, 8, 8],
    });
  });

  it("keeps cow head corners on the vanilla ModelPart tree", () => {
    const def = entityDef("entity:cow");
    assert.ok(def);
    const quads = entityQuads(def);
    assert.ok(quads.length >= 6);
    // Head pivot (0,4,-8), box (-4,-4,-6, 8,8,6). After vanilla map (-x, 24-y, z)
    // a local corner (-4,-4,-6) → model (-4,0,-14) → world (4, 24, -14).
    const xs = quads.flatMap((q) => q.positions.map((p) => p[0]));
    const ys = quads.flatMap((q) => q.positions.map((p) => p[1]));
    assert.ok(Math.min(...ys) >= -1, `feet near 0, got ${Math.min(...ys)}`);
    assert.ok(Math.max(...ys) > 20, `cow should be taller than 20px, got ${Math.max(...ys)}`);
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2) < 6);
  });

  it("does not apply the block -8 shift for entities", () => {
    const def = entityDef("entity:creeper");
    assert.ok(def);
    const quads = entityQuads(def);
    const geometry = geometryFromQuads(quads, { center: "entity" });
    const pos = geometry.getAttribute("position");
    let minY = Infinity;
    for (let i = 0; i < pos.count; i += 1) minY = Math.min(minY, pos.getY(i));
    assert.ok(minY > -2 && minY < 2, `entity feet near 0, got ${minY}`);
  });

  it("scales wither skeletons like the vanilla renderer", () => {
    const def = entityDef("entity:wither_skeleton");
    assert.ok(def);
    assert.equal(def.scale, 1.2);
    const quads = entityQuads(def);
    const ys = quads.flatMap((q) => q.positions.map((p) => p[1]));
    assert.ok(Math.max(...ys) > 28, `wither skeleton should be tall, got ${Math.max(...ys)}`);
  });

  it("emits outward normals per cube after the odd vanilla world map", () => {
    const ids = [
      "entity:creeper",
      "entity:pig",
      "entity:cow",
      "entity:zombie",
      "entity:skeleton",
      "entity:wither_skeleton",
      "entity:ghast",
      "entity:guardian",
      "entity:enderman",
      "entity:iron_golem",
    ];
    for (const id of ids) {
      const def = entityDef(id);
      assert.ok(def, id);
      const quads = entityQuads(def);
      assert.ok(quads.length >= 6, id);
      let inward = 0;
      for (let i = 0; i + 6 <= quads.length; i += 6) {
        const cube = quads.slice(i, i + 6);
        let cx = 0, cy = 0, cz = 0, n = 0;
        for (const q of cube) for (const p of q.positions) {
          cx += p[0]; cy += p[1]; cz += p[2]; n += 1;
        }
        cx /= n; cy /= n; cz /= n;
        for (const q of cube) {
          const mid = [0, 0, 0];
          for (const p of q.positions) {
            mid[0] += p[0]; mid[1] += p[1]; mid[2] += p[2];
          }
          mid[0] /= 4; mid[1] /= 4; mid[2] /= 4;
          const toOut = [mid[0] - cx, mid[1] - cy, mid[2] - cz];
          const dot = q.normal[0] * toOut[0] + q.normal[1] * toOut[1] + q.normal[2] * toOut[2];
          if (dot < -1e-6) inward += 1;
        }
      }
      assert.equal(inward, 0, `${id} has ${inward} inward faces`);
    }
  });

  it("matches CubeDump head polygon positions for a synthetic 8³ cube", () => {
    // CubeDump head mirror=false (tex 64x32): down face corners in model space.
    const def = {
      id: "golden-head",
      label: "golden",
      category: "hostile" as const,
      texture: "entity/creeper/creeper.png",
      texW: 64,
      texH: 32,
      root: {
        cubes: [{ u: 0, v: 0, x: -4, y: -8, z: -4, w: 8, h: 8, d: 8 }],
      },
    };
    const quads = entityQuads(def);
    assert.equal(quads.length, 6);
    // After world map + reverse, the physical top of the cube (model down face,
    // y flipped) sits at y = 24 - (-8) = 32 before ground-align; ground-align
    // then shifts minY→0 so top is at y=8.
    const ys = quads.flatMap((q) => q.positions.map((p) => p[1]));
    assert.equal(Math.min(...ys), 0);
    assert.equal(Math.max(...ys), 8);
    // Every face still outward relative to cube centroid.
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const q of quads) for (const p of q.positions) {
      cx += p[0]; cy += p[1]; cz += p[2]; n += 1;
    }
    cx /= n; cy /= n; cz /= n;
    for (const q of quads) {
      const mid = [0, 0, 0];
      for (const p of q.positions) {
        mid[0] += p[0]; mid[1] += p[1]; mid[2] += p[2];
      }
      mid[0] /= 4; mid[1] /= 4; mid[2] /= 4;
      const toOut = [mid[0] - cx, mid[1] - cy, mid[2] - cz];
      const dot = q.normal[0] * toOut[0] + q.normal[1] * toOut[1] + q.normal[2] * toOut[2];
      assert.ok(dot > 0, `face ${q.face} normal not outward (dot=${dot})`);
    }
  });
});

describe("generated item extrusion", () => {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  data[(8 * 16 + 8) * 4 + 3] = 255;
  data[(8 * 16 + 8) * 4] = 255;

  it("adds front, back, and one side quad per silhouette edge", () => {
    const quads = itemExtrusionQuads([{ texture: "item/apple.png", width: 16, height: 16, data }]);
    // A single opaque pixel has four exposed edges.
    assert.equal(quads.length, 6);
    const faces = quads.map((quad) => quad.face).sort();
    assert.deepEqual(faces, ["down", "east", "north", "south", "up", "west"]);
    const side = quads.find((quad) => quad.face === "west");
    assert.ok(side);
    assert.equal(area(side.positions), 1);
    assert.deepEqual(side.uvs[0], [8.5 / 16, 1 - 8.5 / 16]);
  });

  it("shares one side quad between touching pixels", () => {
    const two = new Uint8ClampedArray(data);
    two[(8 * 16 + 9) * 4 + 3] = 255;
    const quads = itemExtrusionQuads([{ texture: "item/apple.png", width: 16, height: 16, data: two }]);
    // Two pixels: 6 exposed edges + front + back.
    assert.equal(quads.length, 8);
  });

  it("skips a fully transparent layer", () => {
    assert.deepEqual(itemExtrusionQuads([{ texture: "item/empty.png", width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) }]), []);
  });
});

describe("animated textures", () => {
  it("samples only the first square frame", () => {
    assert.deepEqual(animatedFrame(16, 80), { repeatY: 1 / 5, offsetY: 0.8 });
    assert.deepEqual(animatedFrame(16, 512), { repeatY: 1 / 32, offsetY: 31 / 32 });
    assert.equal(animatedFrame(16, 16), null);
    assert.equal(animatedFrame(32, 32), null);
    assert.equal(animatedFrame(16, 20), null);
    assert.equal(animatedFrame(0, 0), null);
  });

  it("leaves a still cube's UVs in the full 0..1 range", () => {
    const quads = modelQuads(CUBE);
    for (const quad of quads) for (const [u, v] of quad.uvs) assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1);
  });
});
