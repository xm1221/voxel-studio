import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ClampToEdgeWrapping,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import type { PropSpec } from "./props";
import { withBasePath } from "./paths";

/** Unmodified PNGs from the vanilla 26.3 client. See public/vanilla/SOURCE.md. */
const ROOT = "/vanilla/26.3";

const markerGeometry = new CircleGeometry(7, 28);
const markerMaterial = new MeshBasicMaterial({
  color: 0x2457d6,
  transparent: true,
  opacity: 0.88,
  depthWrite: false,
});

const loader = new TextureLoader();
const textures = new Map<string, Texture>();
const stageTextures = new Map<string, Texture>();
let plainsGrass: [number, number, number] | null = null;
let stagePlainsGrass: [number, number, number] | null = null;

type PackState = { name: string; files: Map<string, Blob> };
let pack: PackState | null = null;
const packUrls = new Map<string, string>();
const packListeners = new Set<() => void>();

function vanillaUrl(file: string) {
  return withBasePath(`${ROOT}/${file}`);
}

export function propTexturePack(): { name: string; count: number } | null {
  return pack ? { name: pack.name, count: pack.files.size } : null;
}

export function subscribePropTextures(listener: () => void) {
  packListeners.add(listener);
  return () => {
    packListeners.delete(listener);
  };
}

export function applyPropTexturePack(name: string, files: Map<string, Blob>) {
  revokePackUrls();
  pack = { name, files };
  dropPropTextures();
  for (const listener of packListeners) listener();
}

export function clearPropTexturePack() {
  revokePackUrls();
  pack = null;
  dropPropTextures();
  for (const listener of packListeners) listener();
}

function revokePackUrls() {
  for (const url of packUrls.values()) URL.revokeObjectURL(url);
  packUrls.clear();
}

function dropPropTextures() {
  for (const texture of textures.values()) texture.dispose();
  textures.clear();
  plainsGrass = null;
}

function packFileUrl(file: string) {
  const blob = pack?.files.get(file);
  if (!blob) return null;
  const cached = packUrls.get(file);
  if (cached) return cached;
  const url = URL.createObjectURL(blob);
  packUrls.set(file, url);
  return url;
}

function prepare(texture: Texture) {
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  const image = texture.image as { width?: number } | undefined;
  if (image?.width) texture.needsUpdate = true;
  return texture;
}

function textureFor(file: string) {
  const cached = textures.get(file);
  if (cached) return cached;
  const texture = loader.load(packFileUrl(file) ?? vanillaUrl(file), (loaded) => {
    prepare(loaded);
  });
  prepare(texture);
  textures.set(file, texture);
  return texture;
}

/** Noon and nether floors stay on the bundled vanilla files, even when a pack replaces props. */
export function bundledTexture(file: string) {
  const cached = stageTextures.get(file);
  if (cached) return cached;
  const texture = loader.load(vanillaUrl(file), (loaded) => {
    prepare(loaded);
  });
  prepare(texture);
  stageTextures.set(file, texture);
  return texture;
}

/** Plains grass color, sampled once from a colormap URL. */
function plainsTint(url: string, slot: "prop" | "stage"): Promise<[number, number, number]> {
  const current = slot === "prop" ? plainsGrass : stagePlainsGrass;
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (tint: [number, number, number]) => {
      if (slot === "prop") plainsGrass = tint;
      else stagePlainsGrass = tint;
      resolve(tint);
    };
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        finish([145, 189, 89]);
        return;
      }
      context.drawImage(image, 0, 0);
      const temperature = 0.8;
      const humidity = 0.4;
      const x = Math.floor((1 - temperature) * 255);
      const y = Math.floor((1 - humidity * temperature) * 255);
      const pixel = context.getImageData(x, y, 1, 1).data;
      finish([pixel[0], pixel[1], pixel[2]]);
    };
    image.onerror = () => finish([145, 189, 89]);
    image.src = url;
  });
}

function tintedTop(cache: Map<string, Texture>, topUrl: string, tint: Promise<[number, number, number]>) {
  const key = "block/grass_block_top.png#plains";
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const texture = new CanvasTexture(canvas);
  prepare(texture);
  cache.set(key, texture);
  void tint.then((color) => {
    const image = new Image();
    image.onload = () => {
      const painted = document.createElement("canvas");
      painted.width = image.width;
      painted.height = image.height;
      const context = painted.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, painted.width, painted.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = Math.round((pixels.data[i] * color[0]) / 255);
        pixels.data[i + 1] = Math.round((pixels.data[i + 1] * color[1]) / 255);
        pixels.data[i + 2] = Math.round((pixels.data[i + 2] * color[2]) / 255);
      }
      context.putImageData(pixels, 0, 0);
      texture.image = painted;
      texture.needsUpdate = true;
    };
    image.src = topUrl;
  });
  return texture;
}

function tintedGrassTop() {
  return tintedTop(textures, packFileUrl("block/grass_block_top.png") ?? vanillaUrl("block/grass_block_top.png"), plainsTint(packFileUrl("colormap/grass.png") ?? vanillaUrl("colormap/grass.png"), "prop"));
}

