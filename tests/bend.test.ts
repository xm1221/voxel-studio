import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BufferAttribute, BufferGeometry } from "three";
import { BEND_BLEND, bendWeight, createBentBox, deformBend } from "../lib/rig/bend.ts";
import { ARM } from "../lib/rig/layout.ts";

describe("bendy limb", () => {
  it("keeps the limb straight above the joint and fully bent below it", () => {
    assert.equal(bendWeight(10, 0), 0);
    assert.equal(bendWeight(-10, 0), 1);
    assert.equal(bendWeight(BEND_BLEND, 0), 0);
    assert.equal(bendWeight(-BEND_BLEND, 0), 1);
    assert.equal(bendWeight(0, 0), 0.5);
  });

  it("folds a negative elbow toward the camera and leaves the shoulder end put", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([0, -6, 0, 0, 6, 0]), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 3));
    geometry.setAttribute("rest", geometry.getAttribute("position").clone());
    geometry.setAttribute("restNormal", geometry.getAttribute("normal").clone());
    deformBend(geometry, 0, -Math.PI / 2);
    const position = geometry.getAttribute("position");
    assert.ok(Math.abs(position.getY(0)) < 1e-6);
    assert.ok(Math.abs(position.getZ(0) - 6) < 1e-6);
    assert.ok(Math.abs(position.getY(1) - 6) < 1e-6);
    assert.ok(Math.abs(position.getZ(1)) < 1e-6);
    const normal = geometry.getAttribute("normal");
    assert.ok(Math.abs(normal.getY(0) - 1) < 1e-6);
    assert.ok(Math.abs(normal.getZ(0)) < 1e-6);
  });

  it("spans the noon arm and bends only the forearm", () => {
    const top = ARM.upperY + ARM.upperH / 2;
    const bottom = ARM.elbowY + ARM.lowerY - ARM.lowerH / 2;
    const geometry = createBentBox(4, 4, top, bottom, { u: 40, v: 16, w: 4, h: 12, d: 4, texW: 64, texH: 64 });
    const rest = geometry.getAttribute("rest");
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < rest.count; i += 1) {
      minY = Math.min(minY, rest.getY(i));
      maxY = Math.max(maxY, rest.getY(i));
    }
    assert.ok(Math.abs(maxY - top) < 1e-4);
    assert.ok(Math.abs(minY - bottom) < 1e-4);
    deformBend(geometry, ARM.elbowY, -Math.PI / 2);
    const position = geometry.getAttribute("position");
    let shoulder = 0;
    let wrist = 0;
    for (let i = 0; i < rest.count; i += 1) {
      if (Math.abs(rest.getY(i) - top) < 1e-4) shoulder = i;
      if (Math.abs(rest.getY(i) - bottom) < 1e-4) wrist = i;
    }
    assert.ok(Math.abs(position.getZ(shoulder) - rest.getZ(shoulder)) < 1e-4);
    assert.ok(position.getZ(wrist) > rest.getZ(wrist) + 4);
  });

  it("maps an oversized shell inside the overlay rect", () => {
    const geometry = createBentBox(4.5, 4.5, 2.2, -9.85, { u: 40, v: 32, w: 4, h: 12, d: 4, texW: 64, texH: 64 });
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i += 1) {
      const texX = uv.getX(i) * 64;
      const texY = (1 - uv.getY(i)) * 64;
      assert.ok(texX > 40 && texX < 56, `texX ${texX}`);
      assert.ok(texY > 32 && texY < 48, `texY ${texY}`);
    }
  });
});
