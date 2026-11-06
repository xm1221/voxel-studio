import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAnimationDocument } from "../lib/motion.ts";
import { poseById } from "../lib/poses.ts";
import {
  addKeyframe,
  animationFromPose,
  applyPosePresetToKeyframe,
  channelValue,
  duplicateKeyframe,
  followPose,
  mirrorKeyframe,
  moveKeyframe,
  removeKeyframe,
  setDuration,
  syncLoopEndpoints,
  waveStarter,
  writeEase,
  writeJoint,
  writeYaw,
} from "../lib/timeline.ts";

const rest = poseById("idle").joints;

describe("timeline edits stay on animation JSON v1", () => {
  it("builds a looping pose hold and a wave whose ends match", () => {
    const held = animationFromPose("Hold", rest, 1.6);
    assert.equal(parseAnimationDocument(held).ok, true);
    assert.equal(held.keyframes[0].time, 0);
    assert.equal(held.keyframes[1].time, 1.6);
    assert.deepEqual(held.keyframes[0].joints, held.keyframes[1].joints);

    const wave = waveStarter("Wave", rest);
    assert.equal(parseAnimationDocument(wave).ok, true);
    assert.equal(wave.keyframes[1].joints.rArmZ, -150);
    assert.equal(wave.keyframes[0].joints.rArmZ, wave.keyframes[2].joints.rArmZ);
    assert.equal(wave.keyframes[1].cape, 6);
    assert.equal(wave.v, 1);
  });

  it("inserts, moves, and refuses to delete the last key", () => {
    const held = animationFromPose("Hold", rest, 2);
    const added = addKeyframe(held, 1, { headY: 20 });
    assert.equal(added.ok, true);
    if (!added.ok) return;
    assert.equal(added.index, 1);
    assert.equal(added.animation.keyframes[1].joints.headY, 20);
    assert.equal(parseAnimationDocument(added.animation).ok, true);

    const crowded = addKeyframe(added.animation, 1.01, { headY: 0 });
    assert.equal(crowded.ok, false);

    const moved = moveKeyframe(added.animation, 1, 1.4);
    assert.equal(moved.ok, true);
    if (!moved.ok) return;
    assert.equal(moved.animation.keyframes[1].time, 1.4);

    const blocked = moveKeyframe(moved.animation, 1, 0);
    assert.equal(blocked.ok, true);
    if (!blocked.ok) return;
    assert.ok(blocked.animation.keyframes[1].time > blocked.animation.keyframes[0].time);

    let current = moved.animation;
    while (current.keyframes.length > 1) {
      const removed = removeKeyframe(current, current.keyframes.length - 1);
      assert.equal(removed.ok, true);
      if (!removed.ok) return;
      current = removed.animation;
    }
    const last = removeKeyframe(current, 0);
    assert.equal(last.ok, false);
    if (last.ok) return;
    assert.match(last.error, /err\.animLast/);
  });

  it("scales duration and can clear a joint so it follows the sliders", () => {
    const wave = waveStarter("Wave", rest);
    const longer = setDuration(wave, 3.2);
    assert.equal(longer.ok, true);
    if (!longer.ok) return;
    assert.equal(longer.animation.duration, 3.2);
    assert.equal(longer.animation.keyframes[1].time, 1.6);
    assert.equal(longer.animation.keyframes[2].time, 3.2);
    assert.equal(parseAnimationDocument(longer.animation).ok, true);

    const cleared = followPose(wave, 1);
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.deepEqual(cleared.animation.keyframes[1].joints, {});

    const armed = writeJoint(wave, 1, "rArmZ", -999);
    assert.equal(armed.ok, true);
    if (!armed.ok) return;
    assert.equal(armed.animation.keyframes[1].joints.rArmZ, -180);
  });
});

