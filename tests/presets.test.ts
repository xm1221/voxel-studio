import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POSES } from "../lib/poses.ts";
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
