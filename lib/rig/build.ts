import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CircleGeometry,
  ClampToEdgeWrapping,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  type Material,
  type Texture,
} from "three";
import type { Joints, ModelType } from "../types";
import { planLimbs, seatShift, type LimbPlan, type Segment } from "./layout";
import { buildBoxUVs, capFace, type UvRect } from "./uv";

const DEG = Math.PI / 180;
const CAPE_REST = 12;

export type PartKind = "inner" | "limb" | "limbJoint" | "outer" | "outerLimb" | "outerJoint";

export type Rig = {
  id: string;
  model: ModelType;
  root: Group;
  head: Group;
  body: Group;
  rShoulder: Group;
  rElbow: Group;
  lShoulder: Group;
  lElbow: Group;
  rHip: Group;
  rKnee: Group;
  lHip: Group;
  lKnee: Group;
  hipZ: number;
  parts: { mesh: Mesh; kind: PartKind }[];
  outlines: Mesh[];
  inner: MeshStandardMaterial;
  limb: MeshStandardMaterial;
  limbJoint: MeshStandardMaterial;
  outer: MeshStandardMaterial;
  outerLimb: MeshStandardMaterial;
  outerJoint: MeshStandardMaterial;
  toonInner: MeshToonMaterial;
  toonLimb: MeshToonMaterial;
  toonLimbJoint: MeshToonMaterial;
  toonOuter: MeshToonMaterial;
  toonOuterLimb: MeshToonMaterial;
  toonOuterJoint: MeshToonMaterial;
  outlineMat: MeshBasicMaterial;
  capeMat: MeshStandardMaterial;
  cape: Mesh;
  nametag: Mesh;
  bubble: Mesh;
  nameCanvas: HTMLCanvasElement;
  bubbleCanvas: HTMLCanvasElement;
  nameTex: CanvasTexture;
  bubbleTex: CanvasTexture;
  ring: Mesh;
  skinUrl: string;
  capeUrl: string | null;
  token: number;
  capeToken: number;
  texture: CanvasTexture | null;
  capeTexture: CanvasTexture | null;
  lastTag: string;
  lastBubble: string;
};

function cutout(outer: boolean, factor: number) {
  const material = new MeshStandardMaterial({
    roughness: 0.94,
    metalness: 0,
    side: FrontSide,
    transparent: outer,
    alphaTest: outer ? 0.5 : 0.15,
    depthWrite: true,
  });
  if (factor !== 0) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = factor;
    material.polygonOffsetUnits = factor;
  }
  return material;
}

function toon(gradient: Texture, outer: boolean, factor: number) {
  const material = new MeshToonMaterial({
    gradientMap: gradient,
    side: FrontSide,
    transparent: outer,
    alphaTest: outer ? 0.5 : 0.15,
  });
  if (factor !== 0) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = factor;
    material.polygonOffsetUnits = factor;
  }
  return material;
}

function placeBox(
  parent: Group,
  rig: Pick<Rig, "parts" | "outlines" | "outlineMat">,
  segment: Segment,
  uv: UvRect,
  material: Material,
  kind: PartKind,
  cap?: { face: number; px: number; py: number },
) {
  const geometry = new BoxGeometry(segment.size[0], segment.size[1], segment.size[2]);
  const uvs = buildBoxUVs(uv);
  if (cap) capFace(uvs, cap.face, cap.px, cap.py, uv.texW, uv.texH);
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  const mesh = new Mesh(geometry, material);
  mesh.position.set(segment.center[0], segment.center[1], segment.center[2]);
  mesh.castShadow = kind === "inner" || kind === "limb";
  parent.add(mesh);
  rig.parts.push({ mesh, kind });
  if (kind === "inner" || kind === "limb" || kind === "limbJoint") {
    const outline = new Mesh(geometry, rig.outlineMat);
    outline.position.copy(mesh.position);
    outline.scale.setScalar(1.045);
    outline.castShadow = false;
    outline.visible = false;
    parent.add(outline);
    rig.outlines.push(outline);
  }
  return mesh;
}

function limbUvs(origin: { u: number; v: number; w: number; d: number }, side: number): UvRect {
  return { u: origin.u, v: origin.v, w: origin.w, h: 6, d: origin.d, texW: 64, texH: 64, side };
}

function jointTexel(origin: { u: number; v: number; w: number; d: number }, row: number) {
  return { px: origin.u + origin.d + Math.min(origin.w - 1, Math.floor(origin.w / 2)), py: origin.v + origin.d + row };
}

