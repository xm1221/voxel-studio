import { code } from "./i18n.ts";
import { isEaseId, parseAnimationDocument } from "./motion.ts";
import { mirrorJoints } from "./poses.ts";
import { JOINT_LIMITS } from "./presets.ts";
import type { AnimationDef, AnimationKeyframe, EaseId, Joints } from "./types";

const JOINT_KEYS = Object.keys(JOINT_LIMITS) as (keyof Joints)[];
const MIN_GAP = 0.02;
const MIN_DURATION = 0.2;
const MAX_DURATION = 30;
const MAX_FRAMES = 240;

const SCALAR_LIMITS = {
  bob: { min: -8, max: 8 },
  sway: { min: -5, max: 5 },
  roll: { min: -5, max: 5 },
  cape: { min: -45, max: 45 },
  /** Body turn in degrees. Absent means 0, so v1 files keep their output. */
  yaw: { min: -720, max: 720 },
} as const;

export type ScalarKey = keyof typeof SCALAR_LIMITS;
export type CurveChannel = keyof Joints | ScalarKey;

export const CURVE_CHANNELS: CurveChannel[] = [...JOINT_KEYS, "bob", "sway", "roll", "cape", "yaw"];

export type EditResult = { ok: true; animation: AnimationDef; index: number } | { ok: false; error: string };

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
  const next = Math.min(max, Math.max(min, value));
  return next === 0 ? 0 : next;
}

function clone(animation: AnimationDef): AnimationDef {
  return {
    v: 1,
    name: animation.name,
    duration: animation.duration,
    loop: animation.loop,
    keyframes: animation.keyframes.map((frame) => ({
      time: frame.time,
      joints: { ...frame.joints },
      bob: frame.bob,
      sway: frame.sway,
      roll: frame.roll,
      cape: frame.cape,
      ...(frame.ease ? { ease: frame.ease } : {}),
      ...(frame.yaw ? { yaw: frame.yaw } : {}),
    })),
  };
}

function finish(animation: AnimationDef, index: number): EditResult {
  const parsed = parseAnimationDocument(animation);
  if (!parsed.ok) return parsed;
  const nextIndex = Math.max(0, Math.min(parsed.animation.keyframes.length - 1, index));
  return { ok: true, animation: parsed.animation, index: nextIndex };
}

function blankFrame(time: number, joints: Partial<Joints>): AnimationKeyframe {
  return { time, joints: { ...joints }, bob: 0, sway: 0, roll: 0, cape: 0 };
}

function poseJoints(rest: Joints): Partial<Joints> {
  const joints: Partial<Joints> = {};
  for (const key of JOINT_KEYS) {
    joints[key] = clamp(rest[key], JOINT_LIMITS[key].min, JOINT_LIMITS[key].max);
  }
  return joints;
}

/** Two identical keys so a loop holds the current pose. */
export function animationFromPose(name: string, rest: Joints, duration = 1.6): AnimationDef {
  const safeName = name.trim().slice(0, 48) || "Clip";
  const safeDuration = clamp(duration, MIN_DURATION, MAX_DURATION);
  const joints = poseJoints(rest);
  const animation = {
    v: 1 as const,
    name: safeName,
    duration: safeDuration,
    loop: true,
    keyframes: [blankFrame(0, joints), blankFrame(safeDuration, joints)],
  };
  const parsed = parseAnimationDocument(animation);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.animation;
}

/** A three-key wave on top of the current pose. First and last keys match. */
export function waveStarter(name: string, rest: Joints): AnimationDef {
  const joints = poseJoints(rest);
  const at = (time: number, rArmZ: number, rElbow: number, cape: number): AnimationKeyframe => ({
    time,
    joints: {
      ...joints,
      rArmZ: clamp(rArmZ, JOINT_LIMITS.rArmZ.min, JOINT_LIMITS.rArmZ.max),
      rElbow: clamp(rElbow, JOINT_LIMITS.rElbow.min, JOINT_LIMITS.rElbow.max),
    },
    bob: 0,
    sway: 0,
    roll: 0,
    cape,
  });
  const animation = {
    v: 1 as const,
    name: name.trim().slice(0, 48) || "Wave",
    duration: 1.6,
    loop: true,
    keyframes: [at(0, rest.rArmZ, rest.rElbow, 0), at(0.8, -150, -70, 6), at(1.6, rest.rArmZ, rest.rElbow, 0)],
  };
  const parsed = parseAnimationDocument(animation);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.animation;
}

export function renameAnimation(animation: AnimationDef, name: string): EditResult {
  const next = name.trim();
  if (!next || next.length > 48) return { ok: false, error: code("err.animName") };
  return finish({ ...clone(animation), name: next }, 0);
}

