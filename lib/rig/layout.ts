import type { Joints, ModelType } from "../types";

/** Player model uses skin pixels as world units. Y is up. Feet rest on y = -16. */
export const SKIN_LIFT = 8;
export const FOOT_Y = -16;
export const LIMB_LENGTH = 12;
export const SEGMENT = 6;
/** How far the two halves sink into each other so the seam stays shut. */
export const OVERLAP = 0.32;
/** Jacket dilation, matching the vanilla second layer (0.25 per side). */
export const SHELL = 0.25;
/** How far the jacket crosses the hinge face so the inner edge does not peek. */
export const HINGE_COVER = 0.06;

const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];

export type Segment = {
  size: Vec3;
  center: Vec3;
};

export type LimbId = "rightArm" | "leftArm" | "rightLeg" | "leftLeg";

export type LimbPlan = {
  id: LimbId;
  pivot: Vec3;
  /** +1 hinges on +Z (kneecap). -1 hinges on -Z (point of the elbow). */
  hingeSign: 1 | -1;
  /** Hinge point in shoulder/hip space. */
  joint: Vec3;
  upper: Segment;
  lower: Segment;
  upperShell: Segment;
  lowerShell: Segment;
  uv: { u: number; v: number; w: number; d: number };
  overlay: { u: number; v: number; w: number; d: number };
};

function shellZ(depth: number, hingeSign: 1 | -1) {
  const into = -hingeSign;
  const far = into * depth + into * SHELL;
  const cover = -into * HINGE_COVER;
  const z0 = Math.min(cover, far);
  const z1 = Math.max(cover, far);
  return { center: (z0 + z1) / 2, size: z1 - z0 };
}

function planLimb(
  id: LimbId,
  pivot: Vec3,
  width: number,
  hingeSign: 1 | -1,
  uv: LimbPlan["uv"],
  overlay: LimbPlan["overlay"],
  offsetX = 0,
): LimbPlan {
  const depth = 4;
  const upperLen = SEGMENT + OVERLAP;
  const lowerLen = SEGMENT + OVERLAP;
  const upper: Segment = {
    size: [width, upperLen, depth],
    center: [offsetX, -upperLen / 2, 0],
  };
  const joint: Vec3 = [offsetX, -SEGMENT, hingeSign * (depth / 2)];
  const lower: Segment = {
    size: [width, lowerLen, depth],
    center: [offsetX, (OVERLAP - SEGMENT) / 2, -hingeSign * (depth / 2)],
  };
  const zShell = shellZ(depth, hingeSign);
  const upperTop = SHELL;
  const upperBottom = -upperLen;
  const upperShell: Segment = {
    size: [width + SHELL * 2, upperTop - upperBottom, zShell.size],
    center: [offsetX, (upperTop + upperBottom) / 2, zShell.center],
  };
  const lowerTop = OVERLAP;
  const lowerBottom = -SEGMENT - SHELL;
  const lowerShell: Segment = {
    size: [width + SHELL * 2, lowerTop - lowerBottom, zShell.size],
    center: [offsetX, (lowerTop + lowerBottom) / 2, zShell.center],
  };
  return { id, pivot, hingeSign, joint, upper, lower, upperShell, lowerShell, uv, overlay };
}

export function planLimbs(model: ModelType): LimbPlan[] {
  const slim = model === "slim";
  const armW = slim ? 3 : 4;
  const rightOffset = slim ? -1.5 : -2;
  const leftOffset = slim ? 1.5 : 2;
  return [
    planLimb("rightArm", [-4, 0, 0], armW, -1, { u: 40, v: 16, w: armW, d: 4 }, { u: 40, v: 32, w: armW, d: 4 }, rightOffset),
    planLimb("leftArm", [4, 0, 0], armW, -1, { u: 32, v: 48, w: armW, d: 4 }, { u: 48, v: 48, w: armW, d: 4 }, leftOffset),
    planLimb("rightLeg", [-1.9, -12, -0.1], 4, 1, { u: 0, v: 16, w: 4, d: 4 }, { u: 0, v: 32, w: 4, d: 4 }),
    planLimb("leftLeg", [1.9, -12, -0.1], 4, 1, { u: 16, v: 48, w: 4, d: 4 }, { u: 0, v: 48, w: 4, d: 4 }),
  ];
}

export function rotateX(y: number, z: number, degrees: number): [number, number] {
  const radians = degrees * DEG;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [y * c - z * s, y * s + z * c];
}

/** Lowest sole corner in world Y, before the seated drop. */
export function plantedFootY(plan: LimbPlan, hipPitch: number, kneeBend: number) {
  const [, height, depth] = plan.lower.size;
  const [, cy, cz] = plan.lower.center;
  const bottom = cy - height / 2;
  const zs = [cz - depth / 2, cz + depth / 2];
  let lowest = Number.POSITIVE_INFINITY;
  for (const z of zs) {
    const [bentY, bentZ] = rotateX(bottom, z, kneeBend);
    const [pitchedY] = rotateX(plan.joint[1] + bentY, plan.joint[2] + bentZ, hipPitch);
    if (pitchedY < lowest) lowest = pitchedY;
  }
  return SKIN_LIFT + plan.pivot[1] + lowest;
}

/**
 * How far the pose has folded into a chair sit.
 * 0 stands and walks. 1 is thighs forward and calves folded.
 */
export function sitAmount(joints: Joints) {
  const leg = Math.min(joints.rLegX, joints.lLegX);
  const knee = Math.min(joints.rKnee, joints.lKnee);
  const legT = clamp((-leg - 35) / 55, 0, 1);
  const kneeT = clamp((knee - 15) / 70, 0, 1);
  return legT * kneeT;
}

const seatLegs = {
  right: planLimbs("default").find((plan) => plan.id === "rightLeg")!,
  left: planLimbs("default").find((plan) => plan.id === "leftLeg")!,
};

/** Push the hips forward of the belly and drop the body until the soles reach the floor. */
export function seatShift(joints: Joints) {
  const amount = sitAmount(joints);
  if (amount <= 0) return { y: 0, hipForward: 0, amount: 0 };
  const lowest = Math.min(
    plantedFootY(seatLegs.right, joints.rLegX, joints.rKnee),
    plantedFootY(seatLegs.left, joints.lLegX, joints.lKnee),
  );
  const fullDrop = FOOT_Y - lowest;
  return { y: fullDrop * amount, hipForward: 2.35 * amount, amount };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Body occupies x ±4, y 0..-12, z ±2 in skin space. */
export const BODY = { halfX: 4, top: 0, bottom: -12, halfZ: 2 };
