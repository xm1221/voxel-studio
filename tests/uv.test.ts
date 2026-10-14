import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BoxGeometry, BufferAttribute } from "three";
import { buildBoxUVs, capFace } from "../lib/rig/uv.ts";

describe("skin uvs", () => {
  it("fills every box corner and keeps the lower limb on the bottom half of the texture", () => {
    const uvs = buildBoxUVs({ u: 0, v: 16, w: 4, h: 6, d: 4, texW: 64, texH: 64, side: 6 });
    assert.equal(uvs.length, 48);
    const geometry = new BoxGeometry(4, 6, 4);
    geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
    const front = uvs.slice(32, 40);
    const ys = [front[1], front[3], front[5], front[7]];
    for (const y of ys) {
      assert.ok(y > 0.49 && y < 0.61, `front v ${y} left the lower-leg band`);
    }
  });

  it("caps a cut face to one texel", () => {
    const uvs = buildBoxUVs({ u: 40, v: 16, w: 4, h: 6, d: 4, texW: 64, texH: 64 });
    capFace(uvs, 3, 46, 25, 64, 64);
    const bottom = uvs.slice(24, 32);
    const x = (46.5) / 64;
    const y = 1 - 25.5 / 64;
    for (let i = 0; i < 4; i += 1) {
      assert.ok(Math.abs(bottom[i * 2] - x) < 1e-6);
      assert.ok(Math.abs(bottom[i * 2 + 1] - y) < 1e-6);
    }
  });
});
