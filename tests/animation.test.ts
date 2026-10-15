import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  animationDownloadName,
  animationForClip,
  clipCycle,
  clipExportSpanForPlayers,
  MAX_ANIMATION_TEXT_LENGTH,
  parseAnimationDocument,
  parseAnimationText,
  sampleAnimation,
  sampleClip,
} from "../lib/motion.ts";
import { poseById } from "../lib/poses.ts";
import { JOINT_LIMITS } from "../lib/presets.ts";
import type { AnimationDef, Joints } from "../lib/types.ts";

const rest = poseById("idle").joints;

const readmeExample = {
  v: 1,
  name: "Wave",
  duration: 1.6,
  loop: true,
  keyframes: [
    { time: 0, joints: { rArmZ: -20, rElbow: -10 } },
    { time: 0.8, joints: { rArmZ: -150, rElbow: -70 }, cape: 6 },
    { time: 1.6, joints: { rArmZ: -20, rElbow: -10 } },
  ],
};

function mustParse(value: unknown): AnimationDef {
  const parsed = parseAnimationDocument(value);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.animation;
}

describe("animation JSON", () => {
  it("accepts the README example and fills omitted scalars with zero", () => {
    const animation = mustParse(readmeExample);
    assert.equal(animation.keyframes[0].bob, 0);
    assert.equal(animation.keyframes[0].sway, 0);
    assert.equal(animation.keyframes[0].roll, 0);
    assert.equal(animation.keyframes[0].cape, 0);
    assert.equal(animation.keyframes[1].cape, 6);
    assert.equal(animation.keyframes[0].joints.rArmZ, -20);
    assert.equal(animation.keyframes[0].joints.headX, undefined);
  });

  it("round-trips every built-in clip, including the run cycle that passes the hip slider", () => {
    let livePeak = 0;
    const duration = clipCycle("run");
    for (let step = 0; step <= 32; step += 1) {
      const sampled = sampleClip("run", (step / 32) * duration, rest);
      livePeak = Math.max(livePeak, sampled.joints.lLegX, sampled.joints.rLegX);
    }
    assert.ok(livePeak > JOINT_LIMITS.lLegX.max);

    for (const id of ["none", "idle", "walk", "run", "wave", "cheer"] as const) {
      const exported = animationForClip(id);
      const parsed = parseAnimationDocument(JSON.parse(JSON.stringify(exported)) as unknown);
      assert.equal(parsed.ok, true, parsed.ok ? "" : `${id} ${parsed.error}`);
      if (!parsed.ok) continue;
      assert.deepEqual(parsed.animation, exported);
      assert.equal(exported.keyframes.length, id === "none" ? 1 : 33);
      for (const frame of exported.keyframes) {
        for (const key of Object.keys(frame.joints) as (keyof Joints)[]) {
          const value = frame.joints[key];
          assert.equal(typeof value, "number");
          if (typeof value !== "number") continue;
          assert.ok(value >= JOINT_LIMITS[key].min && value <= JOINT_LIMITS[key].max, `${id} ${key} ${value}`);
        }
      }
    }
  });

  it("rejects unknown fields, prototype keys, and values outside the schema", () => {
    const base = {
      v: 1,
      name: "Wave",
      duration: 1,
      loop: false,
      keyframes: [{ time: 0, joints: { headX: 10 } }],
    };
    assert.equal(parseAnimationDocument({ ...base, note: "nope" }).ok, false);
    assert.equal(parseAnimationDocument({ ...base, v: 2 }).ok, false);
    assert.equal(parseAnimationDocument({ ...base, v: "1" }).ok, false);
    assert.equal(parseAnimationDocument({ ...base, name: "  " }).ok, false);
    assert.equal(parseAnimationDocument({ ...base, name: "a".repeat(49) }).ok, false);
    assert.equal(parseAnimationDocument({ ...base, duration: 0.1 }).ok, false);
    assert.equal(parseAnimationDocument({ ...base, duration: 30.1 }).ok, false);
    assert.equal(parseAnimationDocument({ ...base, loop: 1 }).ok, false);
    assert.equal(parseAnimationDocument({ ...base, keyframes: [] }).ok, false);
    assert.equal(parseAnimationDocument("nope").ok, false);
    assert.equal(parseAnimationDocument(null).ok, false);

    const late = parseAnimationDocument({
      ...base,
      keyframes: [
        { time: 0, joints: {} },
        { time: 0, joints: {} },
      ],
    });
    assert.equal(late.ok, false);
    const backwards = parseAnimationDocument({
      ...base,
      keyframes: [
        { time: 0.4, joints: {} },
        { time: 0.2, joints: {} },
      ],
    });
    assert.equal(backwards.ok, false);
    const pastEnd = parseAnimationDocument({
      ...base,
      keyframes: [{ time: 1.1, joints: {} }],
    });
    assert.equal(pastEnd.ok, false);
    const wide = parseAnimationDocument({
      ...base,
      keyframes: [{ time: 0, joints: { lLegX: 72 } }],
    });
    assert.equal(wide.ok, false);
    const extraFrame = parseAnimationDocument({
      ...base,
      keyframes: [{ time: 0, joints: {}, ease: "linear" }],
    });
    assert.equal(extraFrame.ok, false);

    const constructorJoint = JSON.parse(
      '{"v":1,"name":"X","duration":1,"loop":false,"keyframes":[{"time":0,"joints":{"constructor":1}}]}',
    ) as unknown;
    assert.equal(parseAnimationDocument(constructorJoint).ok, false);
    const protoJoint = JSON.parse(
      '{"v":1,"name":"X","duration":1,"loop":false,"keyframes":[{"time":0,"joints":{"__proto__":1,"headX":10}}]}',
    ) as unknown;
    assert.equal(parseAnimationDocument(protoJoint).ok, false);
    assert.equal(Object.prototype.hasOwnProperty.call({}, "polluted"), false);

    const many = Array.from({ length: 241 }, (_, index) => ({ time: index / 100, joints: {} }));
    assert.equal(parseAnimationDocument({ ...base, duration: 3, keyframes: many }).ok, false);
  });

  it("sizes a GIF from the custom animation duration", () => {
    const span = clipExportSpanForPlayers([
      { clip: "custom", clipSpeed: 2, customAnimation: mustParse(readmeExample) },
    ]);
    assert.equal(span.seconds, 0.8);
    assert.ok(span.frames >= 12 && span.frames <= 28);
  });

  it("rejects oversized text before parsing and names downloads", () => {
    assert.equal(parseAnimationText("{").ok, false);
    const huge = parseAnimationText(`{${" ".repeat(MAX_ANIMATION_TEXT_LENGTH)}}`);
    assert.equal(huge.ok, false);
    if (!huge.ok) assert.equal(huge.error, "err.animSize");
    assert.equal(animationDownloadName("Wave"), "pixelstage-wave.json");
    assert.equal(animationDownloadName("行走"), "pixelstage-animation.json");
    assert.equal(animationDownloadName("---"), "pixelstage-animation.json");
  });

  it("samples holds, smoothstep, partial joints, and a seamless loop without NaN", () => {
    const held = mustParse({
      v: 1,
      name: "Hold",
      duration: 1,
      loop: false,
      keyframes: [
        { time: 0, joints: { headX: 0 }, bob: 0 },
        { time: 1, joints: { headX: 40 }, bob: 8 },
      ],
    });
    assert.equal(sampleAnimation(held, -2, rest).bob, 0);
    assert.equal(sampleAnimation(held, 2, rest).bob, 8);
    assert.equal(sampleAnimation(held, 0.5, rest).bob, 4);
    assert.equal(sampleAnimation(held, 0.5, rest).joints.headX, 20);

    const partial = mustParse({
      v: 1,
      name: "Partial",
      duration: 1,
      loop: false,
      keyframes: [
        { time: 0, joints: { headX: 20 } },
        { time: 1, joints: {} },
      ],
    });
    const pose = { ...rest, headX: 0 };
    assert.equal(sampleAnimation(partial, 0, pose).joints.headX, 20);
    assert.equal(sampleAnimation(partial, 1, pose).joints.headX, 0);
    assert.equal(sampleAnimation(partial, 0.5, pose).joints.headX, 10);

    const single = mustParse({
      v: 1,
      name: "Still",
      duration: 1,
      loop: true,
      keyframes: [{ time: 0.2, joints: { headY: 15 }, bob: 1, sway: 0, roll: 0, cape: 0 }],
    });
    assert.equal(sampleAnimation(single, 4.2, rest).joints.headY, 15);
    assert.equal(sampleAnimation(single, 4.2, rest).bob, 1);

    const looped = mustParse(readmeExample);
    const start = sampleAnimation(looped, 0, rest);
    const wrapped = sampleAnimation(looped, 1.6, rest);
    assert.equal(start.joints.rArmZ, -20);
    assert.equal(wrapped.joints.rArmZ, -20);
    assert.equal(Number.isFinite(sampleAnimation(looped, 0.8, rest).joints.rArmZ), true);
    assert.equal(sampleAnimation(looped, 0.8, rest).cape, 6);

    const open = mustParse({
      v: 1,
      name: "Open",
      duration: 1,
      loop: true,
      keyframes: [
        { time: 0.25, joints: { headX: 0 } },
        { time: 0.75, joints: { headX: 40 } },
      ],
    });
    assert.equal(sampleAnimation(open, 0, rest).joints.headX, 20);
    for (const time of [0, 0.1, 0.5, 0.9, 1, 2.2]) {
      const sample = sampleAnimation(open, time, rest);
      assert.equal(Number.isFinite(sample.joints.headX), true);
      assert.equal(Number.isFinite(sample.bob), true);
    }
  });
});
