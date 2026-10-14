import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { poseById } from "../lib/poses.ts";
import { FOOT_Y, OVERLAP, planLimbs, plantedFootY, rotateX, seatShift, sitAmount } from "../lib/rig/layout.ts";

describe("limb layout", () => {
  it("keeps a wide arm 12 pixels long and hinged on the back of the elbow", () => {
    const arm = planLimbs("default").find((plan) => plan.id === "rightArm");
    assert.ok(arm);
    assert.deepEqual(arm.pivot, [-4, 0, 0]);
    assert.equal(arm.upper.center[0], -2);
    assert.equal(arm.upper.size[0], 4);
    const top = arm.upper.center[1] + arm.upper.size[1] / 2;
    assert.ok(Math.abs(top) < 1e-6);
    assert.deepEqual(arm.joint, [-2, -6, -2]);
    const back = arm.lower.center[2] - arm.lower.size[2] / 2;
    assert.ok(Math.abs(back) < 1e-6, "lower arm back face sits on the hinge");
    const overlap = arm.lower.center[1] + arm.lower.size[1] / 2;
    assert.ok(Math.abs(overlap - OVERLAP) < 1e-6);
    const sole = arm.joint[1] + arm.lower.center[1] - arm.lower.size[1] / 2;
    assert.ok(Math.abs(sole - -12) < 1e-6);
  });

  it("uses a 3 pixel arm for slim skins and mirrors the left shoulder", () => {
    const limbs = planLimbs("slim");
    const right = limbs.find((plan) => plan.id === "rightArm");
    const left = limbs.find((plan) => plan.id === "leftArm");
    assert.equal(right?.upper.size[0], 3);
    assert.equal(right?.pivot[0], -4);
    assert.equal(right?.upper.center[0], -1.5);
    assert.equal(left?.pivot[0], 4);
    assert.equal(left?.upper.center[0], 1.5);
    assert.equal(left?.uv.w, 3);
    assert.equal(left?.overlay.u, 48);
  });

  it("hinges the knee on the front of the leg", () => {
    const leg = planLimbs("default").find((plan) => plan.id === "rightLeg");
    assert.ok(leg);
    assert.equal(leg.hingeSign, 1);
    assert.equal(leg.joint[2], 2);
    const front = leg.lower.center[2] + leg.lower.size[2] / 2;
    assert.ok(Math.abs(front) < 1e-6);
    assert.equal(leg.pivot[1], -12);
  });
});

describe("sitting", () => {
  it("does not drop a standing or walking pose", () => {
    assert.equal(sitAmount(poseById("idle").joints), 0);
    assert.deepEqual(seatShift(poseById("walk").joints), { y: 0, hipForward: 0, amount: 0 });
  });

  it("plants both soles on the floor and keeps the thighs in front of the belly", () => {
    const joints = poseById("sit").joints;
    const shift = seatShift(joints);
    assert.equal(shift.amount, 1);
    const leg = planLimbs("default").find((plan) => plan.id === "rightLeg");
    assert.ok(leg);
    const lowest = plantedFootY(leg, joints.rLegX, joints.rKnee);
    assert.ok(Math.abs(lowest + shift.y - FOOT_Y) < 1e-6);

    const [, height, depth] = leg.upper.size;
    const [, cy, cz] = leg.upper.center;
    for (const y of [-height / 2, height / 2]) {
      for (const z of [-depth / 2, depth / 2]) {
        const [pitchedY, pitchedZ] = rotateX(cy + y, cz + z, joints.rLegX);
        if (pitchedY <= 0.05) continue;
        const worldZ = leg.pivot[2] + shift.hipForward + pitchedZ;
        assert.ok(worldZ > 2, `thigh corner rises into the belly at z=${worldZ}`);
      }
    }
  });
});
