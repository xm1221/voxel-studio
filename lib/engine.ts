import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  BackSide,
  DoubleSide,
  Fog,
  FrontSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BackgroundId, CameraSnapshot, GradeId, Joints, LightId, ModelType, OutlineId, SceneDraft } from "./types";
import { loadImage, loadSkinToCanvas } from "./skin-image";

const DEG = Math.PI / 180;

type PartKind = "inner" | "limb" | "outer" | "outerLimb";

type Rig = {
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

function setUVs(
  box: BoxGeometry,
  u: number,
  v: number,
  width: number,
  height: number,
  depth: number,
  textureWidth: number,
  textureHeight: number,
  sideOffsetY = 0,
) {
  const toFace = (x1: number, y1: number, x2: number, y2: number) => [
    new Vector2(x1 / textureWidth, 1 - y2 / textureHeight),
    new Vector2(x2 / textureWidth, 1 - y2 / textureHeight),
    new Vector2(x2 / textureWidth, 1 - y1 / textureHeight),
    new Vector2(x1 / textureWidth, 1 - y1 / textureHeight),
  ];
  const top = toFace(u + depth, v, u + width + depth, v + depth);
  const bottom = toFace(u + width + depth, v, u + width * 2 + depth, v + depth);
  const sideY = v + depth + sideOffsetY;
  const left = toFace(u, sideY, u + depth, sideY + height);
  const front = toFace(u + depth, sideY, u + width + depth, sideY + height);
  const right = toFace(u + width + depth, sideY, u + width + depth * 2, sideY + height);
  const back = toFace(u + width + depth * 2, sideY, u + width * 2 + depth * 2, sideY + height);
  const order = [
    [right[3], right[2], right[0], right[1]],
    [left[3], left[2], left[0], left[1]],
    [top[3], top[2], top[0], top[1]],
    [bottom[0], bottom[1], bottom[3], bottom[2]],
    [front[3], front[2], front[0], front[1]],
    [back[3], back[2], back[0], back[1]],
  ];
  const data: number[] = [];
  for (const face of order) {
    for (const uv of face) data.push(uv.x, uv.y);
  }
  const attr = box.getAttribute("uv") as BufferAttribute;
  attr.set(new Float32Array(data));
  attr.needsUpdate = true;
}

function paintCap(box: BoxGeometry, face: number, u: number, v: number) {
  const attr = box.getAttribute("uv") as BufferAttribute;
  for (let i = 0; i < 4; i += 1) attr.setXY(face * 4 + i, u, v);
  attr.needsUpdate = true;
}

function cutoutMaterial(biased: boolean) {
  const material = new MeshStandardMaterial({
    roughness: 0.94,
    metalness: 0,
    side: FrontSide,
    alphaTest: biased ? 0 : 0,
  });
  if (biased) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
  }
  return material;
}

