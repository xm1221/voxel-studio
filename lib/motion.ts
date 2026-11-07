import { code } from "./i18n.ts";
import { poseById } from "./poses.ts";
import { JOINT_LIMITS } from "./presets.ts";
import type { AnimationDef, AnimationKeyframe, BuiltinClipId, EaseId, Joints, PlayerDraft } from "./types";

/** 动作相位对齐 skinview3d 的行走 / 跑步，并在肘、膝上加随摆动弯曲。 */
export type ClipSample = {
  joints: Joints;
  bob: number;
  sway: number;
  roll: number;
  cape: number;
  /** Turn around the vertical axis, in degrees. Built-in spin uses it. */
  yaw: number;
};

export const CLIPS: Array<{ id: BuiltinClipId; name: string; hint: string }> = [
  { id: "none", name: "静止", hint: "停在滑块上的姿势。导出时人物转一圈。" },
  { id: "idle", name: "呼吸", hint: "在当前姿势上，肩、肘和披风轻轻起伏。" },
  { id: "walk", name: "行走", hint: "手脚交叉，后腿屈膝，后臂屈肘。" },
  { id: "run", name: "跑步", hint: "步幅更大，身体一起一伏。" },
  { id: "wave", name: "挥手", hint: "右臂抬起，小臂来回摆。" },
  { id: "cheer", name: "欢呼", hint: "双臂举起，肘和膝跟着节拍弯。" },
  { id: "crouch", name: "潜行", hint: "蹲下、身体前倾，手臂微张，像在方块边上挪。" },
  { id: "attack", name: "挥剑", hint: "右臂斜劈下来，身体跟着转，落点带一下顿。" },
  { id: "fly", name: "飞行", hint: "身体前倾、双臂后展，披风被风掀起。" },
  { id: "swim", name: "游泳", hint: "蛙泳：双臂轮流前伸，腿跟着收放。" },
  { id: "nod", name: "点头", hint: "头轻轻上下，肩膀几乎不动。" },
  { id: "spin", name: "转身", hint: "整个人绕竖轴转一圈，手臂微微甩开。" },
  { id: "jump", name: "起跳", hint: "下蹲蓄力、蹬地、落地缓冲。" },
  { id: "sit", name: "坐姿循环", hint: "坐在地上，呼吸起伏，小腿轻轻晃。" },
];

const BUILTIN_IDS = new Set<BuiltinClipId>(CLIPS.map((clip) => clip.id));
const BUILTIN_ANIMATIONS = new Map<BuiltinClipId, AnimationDef>();
const NEUTRAL_JOINTS = poseById("idle").joints;
const MAX_ANIMATION_FRAMES = 240;
const MIN_ANIMATION_DURATION = 0.2;
const MAX_ANIMATION_DURATION = 30;
/** A valid 240-frame document fits under this. Larger text is rejected before JSON.parse. */
export const MAX_ANIMATION_TEXT_LENGTH = 512 * 1024;
const SCALAR_LIMITS = {
  bob: { min: -8, max: 8 },
  sway: { min: -5, max: 5 },
  roll: { min: -5, max: 5 },
  cape: { min: -45, max: 45 },
  /** Turn around the vertical axis, in degrees. Absent means 0, like v1. */
  yaw: { min: -720, max: 720 },
} as const;

export const EASES = ["linear", "smoothstep", "ease-in-out"] as const;
const EASE_IDS = new Set<string>(EASES);

export function isEaseId(value: unknown): value is EaseId {
  return typeof value === "string" && EASE_IDS.has(value);
}

/** Cubic ease-in-out (slow, fast, slow) symmetric around the midpoint. */
function easeInOut(value: number) {
  return value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;
}

export function applyEase(ease: EaseId | undefined, value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  if (ease === "linear") return clamped;
  if (ease === "ease-in-out") return easeInOut(clamped);
  return smoothstep(clamped);
}

const ANIMATION_KEYS = new Set(["v", "name", "duration", "loop", "keyframes"]);
const KEYFRAME_KEYS = new Set(["time", "joints", "ease", ...Object.keys(SCALAR_LIMITS)]);