function addLimb(
  skin: Group,
  rig: Pick<Rig, "parts" | "outlines" | "outlineMat">,
  plan: LimbPlan,
  limb: MeshStandardMaterial,
  limbJoint: MeshStandardMaterial,
  shell: MeshStandardMaterial,
  shellJoint: MeshStandardMaterial,
) {
  const pivot = new Group();
  pivot.position.set(plan.pivot[0], plan.pivot[1], plan.pivot[2]);
  skin.add(pivot);
  const joint = new Group();
  joint.position.set(plan.joint[0], plan.joint[1], plan.joint[2]);
  pivot.add(joint);
  const upperCap = jointTexel(plan.uv, 5);
  const lowerCap = jointTexel(plan.uv, 6);
  placeBox(pivot, rig, plan.upper, limbUvs(plan.uv, 0), limb, "limb", { face: 3, ...upperCap });
  placeBox(joint, rig, plan.lower, limbUvs(plan.uv, 6), limbJoint, "limbJoint", { face: 2, ...lowerCap });
  const upperOverlay = jointTexel(plan.overlay, 5);
  const lowerOverlay = jointTexel(plan.overlay, 6);
  placeBox(pivot, rig, plan.upperShell, limbUvs(plan.overlay, 0), shell, "outerLimb", { face: 3, ...upperOverlay });
  placeBox(joint, rig, plan.lowerShell, limbUvs(plan.overlay, 6), shellJoint, "outerJoint", { face: 2, ...lowerOverlay });
  return { pivot, joint };
}

