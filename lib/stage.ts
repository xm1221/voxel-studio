import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Fog,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  WebGLRenderer,
  type Texture,
} from "three";
import type { SceneDraft } from "./types";
import { FOOT_Y } from "./rig/layout";
import { BACKGROUNDS, backgroundDrawRect, stageLook } from "./stage-look";

export type BackdropDraft = Pick<SceneDraft, "background" | "godrays" | "light" | "backgroundImage" | "backgroundFit">;

export type StageSet = {
  shadowFloor: Mesh;
  studioFloor: Mesh;
  grass: Group;
  nether: Group;
  rays: Group;
  rayMat: MeshBasicMaterial;
  backgroundColor: Color;
  setBackdrop: (draft: BackdropDraft) => void;
  present: (scene: Scene, renderer: WebGLRenderer) => void;
  dispose: () => void;
};

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
  texture.generateMipmaps = false;
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

function blockPlatform(maps: Texture[]) {
  const group = new Group();
  const materials = maps.map((map) => new MeshStandardMaterial({ map, roughness: 1, metalness: 0 }));
  for (let x = -3; x <= 3; x += 1) {
    for (let z = -3; z <= 3; z += 1) {
      const block = new Mesh(new BoxGeometry(16, 16, 16), materials);
      block.position.set(x * 16, FOOT_Y - 8.04, z * 16);
      block.receiveShadow = true;
      block.castShadow = false;
      group.add(block);
    }
  }
  return group;
}