export function setLoop(animation: AnimationDef, loop: boolean): EditResult {
  return finish({ ...clone(animation), loop }, 0);
}

export function setDuration(animation: AnimationDef, duration: number): EditResult {
  if (typeof duration !== "number" || !Number.isFinite(duration)) return { ok: false, error: code("err.animDuration") };
  const nextDuration = roundTime(clamp(duration, MIN_DURATION, MAX_DURATION));
  const scale = nextDuration / animation.duration;
  const next = clone(animation);
  next.duration = nextDuration;
  next.keyframes.forEach((frame, index) => {
    frame.time = roundTime(frame.time * scale);
    if (index === 0) frame.time = Math.max(0, frame.time);
    if (index > 0 && frame.time <= next.keyframes[index - 1].time) {
      frame.time = roundTime(next.keyframes[index - 1].time + 0.001);
    }
  });
  const last = next.keyframes[next.keyframes.length - 1];
  if (last.time > nextDuration) last.time = nextDuration;
  return finish(next, 0);
}

function gapConflict(frames: AnimationKeyframe[], time: number, ignore: number) {
  return frames.some((frame, index) => index !== ignore && Math.abs(frame.time - time) < MIN_GAP);
}

export function addKeyframe(animation: AnimationDef, time: number, joints: Partial<Joints>): EditResult {
  if (animation.keyframes.length >= MAX_FRAMES) return { ok: false, error: code("err.animFrames") };
  const nextTime = roundTime(Math.min(animation.duration, Math.max(0, time)));
  if (gapConflict(animation.keyframes, nextTime, -1)) return { ok: false, error: code("err.animTime", { n: animation.keyframes.length + 1 }) };
  const next = clone(animation);
  const frame = blankFrame(nextTime, {});
  for (const key of JOINT_KEYS) {
    const value = joints[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    frame.joints[key] = clamp(value, JOINT_LIMITS[key].min, JOINT_LIMITS[key].max);
  }
  next.keyframes.push(frame);
  next.keyframes.sort((a, b) => a.time - b.time);
  const index = next.keyframes.findIndex((item) => item.time === nextTime);
  return finish(next, index === -1 ? next.keyframes.length - 1 : index);
}

export function moveKeyframe(animation: AnimationDef, index: number, time: number): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  let nextTime = roundTime(Math.min(animation.duration, Math.max(0, time)));
  const frames = animation.keyframes;
  const previous = index > 0 ? frames[index - 1].time + 0.001 : 0;
  const following = index < frames.length - 1 ? frames[index + 1].time - 0.001 : animation.duration;
  nextTime = roundTime(Math.min(following, Math.max(previous, nextTime)));
  if (nextTime <= (index > 0 ? frames[index - 1].time : -1) || nextTime >= (index < frames.length - 1 ? frames[index + 1].time : animation.duration + 1)) {
    return { ok: false, error: code("err.animTime", { n: index + 1 }) };
  }
  const next = clone(animation);
  next.keyframes[index].time = nextTime;
  return finish(next, index);
}

export function removeKeyframe(animation: AnimationDef, index: number): EditResult {
  if (animation.keyframes.length <= 1) return { ok: false, error: code("err.animLast") };
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  next.keyframes.splice(index, 1);
  return finish(next, Math.min(index, next.keyframes.length - 1));
}

export function writeJoint(animation: AnimationDef, index: number, key: keyof Joints, value: number | null): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  if (value === null) delete next.keyframes[index].joints[key];
  else next.keyframes[index].joints[key] = clamp(value, JOINT_LIMITS[key].min, JOINT_LIMITS[key].max);
  return finish(next, index);
}

export function writeScalar(animation: AnimationDef, index: number, key: ScalarKey, value: number): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const limit = SCALAR_LIMITS[key];
  const next = clone(animation);
  next.keyframes[index][key] = clamp(value, limit.min, limit.max);
  return finish(next, index);
}

/** Interpolation leaving this keyframe. `null` restores the v1 smoothstep. */
export function writeEase(animation: AnimationDef, index: number, ease: EaseId | null): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  // smoothstep is the v1 default, so writing it removes the field instead of
  // adding one. Files that predate easing stay byte-identical.
  if (ease && ease !== "smoothstep" && isEaseId(ease)) next.keyframes[index].ease = ease;
  else delete next.keyframes[index].ease;
  return finish(next, index);
}

