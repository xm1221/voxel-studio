import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
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
import type { AnimationDef, Joints, ModelType, PlayerDraft } from "../types";
import { createBentBox, deformBend } from "./bend";
import { ARM, LEG, SIT_DROP, isSitting } from "./layout";
import type { BendJoint } from "./layers";
import { buildBoxUVs, capFace, type UvRect } from "./uv";

const DEG = Math.PI / 180;
/** Same rest tilt skinview3d uses for a vanilla cape (about 10.8°). */
const CAPE_REST = 10.8;

export type PartKind = "inner" | "limb" | "limbLower" | "outer" | "outerLimb" | "outerLimbLower" | "voxel";

export type Bend = {
  geometry: BufferGeometry;
  pivotY: number;
  joint: BendJoint;
  source: "limb" | "voxel";
};

export type Rig = {
  id: string;
  model: ModelType;
  root: Group;
  head: Group;
  body: Group;
  rShoulder: Group;
  rElbow: Group;
  rArm: Group;
  lShoulder: Group;
  lElbow: Group;
  lArm: Group;
  rHip: Group;
  rKnee: Group;
  lHip: Group;
  lKnee: Group;
  parts: { mesh: Mesh; kind: PartKind }[];
  bends: Bend[];
  voxels: Mesh[];
  outlines: Mesh[];
  inner: MeshStandardMaterial;
  limb: MeshStandardMaterial;
  limbLower: MeshStandardMaterial;
  outer: MeshStandardMaterial;
  outerLimb: MeshStandardMaterial;
  outerLimbLower: MeshStandardMaterial;
  toonInner: MeshToonMaterial;
  toonLimb: MeshToonMaterial;
  toonLimbLower: MeshToonMaterial;
  toonOuter: MeshToonMaterial;
  toonOuterLimb: MeshToonMaterial;
  toonOuterLimbLower: MeshToonMaterial;
  voxel: MeshStandardMaterial;
  toonVoxel: MeshToonMaterial;
  outlineMat: MeshBasicMaterial;
  capeMat: MeshStandardMaterial;
  /** Pivot on the body's back top edge. The cloth mesh hangs from it. */
  cape: Group;
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
  clipTime: number;
  lastClip: string;
  lastAnimation: AnimationDef | null;
};

function cutout(factor: number, units: number) {
  const material = new MeshStandardMaterial({
    roughness: 0.94,
    metalness: 0,
    side: FrontSide,
    alphaTest: 0,
  });
  if (factor !== 0 || units !== 0) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = factor;
    material.polygonOffsetUnits = units;
  }
  return material;
}

function toon(gradient: Texture, factor: number, units: number, outer: boolean) {
  const material = new MeshToonMaterial({
    gradientMap: gradient,
    side: FrontSide,
    alphaTest: outer ? 0.5 : 0,
  });
  if (factor !== 0 || units !== 0) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = factor;
    material.polygonOffsetUnits = units;
  }
  return material;
}

/** Pull a cut end inside the box so its lit edge is not a ring around the joint. */
function sinkJointCap(geometry: BoxGeometry, face: number) {
  const position = geometry.getAttribute("position");
  const start = face * 4;
  let ySum = 0;
  for (let i = 0; i < 4; i += 1) ySum += position.getY(start + i);
  const inward = ySum > 0 ? -0.55 : 0.55;
  for (let i = 0; i < 4; i += 1) {
    position.setXYZ(
      start + i,
      position.getX(start + i) * 0.62,
      position.getY(start + i) + inward,
      position.getZ(start + i) * 0.62,
    );
  }
  position.needsUpdate = true;
}

function placeBox(
  parent: Group,
  rig: Pick<Rig, "parts" | "outlines" | "outlineMat">,
  width: number,
  height: number,
  depth: number,
  uv: UvRect,
  material: Material,
  kind: PartKind,
  position: [number, number, number],
  cap?: { face: number; px: number; py: number },
) {
  const geometry = new BoxGeometry(width, height, depth);
  const uvs = buildBoxUVs(uv);
  if (cap) capFace(uvs, cap.face, cap.px, cap.py, uv.texW, uv.texH);
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  if (cap) sinkJointCap(geometry, cap.face);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  const skinned = kind === "inner" || kind === "limb" || kind === "limbLower";
  mesh.castShadow = skinned;
  parent.add(mesh);
  rig.parts.push({ mesh, kind });
  if (skinned) {
    const outline = new Mesh(geometry, rig.outlineMat);
    outline.position.copy(mesh.position);
    outline.scale.setScalar(1.05);
    outline.castShadow = false;
    outline.visible = false;
    parent.add(outline);
    rig.outlines.push(outline);
  }
}