export function createStage(scene: Scene): StageSet {
  const shadowFloor = new Mesh(new PlaneGeometry(220, 220), new ShadowMaterial({ opacity: 0.38 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = FOOT_Y - 0.04;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  const studioMap = pixelTexture((context) => {
    const gradient = context.createRadialGradient(8, 8, 1, 8, 8, 8);
    gradient.addColorStop(0, "#f7fbff");
    gradient.addColorStop(1, "#d5e4f6");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 16, 16);
  });
  const studioFloor = new Mesh(new CircleGeometry(78, 64), new MeshStandardMaterial({ map: studioMap, roughness: 1, metalness: 0 }));
  studioFloor.rotation.x = -Math.PI / 2;
  studioFloor.position.y = FOOT_Y - 0.08;
  studioFloor.receiveShadow = true;
  scene.add(studioFloor);

  const grassTop = pixelTexture((context) => speck(context, "#5d9b3a", ["#6eaf45", "#4e852f", "#87c85a"], 2.2));
  const grassSide = pixelTexture((context) => {
    speck(context, "#8a5a32", ["#6d4524", "#a56b3e"], 4.4);
    context.fillStyle = "#5d9b3a";
    context.fillRect(0, 0, 16, 4);
  });
  const dirt = pixelTexture((context) => speck(context, "#8a5a32", ["#6d4524", "#a56b3e", "#c98958"], 6.1));
  const grass = blockPlatform([grassSide, grassSide, grassTop, dirt, grassSide, grassSide]);
  grass.visible = false;
  scene.add(grass);

  const netherSide = pixelTexture((context) => speck(context, "#6a2420", ["#8d332c", "#4d1614", "#c45a3a"], 8.2));
  const netherTop = pixelTexture((context) => speck(context, "#7a2c24", ["#a14332", "#511814"], 3.3));
  const nether = blockPlatform([netherSide, netherSide, netherTop, netherSide, netherSide, netherSide]);
  nether.visible = false;
  scene.add(nether);

  const rayMat = new MeshBasicMaterial({
    color: 0xfff0d2,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const rays = new Group();
  for (let i = 0; i < 7; i += 1) {
    const ray = new Mesh(new PlaneGeometry(5.5, 78), rayMat);
    ray.position.set(-20 + i * 7, 28, -6);
    ray.rotation.z = -0.22 + i * 0.06;
    rays.add(ray);
  }
  rays.visible = false;
  scene.add(rays);

  const backdrop = document.createElement("canvas");
  const backdropTex = new CanvasTexture(backdrop);
  backdropTex.colorSpace = SRGBColorSpace;
  backdropTex.magFilter = LinearFilter;
  backdropTex.minFilter = LinearFilter;
  backdropTex.generateMipmaps = false;
  let desired: BackdropDraft = {
    background: "studio",
    godrays: false,
    light: "soft",
    backgroundImage: null,
    backgroundFit: "cover",
  };
  let loadedUrl: string | null = null;
  let source: HTMLImageElement | null = null;
  let paintKey = "";
  let shownMode = "";

  function paintBackdrop(width: number, height: number, sky: number | null) {
    if (!source || width < 2 || height < 2) return false;
    const key = `${width}x${height}:${desired.backgroundFit}:${sky ?? 0}`;
    if (key === paintKey && sceneBackgroundIsTexture) return true;
    const rect = backgroundDrawRect(source.naturalWidth || source.width, source.naturalHeight || source.height, width, height, desired.backgroundFit);
    backdrop.width = width;
    backdrop.height = height;
    const context = backdrop.getContext("2d");
    if (!context) return false;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = `#${(sky ?? 0xd5e4f6).toString(16).padStart(6, "0")}`;
    context.fillRect(0, 0, width, height);
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    backdropTex.needsUpdate = true;
    paintKey = key;
    return true;
  }

  let sceneBackgroundIsTexture = false;

  function setBackdrop(draft: BackdropDraft) {
    const nextUrl = draft.backgroundImage || null;
    desired = {
      background: draft.background,
      godrays: draft.godrays,
      light: draft.light,
      backgroundImage: nextUrl,
      backgroundFit: draft.backgroundFit === "contain" ? "contain" : "cover",
    };
    if (nextUrl === loadedUrl) return;
    loadedUrl = nextUrl;
    source = null;
    paintKey = "";
    shownMode = "";
    sceneBackgroundIsTexture = false;
    if (!nextUrl) return;
    const image = new Image();
    const url = nextUrl;
    image.onload = () => {
      if (loadedUrl !== url) return;
      source = image;
      paintKey = "";
      shownMode = "";
      sceneBackgroundIsTexture = false;
    };
    image.onerror = () => {
      if (loadedUrl !== url) return;
      source = null;
      shownMode = "";
    };
    image.src = url;
  }

  function present(scene: Scene, renderer: WebGLRenderer) {
    const look = stageLook(desired);
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;
    const painted = look.customImage && paintBackdrop(width, height, look.sky);
    if (painted) {
      if (shownMode !== "image") {
        scene.background = backdropTex;
        scene.fog = null;
        renderer.setClearColor(0x000000, 0);
        shownMode = "image";
        sceneBackgroundIsTexture = true;
      }
      return;
    }
    sceneBackgroundIsTexture = false;
    if (look.sky == null) {
      if (shownMode !== "clear") {
        scene.background = null;
        scene.fog = null;
        renderer.setClearColor(0x000000, 0);
        shownMode = "clear";
      }
      return;
    }
    const colorKey = `${look.sky}:${look.fog}`;
    if (shownMode === colorKey) return;
    backgroundColor.set(look.sky);
    scene.background = backgroundColor;
    scene.fog = look.fog ? new Fog(look.sky, 80, 230) : null;
    renderer.setClearColor(look.sky, 1);
    shownMode = colorKey;
  }

  const textures = [studioMap, grassTop, grassSide, dirt, netherSide, netherTop];
  const backgroundColor = new Color(BACKGROUNDS.studio);
  return {
    shadowFloor,
    studioFloor,
    grass,
    nether,
    rays,
    rayMat,
    backgroundColor,
    setBackdrop,
    present,
    dispose() {
      for (const texture of textures) texture.dispose();
      shadowFloor.geometry.dispose();
      (shadowFloor.material as ShadowMaterial).dispose();
      studioFloor.geometry.dispose();
      (studioFloor.material as MeshStandardMaterial).dispose();
      rayMat.dispose();
      backdropTex.dispose();
    },
  };
}

export function applyStage(stage: StageSet, scene: Scene, renderer: WebGLRenderer, draft: SceneDraft) {
  const look = stageLook(draft);
  stage.studioFloor.visible = look.studioFloor;
  stage.grass.visible = look.grass;
  stage.nether.visible = look.nether;
  stage.shadowFloor.visible = look.shadowFloor;
  (stage.shadowFloor.material as ShadowMaterial).opacity = look.shadowOpacity;
  stage.rays.visible = look.rays;
  stage.rayMat.color.set(look.rayColor);
  stage.rayMat.opacity = look.rayOpacity;
  stage.setBackdrop(draft);
  stage.present(scene, renderer);
}