export function clipById(id: string | undefined): BuiltinClipId {
  return id && BUILTIN_IDS.has(id as BuiltinClipId) ? (id as BuiltinClipId) : "none";
}

/** 速度为 1 时，一个无缝循环的秒数。 */
export function clipCycle(clip: BuiltinClipId): number {
  if (clip === "walk") return (Math.PI * 2) / 8;
  if (clip === "run") return (Math.PI * 2) / 15;
  if (clip === "wave") return 2;
  if (clip === "cheer") return 1.2;
  if (clip === "idle") return Math.PI;
  if (clip === "crouch") return 2.6;
  if (clip === "attack") return 0.9;
  if (clip === "fly") return 2.8;
  if (clip === "swim") return 1.7;
  if (clip === "nod") return 1.4;
  if (clip === "spin") return 2.2;
  if (clip === "jump") return 1.25;
  if (clip === "sit") return 2.4;
  return 2.4;
}

/** 导出用的循环。行走和跑步收两步，转一圈和呼吸收一整段。 */
export function clipExportSpan(
  clip: BuiltinClipId,
  fps = 12,
  maxFrames = 28,
  minFrames = 12,
): { frames: number; seconds: number } {
  const cycle = clipCycle(clip);
  const seconds = clip === "walk" || clip === "run" ? cycle * 2 : cycle;
  const frames = clip === "none" ? 24 : Math.min(maxFrames, Math.max(minFrames, Math.round(seconds * fps)));
  return { frames, seconds };
}

export function animationExportSpan(
  animation: AnimationDef,
  speed = 1,
  fps = 12,
  maxFrames = 28,
  minFrames = 12,
): { frames: number; seconds: number } {
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const seconds = animation.duration / safeSpeed;
  const frames = Math.min(maxFrames, Math.max(minFrames, Math.round(seconds * fps)));
  return { frames, seconds };
}

type PlayerMotion = Pick<PlayerDraft, "clip" | "clipSpeed"> & {
  customAnimation?: AnimationDef | null;
};

/**
 * One span for the whole cast. `fps` and `frameCap` let the GIF/MP4 UI pick
 * quality; the defaults are the old 12–28 frame, 12 fps GIF.
 */
export function clipExportSpanForPlayers(
  players: PlayerMotion[],
  options: { fps?: number; maxFrames?: number; minFrames?: number } = {},
): { frames: number; seconds: number } {
  const fps = Number.isFinite(options.fps) && (options.fps as number) > 0 ? (options.fps as number) : 12;
  const maxFrames = Math.min(240, Math.max(2, Math.round(options.maxFrames ?? 28)));
  const minFrames = Math.min(maxFrames, Math.max(2, Math.round(options.minFrames ?? 12)));
  if (!players.length) return clipExportSpan("none", fps, maxFrames, minFrames);
  const seconds = Math.max(
    ...players.map((player) => {
      const speed = Number.isFinite(player.clipSpeed) && player.clipSpeed > 0 ? player.clipSpeed : 1;
      if (player.clip === "custom" && player.customAnimation) {
        return animationExportSpan(player.customAnimation, speed, fps, maxFrames, minFrames).seconds;
      }
      return clipExportSpan(clipById(player.clip), fps, maxFrames, minFrames).seconds / speed;
    }),
  );
  // A fully still cast still exports the slow turntable, which the old GIF had.
  if (players.every((player) => player.clip === "none")) {
    return { frames: Math.min(maxFrames, Math.max(minFrames, 24)), seconds };
  }
  const frames = Math.min(maxFrames, Math.max(minFrames, Math.round(seconds * fps)));
  return { frames, seconds };
}

export function phaseOffset(index: number, clip: BuiltinClipId): number {
  return index * clipCycle(clip) * 0.17;
}

export function motionPhaseOffset(index: number, player: PlayerMotion): number {
  if (player.clip === "custom" && player.customAnimation) {
    return index * player.customAnimation.duration * 0.17;
  }
  return phaseOffset(index, clipById(player.clip));
}