export function buildRig(model: ModelType, gradient: Texture): Rig {
  const slim = model === "slim";
  const armW = slim ? 3 : 4;
  const assemblyX = slim ? 0.5 : 1;
  const root = new Group();
  const skin = new Group();
  skin.position.y = 8;
  root.add(skin);

  const inner = cutout(0, 0);
  // The two 6px halves share a cross-section for 0.35px. Same-depth sides flicker,
  // so the lower half is biased toward the camera and the upper half away from it.
  const limb = cutout(1, 1);
  const limbLower = cutout(-1, -1);
  const outer = new MeshStandardMaterial({
    roughness: 0.94,
    metalness: 0,
    side: FrontSide,
    transparent: true,
    alphaTest: 0.5,
    depthWrite: true,
  });
  const outerLimb = outer.clone();
  outerLimb.polygonOffset = true;
  outerLimb.polygonOffsetFactor = -2;
  outerLimb.polygonOffsetUnits = -2;
  const outerLimbLower = outer.clone();
  outerLimbLower.polygonOffset = true;
  outerLimbLower.polygonOffsetFactor = -4;
  outerLimbLower.polygonOffsetUnits = -4;
  const toonInner = toon(gradient, 0, 0, false);
  const toonLimb = toon(gradient, 1, 1, false);
  const toonLimbLower = toon(gradient, -1, -1, false);
  const toonOuter = toon(gradient, 0, 0, true);
  const toonOuterLimb = toon(gradient, -2, -2, true);
  const toonOuterLimbLower = toon(gradient, -4, -4, true);
  const voxel = new MeshStandardMaterial({
    roughness: 0.94,
    metalness: 0,
    side: FrontSide,
    alphaTest: 0.5,
  });
  const toonVoxel = toon(gradient, 0, 0, true);
  const outlineMat = new MeshBasicMaterial({ color: 0x14120f, side: BackSide });

  const rigBase = {
    parts: [] as Rig["parts"],
    outlines: [] as Mesh[],
    bends: [] as Bend[],
    outlineMat,
  };

  function placeBent(
    parent: Group,
    geometry: BufferGeometry,
    material: Material,
    kind: PartKind,
    joint: Bend["joint"],
    pivotY: number,
  ) {
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = kind === "limb";
    parent.add(mesh);
    rigBase.parts.push({ mesh, kind });
    rigBase.bends.push({ geometry, pivotY, joint, source: "limb" });
    if (kind === "limb") {
      const outline = new Mesh(geometry, rigBase.outlineMat);
      outline.castShadow = false;
      outline.visible = false;
      parent.add(outline);
      rigBase.outlines.push(outline);
    }
  }

  const head = new Group();
  head.name = "head";
  skin.add(head);
  placeBox(head, rigBase, 8, 8, 8, { u: 0, v: 0, w: 8, h: 8, d: 8, texW: 64, texH: 64 }, inner, "inner", [0, 4, 0]);
  placeBox(head, rigBase, 9, 9, 9, { u: 32, v: 0, w: 8, h: 8, d: 8, texW: 64, texH: 64 }, outer, "outer", [0, 4, 0]);

  const body = new Group();
  body.name = "body";
  body.position.y = -6;
  skin.add(body);
  placeBox(body, rigBase, 8, 12, 4, { u: 16, v: 16, w: 8, h: 12, d: 4, texW: 64, texH: 64 }, inner, "inner", [0, 0, 0]);
  placeBox(body, rigBase, 8.5, 12.5, 4.5, { u: 16, v: 32, w: 8, h: 12, d: 4, texW: 64, texH: 64 }, outer, "outer", [0, 0, 0]);

  const makeArm = (side: "right" | "left") => {
    const sign = side === "right" ? -1 : 1;
    const shoulder = new Group();
    shoulder.position.set(sign * ARM.shoulderX, ARM.shoulderY, 0);
    skin.add(shoulder);
    const assembly = new Group();
    assembly.position.x = sign * assemblyX;
    shoulder.add(assembly);
    const u = side === "right" ? 40 : 32;
    const v = side === "right" ? 16 : 48;
    const ou = side === "right" ? 40 : 48;
    const ov = side === "right" ? 32 : 48;
    const top = ARM.upperY + ARM.upperH / 2;
    const bottom = ARM.elbowY + ARM.lowerY - ARM.lowerH / 2;
    const joint = side === "right" ? "rElbow" : "lElbow";
    placeBent(assembly, createBentBox(armW, ARM.depth, top, bottom, { u, v, w: armW, h: 12, d: 4, texW: 64, texH: 64 }), limb, "limb", joint, ARM.elbowY);
    placeBent(
      assembly,
      createBentBox(armW + 0.5, 4.5, top + 0.2, bottom - 0.2, { u: ou, v: ov, w: armW, h: 12, d: 4, texW: 64, texH: 64 }),
      outerLimb,
      "outerLimb",
      joint,
      ARM.elbowY,
    );
    const elbow = new Group();
    elbow.position.y = ARM.elbowY;
    assembly.add(elbow);
    return { shoulder, elbow, assembly };
  };

  const right = makeArm("right");
  const left = makeArm("left");

  const makeLeg = (side: "right" | "left") => {
    const hip = new Group();
    hip.position.set(side === "right" ? -LEG.hipX : LEG.hipX, LEG.hipY, LEG.hipZ);
    skin.add(hip);
    const u = side === "right" ? 0 : 16;
    const v = side === "right" ? 16 : 48;
    const ov = side === "right" ? 32 : 48;
    const top = LEG.upperY + LEG.height / 2;
    const bottom = LEG.kneeY + LEG.lowerY - LEG.height / 2;
    const joint = side === "right" ? "rKnee" : "lKnee";
    placeBent(hip, createBentBox(LEG.width, LEG.depth, top, bottom, { u, v, w: 4, h: 12, d: 4, texW: 64, texH: 64 }), limb, "limb", joint, LEG.kneeY);
    placeBent(hip, createBentBox(4.5, 4.5, top + 0.2, bottom - 0.2, { u: 0, v: ov, w: 4, h: 12, d: 4, texW: 64, texH: 64 }), outerLimb, "outerLimb", joint, LEG.kneeY);
    const knee = new Group();
    knee.position.y = LEG.kneeY;
    hip.add(knee);
    return { hip, knee };
  };

  const rightLeg = makeLeg("right");
  const leftLeg = makeLeg("left");

  const capeGeo = new BoxGeometry(10, 16, 1);
  capeGeo.setAttribute("uv", new BufferAttribute(buildBoxUVs({ u: 0, v: 0, w: 10, h: 16, d: 1, texW: 64, texH: 32 }), 2));
  const capeMat = new MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    side: DoubleSide,
    transparent: true,
    alphaTest: 0.4,
  });
  const capeMesh = new Mesh(capeGeo, capeMat);
  // Box is centered, so y=-8 puts the pivot on the top edge and z=0.5 puts it on the inner face.
  capeMesh.position.set(0, -8, 0.5);
  capeMesh.castShadow = true;
  // Vanilla turns the cape 180° so the outside texture faces away from the body and the cloth
  // stays parallel to the back. Parenting to the body makes a torso lean carry the cape.
  const cape = new Group();
  cape.position.set(0, 6, -2);
  cape.rotation.order = "XYZ";
  cape.rotation.y = Math.PI;
  cape.rotation.x = CAPE_REST * DEG;
  cape.visible = false;
  cape.add(capeMesh);
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
  ring.position.y = -15.85;
  root.add(ring);

  const contact = new Mesh(
    new CircleGeometry(5.2, 28),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -15.92;
  root.add(contact);

  return {
    id: "",
    model,
    root,
    head,
    body,
    rShoulder: right.shoulder,
    rElbow: right.elbow,
    rArm: right.assembly,
    lShoulder: left.shoulder,
    lElbow: left.elbow,
    lArm: left.assembly,
    rHip: rightLeg.hip,
    rKnee: rightLeg.knee,
    lHip: leftLeg.hip,
    lKnee: leftLeg.knee,
    parts: rigBase.parts,
    bends: rigBase.bends,
    voxels: [],
    outlines: rigBase.outlines,
    inner,
    limb,
    limbLower,
    outer,
    outerLimb,
    outerLimbLower,
    toonInner,
    toonLimb,
    toonLimbLower,
    toonOuter,
    toonOuterLimb,
    toonOuterLimbLower,
    voxel,
    toonVoxel,
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
    clipTime: 0,
    lastClip: "",
    lastAnimation: null,
  };
}

export function applyJoints(
  rig: Rig,
  joints: Joints,
  x: number,
  extra: { bob: number; sway: number; roll: number; cape: number; yaw?: number },
  transform: Pick<PlayerDraft, "position" | "scale">,
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
  for (const bend of rig.bends) deformBend(bend.geometry, bend.pivotY, joints[bend.joint] * DEG);
  rig.root.rotation.set(0, extra.yaw ?? 0, extra.roll * DEG);
  rig.root.position.set(
    x + extra.sway + transform.position.x,
    (isSitting(joints) ? SIT_DROP : 0) + extra.bob + transform.position.y,
    transform.position.z,
  );
  rig.root.scale.setScalar(transform.scale);
  rig.cape.rotation.set((CAPE_REST + extra.cape) * DEG, Math.PI, 0);
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
