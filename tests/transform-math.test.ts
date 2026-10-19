import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAxisRotation, closestLineT, gizmoTransform, movePivot, snap, snapActive } from "../lib/transform-math.ts";

describe("transform snap", () => {
  it("snaps position and rotation, and ctrl flips the toggle", () => {
    assert.equal(snap(1.6, 1, true), 2);
    assert.equal(snap(1.2, 0.25, true), 1.25);
    assert.equal(snap(22, 15, true), 15);
    assert.equal(snap(23, 15, true), 30);
    assert.equal(applyAxisRotation({ x: 0, y: 0, z: 0 }, "y", 22, "local", true, false).y, 15);
    assert.equal(applyAxisRotation({ x: 0, y: 0, z: 0 }, "y", 23, "local", true, false).y, 30);
    assert.equal(snapActive(true, true), false);
    assert.equal(snapActive(false, true), true);
    assert.equal(snapActive(true, false), true);
  });

  it("moves along local +X after a 90 degree yaw", () => {
    const next = gizmoTransform(
      { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      { kind: "translate", axis: "x", space: "local", snap: false, fine: false, distance: 4, degrees: 0, factor: 1, delta: { x: 0, y: 0, z: 0 } },
    );
    assert.equal(next.position.x, 0);
    assert.equal(next.position.z, -4);
  });

  it("shifts position when the pivot moves", () => {
    const moved = movePivot({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 0, z: 0 });
    assert.deepEqual(moved.pivot, { x: 2, y: 0, z: 0 });
    assert.deepEqual(moved.position, { x: 2, y: 0, z: 0 });
  });

  it("finds the closest point on an axis to a ray", () => {
    const t = closestLineT({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 5, y: 10, z: 0 }, { x: 0, y: -1, z: 0 });
    assert.equal(t, 5);
  });
});
