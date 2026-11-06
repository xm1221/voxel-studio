import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mirrorJoints, POSES, type PoseCategory } from "../lib/poses.ts";
import { CLIPS } from "../lib/motion.ts";
import { JOINT_LIMITS, mergePresets, parsePresetDocument, presetDocument } from "../lib/presets.ts";
import type { Joints } from "../lib/types.ts";

const joints: Joints = { ...POSES[0].joints };

describe("user presets", () => {
  it("keeps every built-in pose inside the slider limits", () => {
    for (const pose of POSES) {
      for (const key of Object.keys(JOINT_LIMITS) as (keyof Joints)[]) {
        const value = pose.joints[key];
        const limit = JOINT_LIMITS[key];
        assert.ok(value >= limit.min && value <= limit.max, `${pose.id} ${key}`);
      }
    }
  });

  it("accepts a document, a list, or one pose", () => {
    const preset = { id: "wave_1", name: "举手", joints };
    const document = parsePresetDocument(presetDocument([preset]));
    assert.equal(document.ok, true);
    if (!document.ok) return;
    assert.equal(document.presets[0].name, "举手");
    const list = parsePresetDocument([preset]);
    assert.equal(list.ok, true);
    const single = parsePresetDocument({ name: "单手", joints, look: { light: "moon", keyIntensity: 1.2 }, camera: { p: [1, 2, 3], t: [0, 1, 0] } });
    assert.equal(single.ok, true);
    if (!single.ok) return;
    assert.equal(single.presets[0].look?.light, "moon");
    assert.deepEqual(single.presets[0].camera?.p, [1, 2, 3]);
  });

  it("rejects a bad joint, name, light, or camera", () => {
    assert.equal(parsePresetDocument({ v: 1, presets: [{ name: "坏", joints: { ...joints, rElbow: -400 } }] }).ok, false);
    assert.equal(parsePresetDocument({ v: 1, presets: [{ name: "", joints }] }).ok, false);
    assert.equal(parsePresetDocument({ v: 1, presets: [{ name: "灯", joints, look: { light: "noon" } }] }).ok, false);
    assert.equal(parsePresetDocument({ v: 1, presets: [{ name: "机位", joints, camera: { p: [1, 2], t: [0, 0, 0] } }] }).ok, false);
    assert.equal(parsePresetDocument({ v: 2, presets: [] }).ok, false);
    assert.equal(parsePresetDocument("nope").ok, false);
  });

  it("stops at 40 and renames a colliding id", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `u_${index}`, name: `姿势${index}`, joints }));
    assert.equal(parsePresetDocument({ v: 1, presets: many }).ok, true);
    assert.equal(parsePresetDocument({ v: 1, presets: [...many, { id: "u_extra", name: "多", joints }] }).ok, false);
    const merged = mergePresets([{ id: "u_1", name: "已有", joints }], [{ id: "u_1", name: "新的", joints }]);
    assert.equal(merged.ok, true);
    if (!merged.ok) return;
    assert.equal(merged.presets.length, 2);
    assert.notEqual(merged.presets[0].id, merged.presets[1].id);
    const full = mergePresets(many, [{ id: "u_new", name: "再来", joints }]);
    assert.equal(full.ok, false);
  });
});

describe("built-in poses and mirror", () => {
  it("has at least 20 categorized poses", () => {
    assert.ok(POSES.length >= 20);
    const categories: PoseCategory[] = ["daily", "combat", "adventure", "poster"];
    for (const pose of POSES) {
      assert.ok(categories.includes(pose.category), `${pose.id} has invalid category ${pose.category}`);
      if (pose.recommendedClip) {
        assert.ok(CLIPS.some((c) => c.id === pose.recommendedClip), `${pose.id} has invalid recommendedClip ${pose.recommendedClip}`);
      }
    }
  });

  it("mirrors joints symmetrically and stays within slider limits", () => {
    for (const pose of POSES) {
      const mirrored = mirrorJoints(pose.joints);
      for (const key of Object.keys(JOINT_LIMITS) as (keyof Joints)[]) {
        const value = mirrored[key];
        const limit = JOINT_LIMITS[key];
        assert.ok(value >= limit.min && value <= limit.max, `mirrored ${pose.id} ${key} (${value}) out of bounds`);
      }
      const doubleMirrored = mirrorJoints(mirrored);
      assert.deepEqual(doubleMirrored, pose.joints, `double mirror did not restore ${pose.id}`);
    }
  });

  it("mirrorJoints correctly swaps and negates specific joints", () => {
    const testJoints: Joints = {
      headX: 10,
      headY: 20,
      bodyX: 5,
      rArmX: 30,
      rArmZ: -40,
      rElbow: -50,
      lArmX: 15,
      lArmZ: 25,
      lElbow: -35,
      rLegX: -20,
      rKnee: 45,
      lLegX: 10,
      lKnee: 15,
    };
    const m = mirrorJoints(testJoints);
    assert.equal(m.headX, 10);
    assert.equal(m.headY, -20);
    assert.equal(m.bodyX, 5);
    assert.equal(m.rArmX, 15);
    assert.equal(m.rArmZ, -25);
    assert.equal(m.rElbow, -35);
    assert.equal(m.lArmX, 30);
    assert.equal(m.lArmZ, 40);
    assert.equal(m.lElbow, -50);
    assert.equal(m.rLegX, 10);
    assert.equal(m.rKnee, 15);
    assert.equal(m.lLegX, -20);
    assert.equal(m.lKnee, 45);
  });
});

