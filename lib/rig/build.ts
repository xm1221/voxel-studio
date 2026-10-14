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

export type PartKind = "inner" | "limb" | "outer" | "outerLimb";

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
  outer: MeshStandardMaterial;
  outerLimb: MeshStandardMaterial;
  toonInner: MeshToonMaterial;
  toonLimb: MeshToonMaterial;
  toonOuter: MeshToonMaterial;
  toonOuterLimb: MeshToonMaterial;
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

function cutout(biased: boolean) {
  const material = new MeshStandardMaterial({
    roughness: 0.94,
    metalness: 0,
    side: FrontSide,
    alphaTest: 0,
  });
  if (biased) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
  }
  return material;
}

function toon(gradient: Texture, biased: boolean, outer: boolean) {
  const material = new MeshToonMaterial({
    gradientMap: gradient,
    side: FrontSide,
    alphaTest: outer ? 0.5 : 0,
  });
  if (biased) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
  }
  return material;
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
  const mesh = new Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = kind === "inner" || kind === "limb";
  parent.add(mesh);
  rig.parts.push({ mesh, kind });
  if (kind === "inner" || kind === "limb") {
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

  const inner = cutout(false);
  const limb = cutout(true);
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
  outerLimb.polygonOffsetFactor = -1;
  outerLimb.polygonOffsetUnits = -1;
  const toonInner = toon(gradient, false, false);
  const toonLimb = toon(gradient, true, false);
  const toonOuter = toon(gradient, false, true);
  const toonOuterLimb = toon(gradient, true, true);
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
    placeBox(elbow, rigBase, armW, ARM.lowerH, ARM.depth, { u, v, w: armW, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, limb, "limb", [0, ARM.lowerY, 0], {
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
      outerLimb,
      "outerLimb",
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
    placeBox(knee, rigBase, LEG.width, LEG.height, LEG.depth, { u, v, w: 4, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, limb, "limb", [0, LEG.lowerY, 0], {
      face: 2,
      ...lowerCap,
    });
    placeBox(knee, rigBase, 4.5, 6.35, 4.5, { u: 0, v: ov, w: 4, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, outerLimb, "outerLimb", [0, LEG.lowerY, 0], {
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
    outer,
    outerLimb,
    toonInner,
    toonLimb,
    toonOuter,
    toonOuterLimb,
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
