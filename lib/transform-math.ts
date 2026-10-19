import type { Vec3 } from "./model-types.ts";

export type Axis = "x" | "y" | "z";
export type Space = "local" | "world";
export type SnapKind = "pos" | "rot" | "scale";

/** One stage unit is 1/16 of a block. Rotation snaps to 15°. Shift uses the fine step. */
export function snapStep(kind: SnapKind, fine: boolean) {
  if (kind === "pos") return fine ? 0.25 : 1;
  if (kind === "rot") return fine ? 1 : 15;
  return fine ? 0.05 : 0.25;
}

/** Ctrl flips the snap toggle for the gesture in progress. */
export function snapActive(enabled: boolean, ctrl: boolean) {
  return ctrl ? !enabled : enabled;
}

export function round3(value: number) {
  const next = Math.round(value * 1000) / 1000;
  return Object.is(next, -0) ? 0 : next;
}

export function snap(value: number, step: number, enabled: boolean) {
  if (!enabled || !(step > 0) || !Number.isFinite(value)) return round3(value);
  const next = Math.round(value / step) * step;
  return round3(Object.is(next, -0) ? 0 : next);
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mul(a: Vec3, scale: number): Vec3 {
  return { x: a.x * scale, y: a.y * scale, z: a.z * scale };
}

export function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function length(a: Vec3) {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a: Vec3): Vec3 {
  const size = length(a);
  if (size < 1e-8) return { x: 0, y: 0, z: 0 };
  return mul(a, 1 / size);
}

export function axisUnit(axis: Axis): Vec3 {
  if (axis === "x") return { x: 1, y: 0, z: 0 };
  if (axis === "y") return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}

function rotX(y: number, z: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { y: y * c - z * s, z: y * s + z * c };
}

function rotY(x: number, z: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c + z * s, z: -x * s + z * c };
}

