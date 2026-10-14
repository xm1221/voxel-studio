import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deformBend } from "../lib/rig/bend.ts";
import { ARM, LEG } from "../lib/rig/layout.ts";
import { overlaySpecs, voxelPieces, type SkinPixels } from "../lib/rig/layers.ts";

function blank(): SkinPixels {
  return { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
}

function paint(skin: SkinPixels, x: number, y: number, alpha = 255) {
  const index = (y * skin.width + x) * 4;
  skin.data[index] = 220;
  skin.data[index + 1] = 80;
  skin.data[index + 2] = 20;
  skin.data[index + 3] = alpha;
}

describe("voxel skin layers", () => {
  it("skips transparent pixels and extrudes one cube per opaque texel", () => {
    const empty = voxelPieces("default", blank());
    assert.equal(empty.length, 0);
    const faint = blank();
    paint(faint, 40, 8, 31);
    assert.equal(voxelPieces("default", faint).length, 0);
    const hat = blank();
    paint(hat, 40, 8);
    const pieces = voxelPieces("default", hat);
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0].parent, "head");
    assert.equal(pieces[0].joint, undefined);
    assert.equal(pieces[0].geometry.getAttribute("position").count, 36);
  });

  it("bends a sleeve cube with the elbow", () => {
    const specs = overlaySpecs("default");
    assert.equal(specs.find((spec) => spec.joint === "rElbow")?.pivotY, ARM.elbowY);
    assert.equal(specs.find((spec) => spec.joint === "rKnee")?.pivotY, LEG.kneeY);
    const skin = blank();
    paint(skin, 44, 47);
    const pieces = voxelPieces("default", skin);
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0].parent, "rArm");
    assert.equal(pieces[0].joint, "rElbow");
    assert.equal(pieces[0].pivotY, ARM.elbowY);
    const geometry = pieces[0].geometry;
    const rest = geometry.getAttribute("rest");
    deformBend(geometry, pieces[0].pivotY ?? 0, -Math.PI / 2);
    const position = geometry.getAttribute("position");
    let moved = false;
    for (let i = 0; i < rest.count; i += 1) {
      if (Math.abs(position.getZ(i) - rest.getZ(i)) > 0.2) moved = true;
    }
    assert.equal(moved, true);
  });
});
