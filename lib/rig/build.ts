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
import { ARM, LEG, SIT_DROP, isSitting } from "./layout";
import { buildBoxUVs, capFace, type UvRect } from "./uv";

const DEG = Math.PI / 180;
const CAPE_REST = 12;

export type PartKind = "inner" | "limb" | "limbLower" | "outer" | "outerLimb" | "outerLimbLower";

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
  parts: { mesh: Mesh; kind: PartKind }[];
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

function capTexel(u: number, d: number, w: number, v: number, side: number) {
  return { px: u + d + w / 2 - 0.5, py: v + d + side + 2.5 };
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
  const outlineMat = new MeshBasicMaterial({ color: 0x14120f, side: BackSide });

  const rigBase = {
    parts: [] as Rig["parts"],
    outlines: [] as Mesh[],
    outlineMat,
  };

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
    const upperCap = capTexel(u, 4, armW, v, 0);
    const lowerCap = capTexel(u, 4, armW, v, 6);
    placeBox(assembly, rigBase, armW, ARM.upperH, ARM.depth, { u, v, w: armW, h: 6, d: 4, texW: 64, texH: 64 }, limb, "limb", [0, ARM.upperY, 0], {
      face: 3,
      ...upperCap,
    });
    placeBox(
      assembly,
      rigBase,
      armW + 0.5,
      6.35,
      4.5,
      { u: ou, v: ov, w: armW, h: 6, d: 4, texW: 64, texH: 64 },
      outerLimb,
      "outerLimb",
      [0, ARM.upperY, 0],
      { face: 3, ...upperCap },
    );
    const elbow = new Group();
    elbow.position.y = ARM.elbowY;
    assembly.add(elbow);
    placeBox(elbow, rigBase, armW, ARM.lowerH, ARM.depth, { u, v, w: armW, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, limbLower, "limbLower", [0, ARM.lowerY, 0], {
      face: 2,
      ...lowerCap,
    });
    placeBox(
      elbow,
      rigBase,
      armW + 0.5,
      6.35,
      4.5,
      { u: ou, v: ov, w: armW, h: 6, d: 4, side: 6, texW: 64, texH: 64 },
      outerLimbLower,
      "outerLimbLower",
      [0, ARM.lowerY, 0],
      { face: 2, ...lowerCap },
    );
    return { shoulder, elbow };
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
    const upperCap = capTexel(u, 4, 4, v, 0);
    const lowerCap = capTexel(u, 4, 4, v, 6);
    placeBox(hip, rigBase, LEG.width, LEG.height, LEG.depth, { u, v, w: 4, h: 6, d: 4, texW: 64, texH: 64 }, limb, "limb", [0, LEG.upperY, 0], {
      face: 3,
      ...upperCap,
    });
    placeBox(hip, rigBase, 4.5, 6.35, 4.5, { u: 0, v: ov, w: 4, h: 6, d: 4, texW: 64, texH: 64 }, outerLimb, "outerLimb", [0, LEG.upperY, 0], {
      face: 3,
      ...upperCap,
    });
    const knee = new Group();
    knee.position.y = LEG.kneeY;
    hip.add(knee);
    placeBox(knee, rigBase, LEG.width, LEG.height, LEG.depth, { u, v, w: 4, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, limbLower, "limbLower", [0, LEG.lowerY, 0], {
      face: 2,
      ...lowerCap,
    });
    placeBox(knee, rigBase, 4.5, 6.35, 4.5, { u: 0, v: ov, w: 4, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, outerLimbLower, "outerLimbLower", [0, LEG.lowerY, 0], {
      face: 2,
      ...lowerCap,
    });
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
  const cape = new Mesh(capeGeo, capeMat);
  cape.position.set(0, 4, -2.4);
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
    lShoulder: left.shoulder,
    lElbow: left.elbow,
    rHip: rightLeg.hip,
    rKnee: rightLeg.knee,
    lHip: leftLeg.hip,
    lKnee: leftLeg.knee,
    parts: rigBase.parts,
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
  rig.root.rotation.set(0, 0, extra.roll * DEG);
  rig.root.position.set(x + extra.sway, (isSitting(joints) ? SIT_DROP : 0) + extra.bob, 0);
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