function rotZ(x: number, y: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Euler XYZ, matching Three.js: X, then Y, then Z. */
export function rotateVec(vector: Vec3, rotation: Vec3): Vec3 {
  const x = rotX(vector.y, vector.z, rotation.x);
  const y = rotY(vector.x, x.z, rotation.y);
  const z = rotZ(y.x, x.y, rotation.z);
  return { x: z.x, y: z.y, z: y.z };
}

export function axisDirection(axis: Axis, rotation: Vec3, space: Space): Vec3 {
  const base = axisUnit(axis);
  return space === "world" ? base : normalize(rotateVec(base, rotation));
}

export function applyAxisTranslation(start: Vec3, axis: Axis, distance: number, rotation: Vec3, space: Space, enabled: boolean, fine: boolean): Vec3 {
  const step = snapStep("pos", fine);
  const dir = axisDirection(axis, rotation, space);
  const traveled = snap(distance, step, enabled && space === "local");
  const next = add(start, mul(dir, space === "local" ? traveled : distance));
  if (space === "world" && enabled) {
    if (axis === "x" || axis === "y" || axis === "z") next[axis] = snap(next[axis], step, true);
  }
  return { x: round3(next.x), y: round3(next.y), z: round3(next.z) };
}

export function applyPlaneTranslation(start: Vec3, hitStart: Vec3, hitNow: Vec3, enabled: boolean, fine: boolean): Vec3 {
  const delta = sub(hitNow, hitStart);
  const step = snapStep("pos", fine);
  return {
    x: snap(start.x + delta.x, step, enabled),
    y: snap(start.y + delta.y, step, enabled),
    z: snap(start.z + delta.z, step, enabled),
  };
}

type Quat = { x: number; y: number; z: number; w: number };

function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quatFromAxis(axis: Vec3, degrees: number): Quat {
  const rad = (degrees * Math.PI) / 360;
  const s = Math.sin(rad);
  const dir = normalize(axis);
  return { x: dir.x * s, y: dir.y * s, z: dir.z * s, w: Math.cos(rad) };
}

function quatFromEuler(rotation: Vec3): Quat {
  const hx = (rotation.x * Math.PI) / 360;
  const hy = (rotation.y * Math.PI) / 360;
  const hz = (rotation.z * Math.PI) / 360;
  const cx = Math.cos(hx);
  const sx = Math.sin(hx);
  const cy = Math.cos(hy);
  const sy = Math.sin(hy);
  const cz = Math.cos(hz);
  const sz = Math.sin(hz);
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

function eulerFromQuat(q: Quat): Vec3 {
  const sinr = 2 * (q.w * q.x + q.y * q.z);
  const cosr = 1 - 2 * (q.x * q.x + q.y * q.y);
  const x = Math.atan2(sinr, cosr);
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const y = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);
  const siny = 2 * (q.w * q.z + q.x * q.y);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  const z = Math.atan2(siny, cosy);
  const deg = 180 / Math.PI;
  return { x: round3(x * deg), y: round3(y * deg), z: round3(z * deg) };
}

export function applyAxisRotation(rotation: Vec3, axis: Axis, degrees: number, space: Space, enabled: boolean, fine: boolean): Vec3 {
  const amount = snap(degrees, snapStep("rot", fine), enabled);
  if (space === "local") {
    const next = { ...rotation, [axis]: rotation[axis] + amount };
    return { x: round3(next.x), y: round3(next.y), z: round3(next.z) };
  }
  const world = quatFromAxis(axisUnit(axis), amount);
  return eulerFromQuat(quatMul(world, quatFromEuler(rotation)));
}

export function applyScale(scale: Vec3, axis: Axis | "all", factor: number, enabled: boolean, fine: boolean): Vec3 {
  const step = snapStep("scale", fine);
  const clamp = (value: number) => Math.min(8, Math.max(0.05, snap(value, step, enabled)));
  if (axis === "all") {
    return { x: clamp(scale.x * factor), y: clamp(scale.y * factor), z: clamp(scale.z * factor) };
  }
  const next = { ...scale, [axis]: clamp(scale[axis] * factor) };
  return { x: next.x, y: next.y, z: next.z };
}

/** Move the pivot and shift position so the model origin stays put. */
export function movePivot(position: Vec3, pivot: Vec3, rotation: Vec3, scale: Vec3, nextPivot: Vec3): { position: Vec3; pivot: Vec3 } {
  const delta = sub(nextPivot, pivot);
  const scaled = { x: delta.x * scale.x, y: delta.y * scale.y, z: delta.z * scale.z };
  const world = rotateVec(scaled, rotation);
  return {
    pivot: { x: round3(nextPivot.x), y: round3(nextPivot.y), z: round3(nextPivot.z) },
    position: { x: round3(position.x + world.x), y: round3(position.y + world.y), z: round3(position.z + world.z) },
  };
}

/** Parameter of the closest point on a line to a ray. Both directions should be unit length. */
export function closestLineT(lineOrigin: Vec3, lineDir: Vec3, rayOrigin: Vec3, rayDir: Vec3) {
  const w0 = sub(lineOrigin, rayOrigin);
  const a = dot(lineDir, lineDir);
  const b = dot(lineDir, rayDir);
  const c = dot(rayDir, rayDir);
  const d = dot(lineDir, w0);
  const e = dot(rayDir, w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-8) return 0;
  return (b * e - c * d) / denom;
}

export function rayPlane(planePoint: Vec3, planeNormal: Vec3, rayOrigin: Vec3, rayDir: Vec3): Vec3 | null {
  const denom = dot(planeNormal, rayDir);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot(planeNormal, sub(planePoint, rayOrigin)) / denom;
  if (t < 0) return null;
  return add(rayOrigin, mul(rayDir, t));
}

export function signedAngle(origin: Vec3, axis: Vec3, from: Vec3, to: Vec3) {
  const normal = normalize(axis);
  const project = (point: Vec3) => {
    const offset = sub(point, origin);
    return normalize(sub(offset, mul(normal, dot(offset, normal))));
  };
  const a = project(from);
  const b = project(to);
  if (length(a) < 1e-8 || length(b) < 1e-8) return 0;
  const sin = dot(cross(a, b), normal);
  const cos = Math.min(1, Math.max(-1, dot(a, b)));
  return round3(Math.atan2(sin, cos) * (180 / Math.PI));
}