const SIT_JOINTS: Joints = poseById("sit").joints;

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

/** 0 → 1 → 0 over [a, b], smooth at both ends. Used to cut a cycle into phases. */
function pulse(value: number, a: number, b: number) {
  if (value <= a || value >= b) return 0;
  const u = (value - a) / (b - a);
  return Math.sin(u * Math.PI) ** 2;
}

function trailBend(backward: number, fullSwing: number, amount: number) {
  const t = Math.min(1, Math.max(0, backward) / fullSwing);
  const eased = t * t * (3 - 2 * t);
  return eased * amount;
}

export function sampleClip(clip: BuiltinClipId, time: number, rest: Joints): ClipSample {
  const joints: Joints = { ...rest };
  let bob = 0;
  let sway = 0;
  let roll = 0;
  let cape = 0;
  let yaw = 0;

  if (clip === "idle") {
    const w = time * 2;
    joints.rArmZ = rest.rArmZ + Math.cos(w + Math.PI) * 2.4;
    joints.lArmZ = rest.lArmZ + Math.cos(w) * 2.4;
    joints.rElbow = rest.rElbow + Math.sin(w) * 7;
    joints.lElbow = rest.lElbow + Math.sin(w + 0.6) * 7;
    joints.headX = rest.headX + Math.sin(w) * 2.2;
    joints.rKnee = rest.rKnee + Math.max(0, Math.sin(w)) * 3;
    joints.lKnee = rest.lKnee + Math.max(0, Math.sin(w + Math.PI)) * 3;
    cape = Math.sin(w) * 2.4;
  } else if (clip === "walk") {
    const t = time * 8;
    const s = Math.sin(t);
    joints.lLegX = s * 28.6;
    joints.rLegX = -s * 28.6;
    joints.lArmX = -s * 28.6;
    joints.rArmX = s * 28.6;
    joints.lArmZ = rest.lArmZ + Math.cos(t) * 2.2;
    joints.rArmZ = rest.rArmZ - Math.cos(t) * 2.2;
    joints.lKnee = trailBend(joints.lLegX, 28.6, 34);
    joints.rKnee = trailBend(joints.rLegX, 28.6, 34);
    joints.lElbow = rest.lElbow - trailBend(joints.lArmX, 28.6, 28);
    joints.rElbow = rest.rElbow - trailBend(joints.rArmX, 28.6, 28);
    joints.headY = rest.headY + Math.sin(t) * 6;
    joints.headX = rest.headX + Math.sin(t * 2) * 3;
    joints.bodyX = rest.bodyX + Math.sin(t * 2) * 2.5;
    bob = Math.abs(Math.sin(t)) * 0.55;
    cape = Math.sin(t / 2) * 4;
  } else if (clip === "run") {
    const t = time * 15 + Math.PI * 0.5;
    const c = Math.cos(t);
    joints.lLegX = -c * 72;
    joints.rLegX = c * 72;
    joints.lArmX = c * 84;
    joints.rArmX = -c * 84;
    joints.lArmZ = 8 + Math.cos(t) * 5;
    joints.rArmZ = -8 - Math.cos(t) * 5;
    joints.lKnee = trailBend(joints.lLegX, 72, 52);
    joints.rKnee = trailBend(joints.rLegX, 72, 52);
    joints.lElbow = -trailBend(joints.lArmX, 84, 40);
    joints.rElbow = -trailBend(joints.rArmX, 84, 40);
    joints.bodyX = 10;
    joints.headX = -6;
    bob = Math.cos(t * 2) * 1.15;
    sway = Math.cos(t) * 0.18;
    roll = Math.cos(t + Math.PI) * 0.8;
    cape = 10 + Math.sin(t * 2) * 6;
  } else if (clip === "wave") {
    const t = (time * Math.PI * 2) / clipCycle("wave");
    joints.rArmX = -32;
    joints.rArmZ = -115 + Math.sin(t * 2) * 6;
    joints.rElbow = -42 + Math.sin(t * 2) * 24;
    joints.headY = -12 + Math.sin(t * 2) * 4;
    joints.headX = rest.headX * 0.25 - 4;
    cape = Math.sin(t) * 2;
  } else if (clip === "cheer") {
    const t = (time * Math.PI * 2) / 1.2;
    joints.rArmX = -28 + Math.sin(t) * 12;
    joints.lArmX = -28 + Math.sin(t + 0.7) * 12;
    joints.rArmZ = -152;
    joints.lArmZ = 152;
    joints.rElbow = -48 + Math.sin(t) * 18;
    joints.lElbow = -48 + Math.sin(t + 0.7) * 18;
    joints.headX = -8 + Math.sin(t) * 3;
    joints.rKnee = rest.rKnee + Math.max(0, Math.sin(t)) * 10;
    joints.lKnee = rest.lKnee + Math.max(0, Math.sin(t + Math.PI)) * 10;
    bob = Math.abs(Math.sin(t)) * 1.05;
    cape = 4 + Math.sin(t * 2) * 3;
  } else if (clip === "crouch") {
    // Sneak-walk: stealth posture, continuous knee bend, arms steady for balance.
    const t = (time * Math.PI * 2) / clipCycle("crouch");
    const s = Math.sin(t);
    const c = Math.cos(t);
    joints.bodyX = rest.bodyX + 16;
    joints.headX = rest.headX - 10;
    joints.headY = rest.headY + s * 4;
    joints.rArmX = rest.rArmX - 18 + s * 10;
    joints.lArmX = rest.lArmX - 18 - s * 10;
    joints.rArmZ = rest.rArmZ - 14 + c * 3;
    joints.lArmZ = rest.lArmZ + 14 - c * 3;
    joints.rElbow = rest.rElbow - 25;
    joints.lElbow = rest.lElbow - 25;
    joints.rLegX = -28 - s * 14;
    joints.lLegX = -28 + s * 14;
    joints.rKnee = 45 + Math.max(0, -s) * 14;
    joints.lKnee = 45 + Math.max(0, s) * 14;
    bob = 0.5 + Math.abs(s) * 0.35;
    sway = s * 0.25;
    roll = c * 0.4;
    cape = 2 + c * 2;
  } else if (clip === "attack") {
    // Sword slash: crisp windup above the shoulder, diagonal slash across front, smooth recovery.
    const u = (time / clipCycle("attack")) % 1;
    const windup = pulse(u, 0, 0.30);
    const slash = pulse(u, 0.28, 0.55);
    const settle = pulse(u, 0.52, 0.95);

    const rArmX = rest.rArmX - windup * 85 + slash * 45 - settle * 10;
    joints.rArmX = rArmX;
    const rArmZ = rest.rArmZ - windup * 22 + slash * 32 - settle * 6;
    joints.rArmZ = rArmZ;
    const rElbow = rest.rElbow - windup * 42 - slash * 18 - settle * 8;
    joints.rElbow = rElbow;

    joints.lArmX = rest.lArmX + slash * 25 - windup * 10;
    joints.lArmZ = rest.lArmZ + slash * 16;
    joints.lElbow = rest.lElbow - slash * 20;

    joints.bodyX = rest.bodyX + slash * 12 - windup * 4;
    joints.headX = rest.headX + slash * 6;
    joints.headY = rest.headY + slash * 14 - windup * 8;

    joints.rLegX = rest.rLegX - slash * 16;
    joints.lLegX = rest.lLegX + slash * 12;
    joints.rKnee = rest.rKnee + slash * 18;
    joints.lKnee = rest.lKnee + slash * 8;

    bob = slash * 0.45;
    sway = slash * 0.5;
    roll = -slash * 1.2;
    cape = slash * 8;
  } else if (clip === "fly") {
    // Elytra glide: torso forward, arms swept back, cape streaming.
    const t = (time * Math.PI * 2) / clipCycle("fly");
    const s = Math.sin(t);
    joints.bodyX = rest.bodyX + 24;
    joints.headX = rest.headX - 18;
    joints.headY = rest.headY + s * 3;
    joints.rArmX = rest.rArmX + 34 + s * 4;
    joints.lArmX = rest.lArmX + 34 - s * 4;
    joints.rArmZ = rest.rArmZ - 18;
    joints.lArmZ = rest.lArmZ + 18;
    joints.rElbow = rest.rElbow - 12;
    joints.lElbow = rest.lElbow - 12;
    joints.rLegX = rest.rLegX + 18 + s * 3;
    joints.lLegX = rest.lLegX + 18 - s * 3;
    joints.rKnee = rest.rKnee + 14;
    joints.lKnee = rest.lKnee + 14;
    bob = 1.2 + s * 1.1;
    sway = s * 0.5;
    roll = Math.cos(t) * 1.2;
    cape = 24 + Math.sin(t + 0.7) * 5;
  } else if (clip === "swim") {
    // Breaststroke: arms sweep out and together, legs kick on the off beat.
    const t = (time * Math.PI * 2) / clipCycle("swim");
    const sweep = Math.sin(t);
    const kick = Math.sin(t * 2 + Math.PI / 2);
    joints.bodyX = rest.bodyX + 26;
    joints.headX = rest.headX - 26;
    joints.rArmX = -118 + sweep * 34;
    joints.lArmX = -118 + sweep * 34;
    joints.rArmZ = rest.rArmZ - 26 - sweep * 18;
    joints.lArmZ = rest.lArmZ + 26 + sweep * 18;
    joints.rElbow = -34 - Math.max(0, sweep) * 22;
    joints.lElbow = -34 - Math.max(0, sweep) * 22;
    joints.rLegX = -16 + kick * 26;
    joints.lLegX = -16 - kick * 26;
    joints.rKnee = 34 + Math.max(0, kick) * 22;
    joints.lKnee = 34 + Math.max(0, -kick) * 22;
    bob = 0.6 + Math.sin(t * 2) * 0.5;
    roll = Math.cos(t) * 1.6;
    cape = 6 + sweep * 4;
  } else if (clip === "nod") {
    const t = (time * Math.PI * 4) / clipCycle("nod");
    joints.headX = rest.headX + Math.sin(t) * 17;
    joints.headY = rest.headY + Math.sin(t * 0.5) * 3;
    joints.rArmZ = rest.rArmZ - 1.5;
    joints.lArmZ = rest.lArmZ + 1.5;
    bob = 0.2 + Math.cos(t) * 0.15;
    cape = Math.sin(t * 0.5) * 1.5;
  } else if (clip === "spin") {
    const u = (time / clipCycle("spin")) % 1;
    const eased = smoothstep(Math.min(1, Math.max(0, u)));
    yaw = eased * 360;
    const flare = Math.sin(u * Math.PI);
    joints.rArmX = rest.rArmX + 10;
    joints.lArmX = rest.lArmX + 10;
    joints.rArmZ = rest.rArmZ - 28 * flare;
    joints.lArmZ = rest.lArmZ + 28 * flare;
    joints.rElbow = rest.rElbow - 20 * flare;
    joints.lElbow = rest.lElbow - 20 * flare;
    joints.headY = rest.headY;
    joints.bodyX = rest.bodyX + 5 * flare;
    joints.rLegX = rest.rLegX - 10 * flare;
    joints.lLegX = rest.lLegX + 10 * flare;
    bob = 1.1 * flare;
    roll = Math.sin(u * Math.PI * 2) * 1.2;
    cape = 8 * flare;
  } else if (clip === "jump") {
    // Crouch, launch, float, land, settle. Starts and ends on the rest pose.
    const u = (time / clipCycle("jump")) % 1;
    const crouch = pulse(u, 0, 0.22);
    const launch = pulse(u, 0.20, 0.36);
    const air = pulse(u, 0.32, 0.78);
    const land = pulse(u, 0.76, 0.94);

    joints.bodyX = rest.bodyX + crouch * 14 - launch * 6 + air * 4 + land * 10;
    joints.rArmX = rest.rArmX + crouch * 34 - launch * 65 - air * 35 + land * 24;
    joints.lArmX = rest.lArmX + crouch * 34 - launch * 65 - air * 35 + land * 24;
    joints.rArmZ = rest.rArmZ - air * 28 - launch * 18;
    joints.lArmZ = rest.lArmZ + air * 28 + launch * 18;
    joints.rElbow = rest.rElbow - air * 24 - land * 18;
    joints.lElbow = rest.lElbow - air * 24 - land * 18;

    joints.rLegX = rest.rLegX - crouch * 28 - air * 16 + land * 22;
    joints.lLegX = rest.lLegX - crouch * 28 + air * 10 + land * 22;
    joints.rKnee = rest.rKnee + crouch * 38 + air * 26 + land * 32;
    joints.lKnee = rest.lKnee + crouch * 38 + air * 22 + land * 32;

    joints.headX = rest.headX - crouch * 6 - air * 8 + land * 8;
    bob = -crouch * 2.2 + air * 6.5 - land * 1.8;
    sway = 0;
    roll = 0;
    cape = crouch * 2 + air * 12 - land * 2;
  } else if (clip === "sit") {
    // Seated loop on top of the sit pose: breathing, dangling shins, quiet cape.
    const t = (time * Math.PI * 2) / clipCycle("sit");
    const s = Math.sin(t);
    const base = SIT_JOINTS;
    joints.bodyX = base.bodyX + s * 1.6;
    joints.headX = base.headX + s * 2.2;
    joints.headY = base.headY + Math.sin(t * 0.5) * 4;
    joints.rArmX = base.rArmX + s * 2;
    joints.lArmX = base.lArmX - s * 2;
    joints.rArmZ = base.rArmZ - s * 1.5;
    joints.lArmZ = base.lArmZ + s * 1.5;
    joints.rElbow = base.rElbow + Math.sin(t + 0.4) * 5;
    joints.lElbow = base.lElbow + Math.sin(t + 1.1) * 5;
    joints.rLegX = base.rLegX + s * 2.5;
    joints.lLegX = base.lLegX - s * 2.5;
    joints.rKnee = base.rKnee + s * 3;
    joints.lKnee = base.lKnee - s * 3;
    bob = 0.25 + s * 0.2;
    roll = s * 0.3;
    cape = 2 + s * 1.5;
  }

  return { joints, bob, sway, roll, cape, yaw };
}