export function bundledGrassTop() {
  return tintedTop(stageTextures, vanillaUrl("block/grass_block_top.png"), plainsTint(vanillaUrl("colormap/grass.png"), "stage"));
}

function faceMaterial(file: string, options?: { transparent?: boolean; tintTop?: boolean }) {
  const map = options?.tintTop ? tintedGrassTop() : textureFor(file);
  return new MeshStandardMaterial({
    map,
    roughness: options?.transparent ? 0.05 : 1,
    metalness: 0,
    transparent: Boolean(options?.transparent),
    alphaTest: options?.transparent ? 0.15 : 0,
    depthWrite: !options?.transparent,
  });
}

function blockMaterials(files: { px: string; nx: string; py: string; ny: string; pz: string; nz: string }, tintTop = false) {
  return [
    faceMaterial(files.px),
    faceMaterial(files.nx),
    faceMaterial(files.py, { tintTop }),
    faceMaterial(files.ny),
    faceMaterial(files.pz),
    faceMaterial(files.nz),
  ];
}

const BLOCK_FACES: Record<string, { px: string; nx: string; py: string; ny: string; pz: string; nz: string; tintTop?: boolean; transparent?: boolean }> = {
  grass: {
    px: "block/grass_block_side.png",
    nx: "block/grass_block_side.png",
    py: "block/grass_block_top.png",
    ny: "block/dirt.png",
    pz: "block/grass_block_side.png",
    nz: "block/grass_block_side.png",
    tintTop: true,
  },
  dirt: faces("block/dirt.png"),
  stone: faces("block/stone.png"),
  log: {
    px: "block/oak_log.png",
    nx: "block/oak_log.png",
    py: "block/oak_log_top.png",
    ny: "block/oak_log_top.png",
    pz: "block/oak_log.png",
    nz: "block/oak_log.png",
  },
  planks: faces("block/oak_planks.png"),
  sand: faces("block/sand.png"),
  tnt: {
    px: "block/tnt_side.png",
    nx: "block/tnt_side.png",
    py: "block/tnt_top.png",
    ny: "block/tnt_bottom.png",
    pz: "block/tnt_side.png",
    nz: "block/tnt_side.png",
  },
  crafting: {
    px: "block/crafting_table_side.png",
    nx: "block/crafting_table_front.png",
    py: "block/crafting_table_top.png",
    ny: "block/oak_planks.png",
    pz: "block/crafting_table_front.png",
    nz: "block/crafting_table_side.png",
  },
  glass: faces("block/glass.png"),
};

function faces(file: string) {
  return { px: file, nx: file, py: file, ny: file, pz: file, nz: file };
}

function cutoutMaterial(file: string) {
  return new MeshStandardMaterial({
    map: textureFor(file),
    roughness: 1,
    metalness: 0,
    transparent: true,
    alphaTest: 0.4,
    side: DoubleSide,
    depthWrite: true,
  });
}

function sprite(file: string, height: number) {
  const mesh = new Mesh(new BoxGeometry(height, height, 0.6), cutoutMaterial(file));
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  return mesh;
}

type CubeUv = { tu: number; tv: number; tw: number; th: number; td: number; texW: number; texH: number };

function cubeGeometry(w: number, h: number, d: number, uv: CubeUv) {
  const geometry = new BoxGeometry(w, h, d);
  const attr = geometry.attributes.uv;
  const { tu, tv, tw, th, td, texW, texH } = uv;
  const regions: Array<[number, number, number, number]> = [
    [tu + td + tw, tv + td, td, th],
    [tu, tv + td, td, th],
    [tu + td, tv, tw, td],
    [tu + td + tw, tv, tw, td],
    [tu + td, tv + td, tw, th],
    [tu + td + tw + td, tv + td, tw, th],
  ];
  regions.forEach(([mu, mv, mw, mh], face) => {
    const u0 = mu / texW;
    const u1 = (mu + mw) / texW;
    const vTop = 1 - mv / texH;
    const vBot = 1 - (mv + mh) / texH;
    const offset = face * 4;
    attr.setXY(offset, u0, vTop);
    attr.setXY(offset + 1, u1, vTop);
    attr.setXY(offset + 2, u0, vBot);
    attr.setXY(offset + 3, u1, vBot);
  });
  attr.needsUpdate = true;
  return geometry;
}

