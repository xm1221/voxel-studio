import { Group, Vector3 } from "three";
import type { Joints, ModelType } from "../types";

/** Player model uses skin pixels as world units. Y is up. The skin root sits at y = 8. */
export const SKIN_LIFT = 8;
/** Studio floor sits just under the standing soles. */
export const FOOT_Y = -16;
/** Drop used by the noon rig when both knees are folded into a sit. */
export const SIT_DROP = -6;

const DEG = Math.PI / 180;

/**
 * Wide-arm layout from commit 25d47690, which matches skinview3d:
 * shoulder at (±5, -2), box center one pixel further out, elbow 3.65 below that center.
 * Slim arms use a 3px box and a 0.5px assembly offset so the inner face still meets x = ±4.
 */
export const ARM = {
  shoulderX: 5,
  shoulderY: -2,
  upperY: -1,
  upperH: 6,
  elbowY: -3.65,
  lowerY: -3,
  lowerH: 6,
  depth: 4,
} as const;

export const LEG = {
  hipX: 1.9,
  hipY: -12,
  hipZ: -0.1,
  upperY: -3,
  height: 6,
  kneeY: -5.65,
  lowerY: -3,
  width: 4,
  depth: 4,
} as const;

export function isSitting(joints: Joints) {
  return joints.rLegX < -50 && joints.lLegX < -50 && joints.rKnee > 45 && joints.lKnee > 45;
}

export type JointPoint = {
  shoulder: Vector3;
  elbow: Vector3;
  wrist: Vector3;
  hip: Vector3;
  knee: Vector3;
  ankle: Vector3;
};

/** World-space joint points for one side. Mirrors the groups built in `build.ts`. */
export function measureSide(model: ModelType, side: "right" | "left", joints: Joints): JointPoint {
  const sign = side === "right" ? -1 : 1;
  const slim = model === "slim";
  const assemblyX = slim ? 0.5 : 1;
  const armX = side === "right" ? joints.rArmX : joints.lArmX;
  const armZ = side === "right" ? joints.rArmZ : joints.lArmZ;
  const elbowBend = side === "right" ? joints.rElbow : joints.lElbow;
  const legX = side === "right" ? joints.rLegX : joints.lLegX;
  const kneeBend = side === "right" ? joints.rKnee : joints.lKnee;

  const root = new Group();
  root.position.y = isSitting(joints) ? SIT_DROP : 0;
  const skin = new Group();
  skin.position.y = SKIN_LIFT;
  root.add(skin);

  const shoulder = new Group();
  shoulder.position.set(sign * ARM.shoulderX, ARM.shoulderY, 0);
  shoulder.rotation.set(armX * DEG, 0, armZ * DEG);
  skin.add(shoulder);
  const assembly = new Group();
  assembly.position.x = sign * assemblyX;
  shoulder.add(assembly);
  const elbow = new Group();
  elbow.position.y = ARM.elbowY;
  elbow.rotation.x = elbowBend * DEG;
  assembly.add(elbow);
  const wrist = new Group();
  wrist.position.y = ARM.lowerY - ARM.lowerH / 2;
  elbow.add(wrist);

  const hip = new Group();
  hip.position.set(sign * LEG.hipX, LEG.hipY, LEG.hipZ);
  hip.rotation.x = legX * DEG;
  skin.add(hip);
  const knee = new Group();
  knee.position.y = LEG.kneeY;
  knee.rotation.x = kneeBend * DEG;
  hip.add(knee);
  const ankle = new Group();
  ankle.position.y = LEG.lowerY - LEG.height / 2;
  knee.add(ankle);

  root.updateMatrixWorld(true);
  const at = (object: Group) => new Vector3().setFromMatrixPosition(object.matrixWorld);
  return { shoulder: at(shoulder), elbow: at(elbow), wrist: at(wrist), hip: at(hip), knee: at(knee), ankle: at(ankle) };
}