function cloneAnimation(animation: AnimationDef): AnimationDef {
  return {
    ...animation,
    keyframes: animation.keyframes.map((frame) => ({
      ...frame,
      joints: { ...frame.joints },
    })),
  };
}

function clamp(value: number, min: number, max: number) {
  const next = Math.min(max, Math.max(min, value));
  return next === 0 ? 0 : next;
}

function frameFromSample(clip: BuiltinClipId, time: number): AnimationKeyframe {
  const sampled = sampleClip(clip, time, NEUTRAL_JOINTS);
  const joints: Partial<Joints> = {};
  for (const key of Object.keys(JOINT_LIMITS) as (keyof Joints)[]) {
    joints[key] = clamp(sampled.joints[key], JOINT_LIMITS[key].min, JOINT_LIMITS[key].max);
  }
  return {
    time,
    joints,
    bob: clamp(sampled.bob, SCALAR_LIMITS.bob.min, SCALAR_LIMITS.bob.max),
    sway: clamp(sampled.sway, SCALAR_LIMITS.sway.min, SCALAR_LIMITS.sway.max),
    roll: clamp(sampled.roll, SCALAR_LIMITS.roll.min, SCALAR_LIMITS.roll.max),
    cape: clamp(sampled.cape, SCALAR_LIMITS.cape.min, SCALAR_LIMITS.cape.max),
    ...(Math.abs(sampled.yaw) > 1e-6 ? { yaw: clamp(sampled.yaw, SCALAR_LIMITS.yaw.min, SCALAR_LIMITS.yaw.max) } : {}),
  };
}