function part(w: number, h: number, d: number, uv: CubeUv, material: MeshStandardMaterial, x: number, y: number, z: number) {
  const mesh = new Mesh(cubeGeometry(w, h, d, uv), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function entityMaterial(file: string, transparent = false) {
  return new MeshStandardMaterial({
    map: textureFor(file),
    roughness: 1,
    metalness: 0,
    transparent,
    alphaTest: transparent ? 0.05 : 0.2,
    depthWrite: !transparent,
  });
}

function addCreeper(group: Group) {
  const material = entityMaterial("entity/creeper.png");
  const sheet = { texW: 64, texH: 32 };
  group.add(part(8, 8, 8, { tu: 0, tv: 0, tw: 8, th: 8, td: 8, ...sheet }, material, 0, 22, 0));
  group.add(part(8, 12, 4, { tu: 16, tv: 16, tw: 8, th: 12, td: 4, ...sheet }, material, 0, 12, 0));
  const leg = { tu: 0, tv: 16, tw: 4, th: 6, td: 4, ...sheet };
  for (const [x, z] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as const) {
    group.add(part(4, 6, 4, leg, material, x, 3, z));
  }
}

function addPig(group: Group) {
  const material = entityMaterial("entity/pig.png");
  const sheet = { texW: 64, texH: 64 };
  const body = part(10, 16, 8, { tu: 28, tv: 8, tw: 10, th: 16, td: 8, ...sheet }, material, 0, 10, 0);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  group.add(part(8, 8, 8, { tu: 0, tv: 0, tw: 8, th: 8, td: 8, ...sheet }, material, 0, 12, 10));
  group.add(part(4, 3, 1, { tu: 16, tv: 16, tw: 4, th: 3, td: 1, ...sheet }, material, 0, 11, 14.6));
  const leg = { tu: 0, tv: 16, tw: 4, th: 6, td: 4, ...sheet };
  for (const [x, z] of [
    [-3, 6],
    [3, 6],
    [-3, -5],
    [3, -5],
  ] as const) {
    group.add(part(4, 6, 4, leg, material, x, 3, z));
  }
}

function addChicken(group: Group) {
  const material = entityMaterial("entity/chicken.png");
  const sheet = { texW: 64, texH: 32 };
  const body = part(6, 8, 6, { tu: 0, tv: 9, tw: 6, th: 8, td: 6, ...sheet }, material, 0, 8, 0);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  group.add(part(4, 6, 3, { tu: 0, tv: 0, tw: 4, th: 6, td: 3, ...sheet }, material, 0, 13, 4));
  group.add(part(4, 2, 2, { tu: 14, tv: 0, tw: 4, th: 2, td: 2, ...sheet }, material, 0, 11, 6.2));
  group.add(part(2, 2, 2, { tu: 14, tv: 4, tw: 2, th: 2, td: 2, ...sheet }, material, 0, 9.2, 5.6));
  const leg = { tu: 26, tv: 0, tw: 3, th: 5, td: 3, ...sheet };
  group.add(part(3, 5, 3, leg, material, -1.5, 2.5, 0));
  group.add(part(3, 5, 3, leg, material, 1.5, 2.5, 0));
  const wing = { tu: 24, tv: 13, tw: 1, th: 4, td: 6, ...sheet };
  group.add(part(1, 4, 6, wing, material, -3.2, 9, 0));
  group.add(part(1, 4, 6, wing, material, 3.2, 9, 0));
}

function addSlime(group: Group) {
  const outer = entityMaterial("entity/slime.png", true);
  const inner = entityMaterial("entity/slime.png");
  const sheet = { texW: 64, texH: 32 };
  const shell = part(8, 8, 8, { tu: 0, tv: 0, tw: 8, th: 8, td: 8, ...sheet }, outer, 0, 4, 0);
  shell.castShadow = false;
  group.add(shell);
  group.add(part(6, 6, 6, { tu: 0, tv: 16, tw: 6, th: 6, td: 6, ...sheet }, inner, 0, 5, 0));
}

function addMarker(group: Group) {
  const marker = new Mesh(markerGeometry, markerMaterial);
  marker.name = "marker";
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.2;
  marker.visible = false;
  group.add(marker);
}

export function buildProp(spec: PropSpec) {
  const group = new Group();
  group.name = `prop-${spec.id}`;
  if (spec.kind === "block") {
    const facesFor = BLOCK_FACES[spec.id] ?? BLOCK_FACES.stone;
    const materials =
      spec.id === "glass"
        ? faceMaterial("block/glass.png", { transparent: true })
        : blockMaterials(facesFor, Boolean(facesFor.tintTop));
    const mesh = new Mesh(new BoxGeometry(16, 16, 16), materials);
    mesh.position.y = 8;
    mesh.castShadow = spec.id !== "glass";
    mesh.receiveShadow = true;
    group.add(mesh);
  } else if (spec.id === "sword") {
    group.add(sprite("item/diamond_sword.png", 22));
  } else if (spec.id === "pickaxe") {
    group.add(sprite("item/diamond_pickaxe.png", 22));
  } else if (spec.id === "apple") {
    group.add(sprite("item/apple.png", 12));
  } else if (spec.id === "torch") {
    group.add(sprite("block/torch.png", 16));
  } else if (spec.id === "creeper") {
    addCreeper(group);
  } else if (spec.id === "pig") {
    addPig(group);
  } else if (spec.id === "chicken") {
    addChicken(group);
  } else if (spec.id === "slime") {
    addSlime(group);
  }
  addMarker(group);
  return group;
}