export function buildRig(model: ModelType, gradient: Texture): Rig {
  const root = new Group();
  const skin = new Group();
  skin.position.y = 8;
  root.add(skin);

  const inner = cutout(false, 0);
  const limb = cutout(false, 1);
  const limbJoint = cutout(false, 1.5);
  const outer = cutout(true, -1);
  const outerLimb = cutout(true, -1);
  const outerJoint = cutout(true, -1.5);
  const toonInner = toon(gradient, false, 0);
  const toonLimb = toon(gradient, false, 1);
  const toonLimbJoint = toon(gradient, false, 1.5);
  const toonOuter = toon(gradient, true, -1);
  const toonOuterLimb = toon(gradient, true, -1);
  const toonOuterJoint = toon(gradient, true, -1.5);
  const outlineMat = new MeshBasicMaterial({ color: 0x14120f, side: BackSide });

  const rigBase = {
    parts: [] as Rig["parts"],
    outlines: [] as Mesh[],
    outlineMat,
  };

  const head = new Group();
  head.name = "head";
  skin.add(head);
  placeBox(head, rigBase, { size: [8, 8, 8], center: [0, 4, 0] }, { u: 0, v: 0, w: 8, h: 8, d: 8, texW: 64, texH: 64 }, inner, "inner");
  placeBox(head, rigBase, { size: [9, 9, 9], center: [0, 4, 0] }, { u: 32, v: 0, w: 8, h: 8, d: 8, texW: 64, texH: 64 }, outer, "outer");

  const body = new Group();
  body.name = "body";
  body.position.y = -6;
  skin.add(body);
  placeBox(body, rigBase, { size: [8, 12, 4], center: [0, 0, 0] }, { u: 16, v: 16, w: 8, h: 12, d: 4, texW: 64, texH: 64 }, inner, "inner");
  placeBox(body, rigBase, { size: [8.5, 12.5, 4.5], center: [0, 0, 0] }, { u: 16, v: 32, w: 8, h: 12, d: 4, texW: 64, texH: 64 }, outer, "outer");

  const plans = planLimbs(model);
  const byId = Object.fromEntries(plans.map((plan) => [plan.id, plan])) as Record<LimbPlan["id"], LimbPlan>;
  const right = addLimb(skin, rigBase, byId.rightArm, limb, limbJoint, outerLimb, outerJoint);
  const left = addLimb(skin, rigBase, byId.leftArm, limb, limbJoint, outerLimb, outerJoint);
  const rightLeg = addLimb(skin, rigBase, byId.rightLeg, limb, limbJoint, outerLimb, outerJoint);
  const leftLeg = addLimb(skin, rigBase, byId.leftLeg, limb, limbJoint, outerLimb, outerJoint);

  const capeGeo = new BoxGeometry(10, 16, 1);
  capeGeo.setAttribute("uv", new BufferAttribute(buildBoxUVs({ u: 0, v: 0, w: 10, h: 16, d: 1, texW: 64, texH: 32 }), 2));
  const capeMat = new MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    side: DoubleSide,
    transparent: true,
    alphaTest: 0.4,
    depthWrite: true,
  });
  const cape = new Mesh(capeGeo, capeMat);
  // Outside pattern is the -Z face. Yaw 180 so that face points away from the back,
  // matching skinview3d. The center sits against the torso (body back is z = -2).
  cape.position.set(0, -2, -2.5);
  cape.rotation.y = Math.PI;
  cape.rotation.x = CAPE_REST * DEG;
  cape.visible = false;
  cape.castShadow = true;
  body.add(cape);

  const nameCanvas = document.createElement("canvas");
  nameCanvas.width = 512;
  nameCanvas.height = 128;
  const bubbleCanvas = document.createElement("canvas");
  bubbleCanvas.width = 512;
  bubbleCanvas.height = 192;
  const nameTex = new CanvasTexture(nameCanvas);
  const bubbleTex = new CanvasTexture(bubbleCanvas);
  nameTex.colorSpace = SRGBColorSpace;
  bubbleTex.colorSpace = SRGBColorSpace;
  const nametag = new Mesh(
    new PlaneGeometry(18, 4.5),
    new MeshBasicMaterial({ map: nameTex, transparent: true, depthWrite: false }),
  );
  nametag.position.set(0, 20, 0);
  nametag.visible = false;
  root.add(nametag);
  const bubble = new Mesh(
    new PlaneGeometry(16, 6),
    new MeshBasicMaterial({ map: bubbleTex, transparent: true, depthWrite: false }),
  );
  bubble.position.set(11, 16, 0);
  bubble.visible = false;
  root.add(bubble);

  const ring = new Mesh(
    new RingGeometry(6.2, 6.7, 48),
    new MeshBasicMaterial({ color: 0x2f6fed, side: DoubleSide, transparent: true, opacity: 0.95 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -16.02;
  root.add(ring);

  const contact = new Mesh(
    new CircleGeometry(5.2, 28),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -16.05;
  root.add(contact);

  return {
    id: "",
    model,
    root,
    head,
    body,
    rShoulder: right.pivot,
    rElbow: right.joint,
    lShoulder: left.pivot,
    lElbow: left.joint,
    rHip: rightLeg.pivot,
    rKnee: rightLeg.joint,
    lHip: leftLeg.pivot,
    lKnee: leftLeg.joint,
    hipZ: byId.rightLeg.pivot[2],
    parts: rigBase.parts,
    outlines: rigBase.outlines,
    inner,
    limb,
    limbJoint,
    outer,
    outerLimb,
    outerJoint,
    toonInner,
    toonLimb,
    toonLimbJoint,
    toonOuter,
    toonOuterLimb,
    toonOuterJoint,
    outlineMat,
    capeMat,
    cape,
    nametag,
    bubble,
    nameCanvas,
    bubbleCanvas,
    nameTex,
    bubbleTex,
    ring,
    skinUrl: "",
    capeUrl: null,
    token: 0,
    capeToken: 0,
    texture: null,
    capeTexture: null,
    lastTag: "",
    lastBubble: "",
  };
}

export function applyJoints(
  rig: Rig,
  joints: Joints,
  x: number,
  extra: { bob: number; sway: number; roll: number; cape: number },
) {
  rig.head.rotation.set(joints.headX * DEG, joints.headY * DEG, 0);
  rig.body.rotation.set(joints.bodyX * DEG, 0, 0);
  rig.rShoulder.rotation.set(joints.rArmX * DEG, 0, joints.rArmZ * DEG);
  rig.rElbow.rotation.set(joints.rElbow * DEG, 0, 0);
  rig.lShoulder.rotation.set(joints.lArmX * DEG, 0, joints.lArmZ * DEG);
  rig.lElbow.rotation.set(joints.lElbow * DEG, 0, 0);
  rig.rHip.rotation.set(joints.rLegX * DEG, 0, 0);
  rig.rKnee.rotation.set(joints.rKnee * DEG, 0, 0);
  rig.lHip.rotation.set(joints.lLegX * DEG, 0, 0);
  rig.lKnee.rotation.set(joints.lKnee * DEG, 0, 0);
  const seat = seatShift(joints);
  rig.rHip.position.z = rig.hipZ + seat.hipForward;
  rig.lHip.position.z = rig.hipZ + seat.hipForward;
  rig.root.rotation.set(0, 0, extra.roll * DEG);
  rig.root.position.set(x + extra.sway, seat.y + extra.bob, 0);
  rig.cape.rotation.x = (CAPE_REST + extra.cape) * DEG;
}

export function configureTexture(texture: CanvasTexture) {
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}
