import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POSES } from "../lib/poses.ts";
import { ARM, LEG, SIT_DROP, SKIN_LIFT, isSitting, measureSide } from "../lib/rig/layout.ts";

const HEAD = { minX: -4, maxX: 4, minY: SKIN_LIFT, maxY: SKIN_LIFT + 8, minZ: -4, maxZ: 4 };

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe("noon skeleton", () => {
  it("hangs a wide arm from the torso's top corner", () => {
    const arm = measureSide("default", "right", POSES[0].joints);
    assert.ok(Math.abs(arm.shoulder.x - -ARM.shoulderX) < 1e-6);
    assert.ok(Math.abs(arm.shoulder.y - (SKIN_LIFT + ARM.shoulderY)) < 1e-6);
    assert.ok(Math.abs(arm.shoulder.z) < 1e-6);
    const slim = measureSide("slim", "left", POSES[0].joints);
    assert.ok(Math.abs(slim.shoulder.x - ARM.shoulderX) < 1e-6);
  });

  it("keeps the hip on the bottom of the torso", () => {
    const leg = measureSide("default", "right", POSES[0].joints);
    assert.ok(Math.abs(leg.hip.x - -LEG.hipX) < 1e-6);
    assert.ok(Math.abs(leg.hip.y - (SKIN_LIFT + LEG.hipY)) < 1e-6);
    assert.ok(Math.abs(leg.hip.z - LEG.hipZ) < 1e-6);
  });

  it("keeps every preset's segments joined and the shoulder planted", () => {
    const standingShoulder = measureSide("default", "right", POSES[0].joints).shoulder;
    const upperReach = Math.hypot(1, Math.abs(ARM.elbowY));
    for (const preset of POSES) {
      for (const side of ["right", "left"] as const) {
        const points = measureSide("default", side, preset.joints);
        assert.ok(Math.abs(dist(points.shoulder, points.elbow) - upperReach) < 1e-6, `${preset.id} ${side} upper arm`);
        assert.ok(Math.abs(dist(points.elbow, points.wrist) - ARM.lowerH) < 1e-6, `${preset.id} ${side} forearm`);
        assert.ok(Math.abs(dist(points.hip, points.knee) - Math.abs(LEG.kneeY)) < 1e-6, `${preset.id} ${side} thigh`);
        assert.ok(Math.abs(dist(points.knee, points.ankle) - LEG.height) < 1e-6, `${preset.id} ${side} shin`);
        const drop = isSitting(preset.joints) ? SIT_DROP : 0;
        assert.ok(Math.abs(points.shoulder.y - (standingShoulder.y + drop)) < 1e-6, `${preset.id} shoulder height`);
        assert.ok(Math.abs(points.hip.y - (SKIN_LIFT + LEG.hipY + drop)) < 1e-6, `${preset.id} hip stays on the torso`);
        if (preset.id === "idle") {
          assert.ok(Math.abs(points.ankle.y - -15.65) < 0.02, `${preset.id} feet`);
          const inside =
            points.wrist.x > HEAD.minX &&
            points.wrist.x < HEAD.maxX &&
            points.wrist.y > HEAD.minY &&
            points.wrist.y < HEAD.maxY &&
            points.wrist.z > HEAD.minZ &&
            points.wrist.z < HEAD.maxZ;
          assert.equal(inside, false, `${preset.id} ${side} wrist inside the head`);
        }
      }
    }
  });
});