function createBuiltinAnimation(clip: BuiltinClipId): AnimationDef {
  const duration = clipCycle(clip);
  const clipInfo = CLIPS.find((item) => item.id === clip);
  if (clip === "none") {
    return {
      v: 1,
      name: clipInfo?.name ?? "Still",
      duration,
      loop: true,
      keyframes: [frameFromSample(clip, 0)],
    };
  }
  const steps = 32;
  return {
    v: 1,
    name: clipInfo?.name ?? clip,
    duration,
    loop: true,
    keyframes: Array.from({ length: steps + 1 }, (_, index) => frameFromSample(clip, (index / steps) * duration)),
  };
}

/** Built-in clips are exposed through the same versioned format as imported clips. */
export function animationForClip(clip: BuiltinClipId): AnimationDef {
  let animation = BUILTIN_ANIMATIONS.get(clip);
  if (!animation) {
    animation = createBuiltinAnimation(clip);
    BUILTIN_ANIMATIONS.set(clip, animation);
  }
  return cloneAnimation(animation);
}

export function animationDocument(animation: AnimationDef): AnimationDef {
  return cloneAnimation(animation);
}

/** Download name for an animation. Non-ASCII names fall back to `animation`. */
export function animationDownloadName(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `pixelstage-${slug || "animation"}.json`;
}