function toonMaterial(gradient: Texture, biased: boolean, outer: boolean) {
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

function addBox(
  parent: Object3D,
  rig: Pick<Rig, "parts" | "outlines" | "outlineMat">,
  width: number,
  height: number,
  depth: number,
  uv: { u: number; v: number; w: number; h: number; d: number; side: number; texW: number; texH: number },
  material: Material,
  kind: PartKind,
  position: [number, number, number],
  cap?: { face: number; u: number; v: number },
) {
  const geometry = new BoxGeometry(width, height, depth);
  setUVs(geometry, uv.u, uv.v, uv.w, uv.h, uv.d, uv.texW, uv.texH, uv.side);
  if (cap) paintCap(geometry, cap.face, cap.u, cap.v);
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
  return mesh;
}

function segmentCaps(u: number, v: number, w: number, d: number, side: number, texW: number, texH: number) {
  const px = (u + d + w / 2) / texW;
  const py = 1 - (v + d + side + 3) / texH;
  return { u: px, v: py };
}

function buildRig(model: ModelType, gradient: Texture): Rig {
  const slim = model === "slim";
  const armW = slim ? 3 : 4;
  const root = new Group();
  const skin = new Group();
  skin.position.y = 8;
  root.add(skin);

  const inner = cutoutMaterial(false);
  const limb = cutoutMaterial(true);
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
  const toonInner = toonMaterial(gradient, false, false);
  const toonLimb = toonMaterial(gradient, true, false);
  const toonOuter = toonMaterial(gradient, false, true);
  const toonOuterLimb = toonMaterial(gradient, true, true);
  const outlineMat = new MeshBasicMaterial({ color: 0x14120f, side: BackSide });

  const rigBase = {
    parts: [] as Rig["parts"],
    outlines: [] as Mesh[],
    outlineMat,
  };

  const head = new Group();
  head.name = "head";
  skin.add(head);
  addBox(head, rigBase, 8, 8, 8, { u: 0, v: 0, w: 8, h: 8, d: 8, side: 0, texW: 64, texH: 64 }, inner, "inner", [0, 4, 0]);
  addBox(head, rigBase, 9, 9, 9, { u: 32, v: 0, w: 8, h: 8, d: 8, side: 0, texW: 64, texH: 64 }, outer, "outer", [0, 4, 0]);

  const body = new Group();
  body.name = "body";
  body.position.y = -6;
  skin.add(body);
  addBox(body, rigBase, 8, 12, 4, { u: 16, v: 16, w: 8, h: 12, d: 4, side: 0, texW: 64, texH: 64 }, inner, "inner", [0, 0, 0]);
  addBox(body, rigBase, 8.5, 12.5, 4.5, { u: 16, v: 32, w: 8, h: 12, d: 4, side: 0, texW: 64, texH: 64 }, outer, "outer", [0, 0, 0]);

  const armX = slim ? 0.5 : 1;
  const makeArm = (side: "right" | "left") => {
    const shoulder = new Group();
    shoulder.position.set(side === "right" ? -5 : 5, -2, 0);
    skin.add(shoulder);
    const assembly = new Group();
    assembly.position.x = side === "right" ? -armX : armX;
    shoulder.add(assembly);
    const u = side === "right" ? 40 : 32;
    const v = side === "right" ? 16 : 48;
    const ou = side === "right" ? 40 : 48;
    const ov = side === "right" ? 32 : 48;
    const upperCap = segmentCaps(u, v, armW, 4, 0, 64, 64);
    const lowerCap = segmentCaps(u, v, armW, 4, 6, 64, 64);
    addBox(assembly, rigBase, armW, 6, 4, { u, v, w: armW, h: 6, d: 4, side: 0, texW: 64, texH: 64 }, limb, "limb", [0, -1, 0], {
      face: 3,
      u: upperCap.u,
      v: upperCap.v,
    });
    addBox(assembly, rigBase, armW + 0.5, 6.35, 4.5, { u: ou, v: ov, w: armW, h: 6, d: 4, side: 0, texW: 64, texH: 64 }, outerLimb, "outerLimb", [0, -1, 0], {
      face: 3,
      u: upperCap.u,
      v: upperCap.v,
    });
    const elbow = new Group();
    elbow.position.y = -3.65;
    assembly.add(elbow);
    addBox(elbow, rigBase, armW, 6, 4, { u, v, w: armW, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, limb, "limb", [0, -3, 0], {
      face: 2,
      u: lowerCap.u,
      v: lowerCap.v,
    });
    addBox(elbow, rigBase, armW + 0.5, 6.35, 4.5, { u: ou, v: ov, w: armW, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, outerLimb, "outerLimb", [0, -3, 0], {
      face: 2,
      u: lowerCap.u,
      v: lowerCap.v,
    });
    return { shoulder, elbow };
  };

  const right = makeArm("right");
  const left = makeArm("left");

  const makeLeg = (side: "right" | "left") => {
    const hip = new Group();
    hip.position.set(side === "right" ? -1.9 : 1.9, -12, -0.1);
    skin.add(hip);
    const u = side === "right" ? 0 : 16;
    const v = side === "right" ? 16 : 48;
    const ou = side === "right" ? 0 : 0;
    const ov = side === "right" ? 32 : 48;
    const upperCap = segmentCaps(u, v, 4, 4, 0, 64, 64);
    const lowerCap = segmentCaps(u, v, 4, 4, 6, 64, 64);
    addBox(hip, rigBase, 4, 6, 4, { u, v, w: 4, h: 6, d: 4, side: 0, texW: 64, texH: 64 }, limb, "limb", [0, -3, 0], {
      face: 3,
      u: upperCap.u,
      v: upperCap.v,
    });
    addBox(hip, rigBase, 4.5, 6.35, 4.5, { u: ou, v: ov, w: 4, h: 6, d: 4, side: 0, texW: 64, texH: 64 }, outerLimb, "outerLimb", [0, -3, 0], {
      face: 3,
      u: upperCap.u,
      v: upperCap.v,
    });
    const knee = new Group();
    knee.position.y = -5.65;
    hip.add(knee);
    addBox(knee, rigBase, 4, 6, 4, { u, v, w: 4, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, limb, "limb", [0, -3, 0], {
      face: 2,
      u: lowerCap.u,
      v: lowerCap.v,
    });
    addBox(knee, rigBase, 4.5, 6.35, 4.5, { u: ou, v: ov, w: 4, h: 6, d: 4, side: 6, texW: 64, texH: 64 }, outerLimb, "outerLimb", [0, -3, 0], {
      face: 2,
      u: lowerCap.u,
      v: lowerCap.v,
    });
    return { hip, knee };
  };

  const rightLeg = makeLeg("right");
  const leftLeg = makeLeg("left");

  const capeGeo = new BoxGeometry(10, 16, 1);
  setUVs(capeGeo, 0, 0, 10, 16, 1, 64, 32);
  const capeMat = new MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    side: DoubleSide,
    transparent: true,
    alphaTest: 0.4,
  });
  const cape = new Mesh(capeGeo, capeMat);
  cape.position.set(0, 4, -2.4);
  cape.rotation.x = 12 * DEG;
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
    new MeshBasicMaterial({ color: 0xe8a15a, side: DoubleSide, transparent: true, opacity: 0.95 }),
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

function applyJoints(rig: Rig, joints: Joints, x: number) {
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
  const sitting = joints.rLegX < -50 && joints.lLegX < -50 && joints.rKnee > 45 && joints.lKnee > 45;
  rig.root.position.set(x, sitting ? -6 : 0, 0);
}

function drawTag(canvas: HTMLCanvasElement, text: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "600 64px Outfit, 'WenQuanYi Micro Hei', sans-serif";
  const width = Math.min(context.measureText(text).width, 460);
  const boxW = width + 48;
  const boxH = 84;
  const x = (canvas.width - boxW) / 2;
  const y = 22;
  context.fillStyle = "rgba(12, 12, 14, 0.55)";
  context.fillRect(x, y, boxW, boxH);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, y + boxH / 2, 460);
}

function drawBubble(canvas: HTMLCanvasElement, text: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f6f1e7";
  roundRect(context, 16, 12, 480, 120, 28);
  context.beginPath();
  context.moveTo(46, 132);
  context.lineTo(28, 176);
  context.lineTo(92, 132);
  context.fill();
  context.fillStyle = "#1c1915";
  context.font = "600 42px Outfit, 'WenQuanYi Micro Hei', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 72, 440);
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
  context.fill();
}

function pixelTexture(paint: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画布不可用。");
  paint(context);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function speck(context: CanvasRenderingContext2D, base: string, colors: string[], salt: number) {
  context.fillStyle = base;
  context.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 28; i += 1) {
    const n = Math.abs(Math.sin((i + 1) * salt) * 10000);
    context.fillStyle = colors[i % colors.length];
    context.fillRect(Math.floor(n % 16), Math.floor((n * 1.7) % 16), 1, 1);
  }
}

const LIGHTS: Record<LightId, { key: number; fill: number; rim: number; keyColor: number; fillColor: number; rimColor: number; hemi: number }> = {
  soft: { key: 2.35, fill: 0.85, rim: 1.45, keyColor: 0xfff1dc, fillColor: 0xc9d6ff, rimColor: 0xffe2c4, hemi: 0.62 },
  hard: { key: 3.5, fill: 0.28, rim: 1.9, keyColor: 0xffffff, fillColor: 0x9eb0d1, rimColor: 0xfff6ea, hemi: 0.34 },
  neon: { key: 2.5, fill: 1.35, rim: 2.3, keyColor: 0xff4fd8, fillColor: 0x3de1ff, rimColor: 0xb388ff, hemi: 0.28 },
  moon: { key: 1.85, fill: 0.4, rim: 1.55, keyColor: 0xd5e4ff, fillColor: 0x1b3b6a, rimColor: 0xf4f8ff, hemi: 0.22 },
};

const BACKGROUNDS: Record<Exclude<BackgroundId, "none">, number> = {
  studio: 0x14161c,
  noon: 0x79b4ea,
  sunset: 0xe08a52,
  night: 0x0d1424,
  nether: 0x401512,
};

export class StudioEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly rigs = new Map<string, Rig>();
  private readonly holder: Group = new Group();
  private readonly key: DirectionalLight;
  private readonly fill: DirectionalLight;
  private readonly rim: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly shadowFloor: Mesh;
  private readonly studioFloor: Mesh;
  private readonly grass: Group;
  private readonly nether: Group;
  private readonly rays: Group;
  private readonly rayMat: MeshBasicMaterial;
  private readonly gradient: Texture;
  private frame = 0;
  private observer: ResizeObserver;
  private backgroundColor = new Color(BACKGROUNDS.studio);

  constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.inset = "0";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.setAttribute("aria-label", "皮肤预览");
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(32, 1, 0.1, 400);
    this.camera.position.set(26, 10, 64);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 180;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.update();

    this.scene.add(this.holder);
    this.hemi = new HemisphereLight(0xfff6ec, 0x241c18, 0.62);
    this.scene.add(this.hemi);
    this.scene.add(new AmbientLight(0xffffff, 0.18));
    this.key = new DirectionalLight(0xfff1dc, 2.35);
    this.key.position.set(28, 52, 34);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.scene.add(this.key, this.key.target);
    this.fill = new DirectionalLight(0xc9d6ff, 0.85);
    this.fill.position.set(-36, 18, 28);
    this.scene.add(this.fill);
    this.rim = new DirectionalLight(0xffe2c4, 1.45);
    this.rim.position.set(-8, 26, -42);
    this.scene.add(this.rim);

    this.shadowFloor = new Mesh(
      new PlaneGeometry(220, 220),
      new ShadowMaterial({ opacity: 0.38 }),
    );
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = -15.9;
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);

    const studioMap = pixelTexture((context) => {
      const gradient = context.createRadialGradient(8, 8, 1, 8, 8, 8);
      gradient.addColorStop(0, "#3a342c");
      gradient.addColorStop(1, "#14161c");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 16, 16);
    });
    studioMap.magFilter = NearestFilter;
    this.studioFloor = new Mesh(
      new CircleGeometry(78, 64),
      new MeshStandardMaterial({ map: studioMap, roughness: 1, metalness: 0 }),
    );
    this.studioFloor.rotation.x = -Math.PI / 2;
    this.studioFloor.position.y = -16;
    this.studioFloor.receiveShadow = true;
    this.scene.add(this.studioFloor);

    const grassTop = pixelTexture((context) => speck(context, "#5d9b3a", ["#6eaf45", "#4e852f", "#87c85a"], 2.2));
    const grassSide = pixelTexture((context) => {
      speck(context, "#8a5a32", ["#6d4524", "#a56b3e"], 4.4);
      context.fillStyle = "#5d9b3a";
      context.fillRect(0, 0, 16, 4);
    });
    const dirt = pixelTexture((context) => speck(context, "#8a5a32", ["#6d4524", "#a56b3e", "#c98958"], 6.1));
    this.grass = this.blockPlatform([grassSide, grassSide, grassTop, dirt, grassSide, grassSide]);
    this.grass.visible = false;
    this.scene.add(this.grass);

    const netherSide = pixelTexture((context) => speck(context, "#6a2420", ["#8d332c", "#4d1614", "#c45a3a"], 8.2));
    const netherTop = pixelTexture((context) => speck(context, "#7a2c24", ["#a14332", "#511814"], 3.3));
    this.nether = this.blockPlatform([netherSide, netherSide, netherTop, netherSide, netherSide, netherSide]);
    this.nether.visible = false;
    this.scene.add(this.nether);

    this.rayMat = new MeshBasicMaterial({
      color: 0xfff0d2,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.rays = new Group();
    for (let i = 0; i < 7; i += 1) {
      const ray = new Mesh(new PlaneGeometry(5.5, 78), this.rayMat);
      ray.position.set(-20 + i * 7, 28, -6);
      ray.rotation.z = -0.22 + i * 0.06;
      this.rays.add(ray);
    }
    this.rays.visible = false;
    this.scene.add(this.rays);

    const gradientCanvas = document.createElement("canvas");
    gradientCanvas.width = 4;
    gradientCanvas.height = 1;
    const gradientContext = gradientCanvas.getContext("2d");
    if (gradientContext) {
      const image = gradientContext.createImageData(4, 1);
      [70, 130, 190, 255].forEach((value, index) => {
        image.data[index * 4] = value;
        image.data[index * 4 + 1] = value;
        image.data[index * 4 + 2] = value;
        image.data[index * 4 + 3] = 255;
      });
      gradientContext.putImageData(image, 0, 0);
    }
    this.gradient = new CanvasTexture(gradientCanvas);
    this.gradient.magFilter = NearestFilter;
    this.gradient.minFilter = NearestFilter;

    this.resize = this.resize.bind(this);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize();
    this.loop();
  }

  private blockPlatform(maps: Texture[]) {
    const group = new Group();
    const materials = maps.map(
      (map) => new MeshStandardMaterial({ map, roughness: 1, metalness: 0 }),
    );
    for (let x = -3; x <= 3; x += 1) {
      for (let z = -3; z <= 3; z += 1) {
        const block = new Mesh(new BoxGeometry(16, 16, 16), materials);
        block.position.set(x * 16, -24, z * 16);
        block.receiveShadow = true;
        block.castShadow = false;
        group.add(block);
      }
    }
    return group;
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    this.controls.update();
    for (const rig of this.rigs.values()) {
      rig.nametag.quaternion.copy(this.camera.quaternion);
      rig.bubble.quaternion.copy(this.camera.quaternion);
    }
    this.renderer.render(this.scene, this.camera);
  };

  resize = () => {
    const canvas = this.renderer.domElement;
    const width = canvas.parentElement?.clientWidth ?? 1;
    const height = canvas.parentElement?.clientHeight ?? 1;
    if (width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  sync(draft: SceneDraft) {
    const ids = new Set(draft.players.map((player) => player.id));
    for (const [id, rig] of this.rigs) {
      if (ids.has(id)) continue;
      this.disposeRig(rig);
      this.holder.remove(rig.root);
      this.rigs.delete(id);
    }

    draft.players.forEach((player, index) => {
      let rig = this.rigs.get(player.id);
      if (!rig || rig.model !== player.model) {
        if (rig) {
          this.disposeRig(rig);
          this.holder.remove(rig.root);
          this.rigs.delete(player.id);
        }
        rig = buildRig(player.model, this.gradient);
        rig.id = player.id;
        this.holder.add(rig.root);
        this.rigs.set(player.id, rig);
      }
      const x = (index - (draft.players.length - 1) / 2) * 22;
      applyJoints(rig, player.joints, x);
      rig.ring.visible = player.id === draft.activeId;
      this.applyLook(rig, draft.grade, draft.outline, draft.showOuter);
      this.applyLabels(rig, player.nametag, player.bubble);
      if (player.skinUrl && rig.skinUrl !== player.skinUrl) {
        const token = ++rig.token;
        rig.skinUrl = player.skinUrl;
        void this.applySkin(rig, player.skinUrl, token);
      }
      rig.cape.visible = Boolean(player.capeUrl && player.showCape);
      if (player.capeUrl !== rig.capeUrl) {
        rig.capeUrl = player.capeUrl;
        if (player.capeUrl) {
          const token = ++rig.capeToken;
          void this.applyCape(rig, player.capeUrl, token);
        }
      }
    });

    this.applyWorld(draft);
  }

  private applyLook(rig: Rig, grade: GradeId, outline: OutlineId, showOuter: boolean) {
    const comic = grade === "comic";
    const materialFor = (kind: PartKind) => {
      if (kind === "inner") return comic ? rig.toonInner : rig.inner;
      if (kind === "limb") return comic ? rig.toonLimb : rig.limb;
      if (kind === "outer") return comic ? rig.toonOuter : rig.outer;
      return comic ? rig.toonOuterLimb : rig.outerLimb;
    };
    for (const part of rig.parts) {
      part.mesh.material = materialFor(part.kind);
      part.mesh.visible = showOuter || part.kind === "inner" || part.kind === "limb";
    }
    const standards = [rig.inner, rig.limb, rig.outer, rig.outerLimb];
    for (const material of standards) {
      material.color.set(grade === "hologram" ? 0x9af6ff : grade === "ice" ? 0xd9f4ff : 0xffffff);
      material.emissive.set(grade === "hologram" ? 0x1c6cff : grade === "ice" ? 0x7ec8ea : 0x000000);
      material.emissiveIntensity = grade === "hologram" ? 0.85 : grade === "ice" ? 0.35 : 0;
      material.emissiveMap = grade === "hologram" || grade === "ice" ? material.map : null;
      material.roughness = grade === "ice" ? 0.18 : grade === "hologram" ? 0.28 : 0.94;
      if (grade === "hologram") {
        material.transparent = true;
        material.opacity = 0.86;
        material.alphaTest = 0.05;
      } else if (material === rig.outer || material === rig.outerLimb) {
        material.transparent = true;
        material.opacity = 1;
        material.alphaTest = 0.5;
      } else {
        material.transparent = false;
        material.opacity = 1;
        material.alphaTest = 0;
      }
      material.needsUpdate = true;
    }
    const scale = outline === "sticker" ? 1.14 : outline === "ink" ? 1.055 : 1;
    rig.outlineMat.color.set(outline === "sticker" ? 0xf7f4ee : 0x16130f);
    rig.outlineMat.visible = outline !== "none";
    for (const mesh of rig.outlines) {
      mesh.visible = outline !== "none";
      mesh.scale.setScalar(scale);
    }
  }

  private applyLabels(rig: Rig, nametag: string, bubble: string) {
    const tag = nametag.trim();
    const line = bubble.trim();
    rig.nametag.visible = tag.length > 0;
    rig.bubble.visible = line.length > 0;
    if (tag !== rig.lastTag) {
      rig.lastTag = tag;
      if (tag) {
        drawTag(rig.nameCanvas, tag);
        rig.nameTex.needsUpdate = true;
        const width = Math.min(28, 8 + tag.length * 1.7);
        rig.nametag.scale.set(width / 18, 1, 1);
      }
    }
    if (line !== rig.lastBubble) {
      rig.lastBubble = line;
      if (line) {
        drawBubble(rig.bubbleCanvas, line);
        rig.bubbleTex.needsUpdate = true;
      }
    }
  }

  private async applySkin(rig: Rig, url: string, token: number) {
    try {
      const image = await loadImage(url);
      if (rig.token !== token) return;
      const canvas = document.createElement("canvas");
      loadSkinToCanvas(canvas, image);
      this.bindTexture(rig, canvas);
    } catch {
      // Keep the url so a bad file does not retry every frame.
    }
  }

  private bindTexture(rig: Rig, canvas: HTMLCanvasElement) {
    if (!rig.texture) {
      rig.texture = new CanvasTexture(canvas);
      rig.texture.magFilter = NearestFilter;
      rig.texture.minFilter = NearestFilter;
      rig.texture.generateMipmaps = false;
      rig.texture.colorSpace = SRGBColorSpace;
    } else {
      rig.texture.image = canvas;
    }
    rig.texture.needsUpdate = true;
    for (const material of [rig.inner, rig.limb, rig.outer, rig.outerLimb, rig.toonInner, rig.toonLimb, rig.toonOuter, rig.toonOuterLimb]) {
      material.map = rig.texture;
      if (material.emissiveMap) material.emissiveMap = rig.texture;
      material.needsUpdate = true;
    }
  }

  private async applyCape(rig: Rig, url: string, token: number) {
    try {
      const image = await loadImage(url);
      if (rig.capeToken !== token) return;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0);
      if (!rig.capeTexture) {
        rig.capeTexture = new CanvasTexture(canvas);
        rig.capeTexture.magFilter = NearestFilter;
        rig.capeTexture.minFilter = NearestFilter;
        rig.capeTexture.colorSpace = SRGBColorSpace;
      } else {
        rig.capeTexture.image = canvas;
      }
      rig.capeTexture.needsUpdate = true;
      rig.capeMat.map = rig.capeTexture;
      rig.capeMat.needsUpdate = true;
    } catch {
      if (rig.capeToken === token) rig.cape.visible = false;
    }
  }

  private applyWorld(draft: SceneDraft) {
    const preset = LIGHTS[draft.light];
    const gain = draft.keyIntensity;
    this.key.intensity = preset.key * gain;
    this.fill.intensity = preset.fill;
    this.rim.intensity = preset.rim;
    this.key.color.set(preset.keyColor);
    this.fill.color.set(preset.fillColor);
    this.rim.color.set(preset.rimColor);
    this.hemi.intensity = preset.hemi;
    this.hemi.color.set(draft.light === "moon" ? 0xb7c8e6 : draft.light === "neon" ? 0xffd0f5 : 0xfff6ec);
    const span = 36 + draft.players.length * 16;
    const shadow = this.key.shadow.camera;
    shadow.left = -span;
    shadow.right = span;
    shadow.top = span;
    shadow.bottom = -span;
    shadow.near = 8;
    shadow.far = 180;
    shadow.updateProjectionMatrix();

    const color = draft.background === "none" ? null : BACKGROUNDS[draft.background];
    if (color == null) {
      this.scene.background = null;
      this.scene.fog = null;
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.backgroundColor.set(color);
      this.scene.background = this.backgroundColor;
      this.scene.fog = draft.background === "studio" ? null : new Fog(color, 80, 230);
      this.renderer.setClearColor(color, 1);
    }
    this.studioFloor.visible = draft.background === "studio";
    this.grass.visible = draft.background === "noon" || draft.background === "sunset" || draft.background === "night";
    this.nether.visible = draft.background === "nether";
    this.shadowFloor.visible = true;
    (this.shadowFloor.material as ShadowMaterial).opacity = draft.background === "none" ? 0.45 : 0.28;
    this.rays.visible = draft.godrays && draft.background !== "none";
    this.rayMat.color.set(draft.background === "night" || draft.light === "moon" ? 0xc5d7ff : draft.background === "nether" ? 0xff7844 : 0xfff0d0);
    this.rayMat.opacity = draft.background === "noon" ? 0.07 : 0.11;
  }

  frameBody(count: number) {
    const distance = Math.max(64, 46 + count * 16);
    this.camera.position.set(distance * 0.38, 9, distance);
    this.controls.target.set(0, 2, 0);
    this.controls.update();
  }

  frameHead() {
    this.camera.position.set(0, 16, 34);
    this.controls.target.set(0, 12, 0);
    this.controls.update();
  }

  getCamera(): CameraSnapshot {
    const p = this.camera.position;
    const t = this.controls.target;
    return { p: [p.x, p.y, p.z], t: [t.x, t.y, t.z] };
  }

  setCamera(snapshot: CameraSnapshot) {
    this.camera.position.set(snapshot.p[0], snapshot.p[1], snapshot.p[2]);
    this.controls.target.set(snapshot.t[0], snapshot.t[1], snapshot.t[2]);
    this.controls.update();
  }

  async capture(options: { width: number; height: number; round: boolean; transparent: boolean }) {
    const parent = this.renderer.domElement.parentElement;
    const viewW = parent?.clientWidth ?? this.renderer.domElement.width;
    const viewH = parent?.clientHeight ?? this.renderer.domElement.height;
    const ratio = this.renderer.getPixelRatio();
    const background = this.scene.background;
    const fog = this.scene.fog;
    const studio = this.studioFloor.visible;
    const grass = this.grass.visible;
    const nether = this.nether.visible;
    const rays = this.rays.visible;
    const shadowOpacity = (this.shadowFloor.material as ShadowMaterial).opacity;
    const sample = Math.max(options.width, options.height) <= 2048 ? 2 : 1;

    if (options.transparent) {
      this.scene.background = null;
      this.scene.fog = null;
      this.studioFloor.visible = false;
      this.grass.visible = false;
      this.nether.visible = false;
      this.rays.visible = false;
      (this.shadowFloor.material as ShadowMaterial).opacity = 0.45;
      this.renderer.setClearColor(0x000000, 0);
    }

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(options.width * sample, options.height * sample, false);
    this.camera.aspect = options.width / options.height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);

    const output = document.createElement("canvas");
    output.width = options.width;
    output.height = options.height;
    const context = output.getContext("2d");
    if (!context) throw new Error("导出画布不可用。");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (options.round) {
      context.beginPath();
      context.arc(options.width / 2, options.height / 2, options.width / 2, 0, Math.PI * 2);
      context.clip();
    }
    context.drawImage(this.renderer.domElement, 0, 0, options.width, options.height);

    this.scene.background = background;
    this.scene.fog = fog;
    this.studioFloor.visible = studio;
    this.grass.visible = grass;
    this.nether.visible = nether;
    this.rays.visible = rays;
    (this.shadowFloor.material as ShadowMaterial).opacity = shadowOpacity;
    if (background instanceof Color) this.renderer.setClearColor(background, 1);
    else this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(viewW, viewH, false);
    this.camera.aspect = viewW / Math.max(viewH, 1);
    this.camera.updateProjectionMatrix();

    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("没有生成 PNG。");
    return blob;
  }

  private disposeRig(rig: Rig) {
    const geometries = new Set<BufferGeometryLike>();
    const materials = new Set<Material>();
    rig.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((entry) => materials.add(entry));
      else materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    rig.texture?.dispose();
    rig.capeTexture?.dispose();
    rig.nameTex.dispose();
    rig.bubbleTex.dispose();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    for (const rig of this.rigs.values()) this.disposeRig(rig);
    this.gradient.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

type BufferGeometryLike = { dispose: () => void };