describe("timeline ease and body turn", () => {
  it("writes and clears easing without touching the joints", () => {
    const wave = waveStarter("Wave", rest);
    const eased = writeEase(wave, 1, "linear");
    assert.equal(eased.ok, true);
    if (!eased.ok) return;
    assert.equal(eased.animation.keyframes[1].ease, "linear");
    assert.deepEqual(eased.animation.keyframes[1].joints, wave.keyframes[1].joints);
    assert.equal(parseAnimationDocument(eased.animation).ok, true);

    const cleared = writeEase(eased.animation, 1, null);
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal("ease" in cleared.animation.keyframes[1], false);
    assert.equal(parseAnimationDocument(cleared.animation).ok, true);

    // Writing the default leaves the file byte-identical to a v1 export.
    const stepped = writeEase(wave, 1, "smoothstep");
    assert.equal(stepped.ok, true);
    if (!stepped.ok) return;
    assert.equal("ease" in stepped.animation.keyframes[1], false);
    assert.deepEqual(stepped.animation, wave);
  });

  it("writes body turn in degrees, clamps it, and drops zero", () => {
    const wave = waveStarter("Wave", rest);
    const turned = writeYaw(wave, 1, 90);
    assert.equal(turned.ok, true);
    if (!turned.ok) return;
    assert.equal(turned.animation.keyframes[1].yaw, 90);
    assert.equal(channelValue(turned.animation.keyframes[1], "yaw", rest), 90);
    assert.equal(parseAnimationDocument(turned.animation).ok, true);

    const spun = writeYaw(wave, 1, 9000);
    assert.equal(spun.ok, true);
    if (!spun.ok) return;
    assert.equal(spun.animation.keyframes[1].yaw, 720);

    const reset = writeYaw(turned.animation, 1, 0);
    assert.equal(reset.ok, true);
    if (!reset.ok) return;
    assert.equal("yaw" in reset.animation.keyframes[1], false);
    assert.equal(channelValue(reset.animation.keyframes[1], "yaw", rest), 0);
  });
});

describe("timeline keyframe operations", () => {
  it("duplicates a keyframe at an offset time", () => {
    const wave = waveStarter("Wave", rest);
    const duplicated = duplicateKeyframe(wave, 1);
    assert.equal(duplicated.ok, true);
    if (!duplicated.ok) return;
    assert.equal(duplicated.animation.keyframes.length, wave.keyframes.length + 1);
    assert.equal(parseAnimationDocument(duplicated.animation).ok, true);
  });

  it("mirrors a keyframe's joints and sway/roll/yaw", () => {
    const wave = waveStarter("Wave", rest);
    const turned = writeYaw(wave, 1, 45);
    assert.equal(turned.ok, true);
    if (!turned.ok) return;
    const mirrored = mirrorKeyframe(turned.animation, 1, rest);
    assert.equal(mirrored.ok, true);
    if (!mirrored.ok) return;
    assert.equal(mirrored.animation.keyframes[1].yaw, -45);
    assert.equal(parseAnimationDocument(mirrored.animation).ok, true);
  });

  it("syncs loop endpoints from frame 0 to end duration", () => {
    const wave = waveStarter("Wave", rest);
    const modified = writeJoint(wave, 0, "rArmZ", -45);
    assert.equal(modified.ok, true);
    if (!modified.ok) return;
    const synced = syncLoopEndpoints(modified.animation);
    assert.equal(synced.ok, true);
    if (!synced.ok) return;
    const first = synced.animation.keyframes[0];
    const last = synced.animation.keyframes[synced.animation.keyframes.length - 1];
    assert.equal(last.time, synced.animation.duration);
    assert.deepEqual(last.joints, first.joints);
    assert.equal(parseAnimationDocument(synced.animation).ok, true);
  });

  it("applies preset pose to a keyframe", () => {
    const wave = waveStarter("Wave", rest);
    const swordPose = poseById("guard");
    const applied = applyPosePresetToKeyframe(wave, 1, swordPose.joints);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.animation.keyframes[1].joints.rArmX, swordPose.joints.rArmX);
    assert.equal(parseAnimationDocument(applied.animation).ok, true);
  });
});