export function parseAnimationText(text: string): { ok: true; animation: AnimationDef } | { ok: false; error: string } {
  if (text.length > MAX_ANIMATION_TEXT_LENGTH) return { ok: false, error: code("err.animSize") };
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: code("err.animJson") };
  }
  return parseAnimationDocument(value);
}

export function parseAnimationDocument(value: unknown): { ok: true; animation: AnimationDef } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: code("err.animJson") };
  if (!hasOnlyKeys(value, ANIMATION_KEYS)) return { ok: false, error: code("err.animUnknown") };
  if (value.v !== 1) return { ok: false, error: code("err.animVersion") };

  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 48) return { ok: false, error: code("err.animName") };

  const duration = value.duration;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < MIN_ANIMATION_DURATION ||
    duration > MAX_ANIMATION_DURATION
  ) {
    return { ok: false, error: code("err.animDuration") };
  }

  if (typeof value.loop !== "boolean") return { ok: false, error: code("err.animLoop") };
  if (!Array.isArray(value.keyframes) || value.keyframes.length < 1 || value.keyframes.length > MAX_ANIMATION_FRAMES) {
    return { ok: false, error: code("err.animFrames") };
  }

  const keyframes: AnimationKeyframe[] = [];
  let previousTime = -Infinity;
  for (let index = 0; index < value.keyframes.length; index += 1) {
    const parsed = parseKeyframe(value.keyframes[index], index, duration, previousTime);
    if (!parsed.ok) return parsed;
    keyframes.push(parsed.frame);
    previousTime = parsed.frame.time;
  }

  return {
    ok: true,
    animation: {
      v: 1,
      name,
      duration,
      loop: value.loop,
      keyframes,
    },
  };
}