/** Body turn in degrees for one keyframe. Zero removes the field, keeping old JSON identical. */
export function writeYaw(animation: AnimationDef, index: number, yaw: number): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  const value = clamp(yaw, SCALAR_LIMITS.yaw.min, SCALAR_LIMITS.yaw.max);
  if (value === 0) delete next.keyframes[index].yaw;
  else next.keyframes[index].yaw = value;
  return finish(next, index);
}

export function writePose(animation: AnimationDef, index: number, rest: Joints): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  next.keyframes[index].joints = poseJoints(rest);
  return finish(next, index);
}

export function followPose(animation: AnimationDef, index: number): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  next.keyframes[index].joints = {};
  return finish(next, index);
}

export function duplicateKeyframe(animation: AnimationDef, index: number): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  if (animation.keyframes.length >= MAX_FRAMES) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  const source = next.keyframes[index];
  let targetTime = roundTime(Math.min(next.duration, source.time + 0.2));
  if (targetTime === source.time && source.time > 0.2) {
    targetTime = roundTime(source.time - 0.2);
  }
  const copy: AnimationKeyframe = {
    time: targetTime,
    joints: { ...source.joints },
    bob: source.bob,
    sway: source.sway,
    roll: source.roll,
    cape: source.cape,
    ...(source.ease ? { ease: source.ease } : {}),
    ...(source.yaw ? { yaw: source.yaw } : {}),
  };
  next.keyframes.push(copy);
  next.keyframes.sort((a, b) => a.time - b.time);
  const newIndex = next.keyframes.indexOf(copy);
  return finish(next, newIndex);
}

export function mirrorKeyframe(animation: AnimationDef, index: number, rest: Joints): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  const frame = next.keyframes[index];
  const fullJoints: Joints = {
    headX: frame.joints.headX ?? rest.headX,
    headY: frame.joints.headY ?? rest.headY,
    bodyX: frame.joints.bodyX ?? rest.bodyX,
    rArmX: frame.joints.rArmX ?? rest.rArmX,
    rArmZ: frame.joints.rArmZ ?? rest.rArmZ,
    rElbow: frame.joints.rElbow ?? rest.rElbow,
    lArmX: frame.joints.lArmX ?? rest.lArmX,
    lArmZ: frame.joints.lArmZ ?? rest.lArmZ,
    lElbow: frame.joints.lElbow ?? rest.lElbow,
    rLegX: frame.joints.rLegX ?? rest.rLegX,
    rKnee: frame.joints.rKnee ?? rest.rKnee,
    lLegX: frame.joints.lLegX ?? rest.lLegX,
    lKnee: frame.joints.lKnee ?? rest.lKnee,
  };
  const mirrored = mirrorJoints(fullJoints);
  frame.joints = poseJoints(mirrored);
  frame.sway = -frame.sway;
  frame.roll = -frame.roll;
  if (frame.yaw) frame.yaw = -frame.yaw;
  return finish(next, index);
}

export function syncLoopEndpoints(animation: AnimationDef): EditResult {
  if (animation.keyframes.length === 0) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  const first = next.keyframes[0];
  const existingEndIndex = next.keyframes.findIndex((k) => Math.abs(k.time - next.duration) < 0.01);
  const endFrame: AnimationKeyframe = {
    time: next.duration,
    joints: { ...first.joints },
    bob: first.bob,
    sway: first.sway,
    roll: first.roll,
    cape: first.cape,
    ...(first.ease ? { ease: first.ease } : {}),
    ...(first.yaw ? { yaw: first.yaw } : {}),
  };
  if (existingEndIndex >= 0) {
    next.keyframes[existingEndIndex] = endFrame;
    return finish(next, existingEndIndex);
  } else {
    next.keyframes.push(endFrame);
    next.keyframes.sort((a, b) => a.time - b.time);
    const newIndex = next.keyframes.indexOf(endFrame);
    return finish(next, newIndex);
  }
}

export function applyPosePresetToKeyframe(animation: AnimationDef, index: number, joints: Joints): EditResult {
  if (index < 0 || index >= animation.keyframes.length) return { ok: false, error: code("err.animFrames") };
  const next = clone(animation);
  next.keyframes[index].joints = poseJoints(joints);
  return finish(next, index);
}

function isScalarKey(channel: CurveChannel): channel is ScalarKey {
  return Object.prototype.hasOwnProperty.call(SCALAR_LIMITS, channel);
}

export function channelValue(frame: AnimationKeyframe, channel: CurveChannel, rest: Joints) {
  if (isScalarKey(channel)) return frame[channel] ?? 0;
  return frame.joints[channel] ?? rest[channel];
}

export function channelLimits(channel: CurveChannel) {
  if (isScalarKey(channel)) return SCALAR_LIMITS[channel];
  return JOINT_LIMITS[channel];
}