function parseKeyframe(
  value: unknown,
  index: number,
  duration: number,
  previousTime: number,
): { ok: true; frame: AnimationKeyframe } | { ok: false; error: string } {
  const n = index + 1;
  if (!isRecord(value) || !hasOnlyKeys(value, KEYFRAME_KEYS)) {
    return { ok: false, error: code("err.animFrame", { n }) };
  }
  const time = value.time;
  if (
    typeof time !== "number" ||
    !Number.isFinite(time) ||
    time < 0 ||
    time > duration ||
    time <= previousTime
  ) {
    return { ok: false, error: code("err.animTime", { n }) };
  }
  const joints = parseAnimationJoints(value.joints, n);
  if (!joints.ok) return joints;

  const frame: AnimationKeyframe = {
    time,
    joints: joints.joints,
    bob: 0,
    sway: 0,
    roll: 0,
    cape: 0,
  };
  for (const key of Object.keys(SCALAR_LIMITS) as Array<keyof typeof SCALAR_LIMITS>) {
    const raw = value[key];
    if (raw === undefined) continue;
    const limit = SCALAR_LIMITS[key];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < limit.min || raw > limit.max) {
      return { ok: false, error: code("err.animFrame", { n }) };
    }
    frame[key] = raw;
  }
  if (value.ease !== undefined) {
    if (!isEaseId(value.ease)) return { ok: false, error: code("err.animEase", { n }) };
    frame.ease = value.ease;
  }
  return { ok: true, frame };
}

function parseAnimationJoints(
  value: unknown,
  n: number,
): { ok: true; joints: Partial<Joints> } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: code("err.animFrame", { n }) };
  const joints: Partial<Joints> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(JOINT_LIMITS, key)) return { ok: false, error: code("err.animUnknown") };
    const limit = JOINT_LIMITS[key as keyof Joints];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < limit.min || raw > limit.max) {
      return { ok: false, error: code("err.animJoints", { n }) };
    }
    joints[key as keyof Joints] = raw;
  }
  return { ok: true, joints };
}

export function sampleAnimation(animation: AnimationDef, time: number, rest: Joints): ClipSample {
  const duration = Math.max(animation.duration, 0.0001);
  let localTime = time;
  if (animation.loop) {
    localTime %= duration;
    if (localTime < 0) localTime += duration;
  } else {
    localTime = Math.max(0, Math.min(duration, localTime));
  }

  const frames = animation.keyframes;
  if (frames.length === 1) return sampleFrame(frames[0], rest);

  let from = frames[0];
  let to = frames[1];
  let rawMix = 0;
  const last = frames[frames.length - 1];

  if (localTime < from.time) {
    if (!animation.loop) return sampleFrame(from, rest);
    to = from;
    from = last;
    const endTime = to.time + duration;
    rawMix = (localTime + duration - from.time) / (endTime - from.time);
  } else if (localTime >= last.time) {
    if (!animation.loop) return sampleFrame(last, rest);
    from = last;
    to = frames[0];
    const endTime = to.time + duration;
    rawMix = (localTime - from.time) / (endTime - from.time);
  } else {
    let index = 0;
    while (index < frames.length - 2 && frames[index + 1].time <= localTime) index += 1;
    from = frames[index];
    to = frames[index + 1];
    const span = to.time - from.time;
    rawMix = span > 0 ? (localTime - from.time) / span : 0;
  }

  const mix = applyEase(from.ease, rawMix);

  const joints = {} as Joints;
  for (const key of Object.keys(JOINT_LIMITS) as (keyof Joints)[]) {
    const start = from.joints[key] ?? rest[key];
    const end = to.joints[key] ?? rest[key];
    joints[key] = start + (end - start) * mix;
  }

  return {
    joints,
    bob: from.bob + (to.bob - from.bob) * mix,
    sway: from.sway + (to.sway - from.sway) * mix,
    roll: from.roll + (to.roll - from.roll) * mix,
    cape: from.cape + (to.cape - from.cape) * mix,
    yaw: (from.yaw ?? 0) + ((to.yaw ?? 0) - (from.yaw ?? 0)) * mix,
  };
}

export function sampleMotion(player: Pick<PlayerDraft, "clip" | "customAnimation">, time: number, rest: Joints): ClipSample {
  if (player.clip === "custom" && player.customAnimation) {
    return sampleAnimation(player.customAnimation, time, rest);
  }
  return sampleClip(clipById(player.clip), time, rest);
}

function sampleFrame(frame: AnimationKeyframe, rest: Joints): ClipSample {
  const joints = {} as Joints;
  for (const key of Object.keys(JOINT_LIMITS) as (keyof Joints)[]) {
    joints[key] = frame.joints[key] ?? rest[key];
  }
  return {
    joints,
    bob: frame.bob,
    sway: frame.sway,
    roll: frame.roll,
    cape: frame.cape,
    yaw: frame.yaw ?? 0,
  };
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}
