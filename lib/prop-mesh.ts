import {
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
import { catalogTextureUrl, type CatalogEntry } from "./catalog.ts";
import { entityDef } from "./entities.ts";
import { animatedFrame, entityQuads, geometryFromQuads, groupQuads, itemExtrusionQuads, modelQuads, type ModelQuad } from "./model-mesh.ts";
import type { TintKind } from "./model-types.ts";
import { withBasePath } from "./paths.ts";

/** Bundled, committed vanilla files used by the stage floors. See public/vanilla/SOURCE.md. */
const STAGE_ROOT = "/vanilla/26.3";

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
const tintCache = new Map<TintKind, Promise<[number, number, number]>>();
const materials = new Map<string, MeshStandardMaterial>();
const textureFlags = new Map<string, { cutout: boolean; translucent: boolean }>();
const materialsByTexture = new Map<string, Set<MeshStandardMaterial>>();

type PackState = { name: string; files: Map<string, Blob> };
let pack: PackState | null = null;
const packUrls = new Map<string, string>();
const packListeners = new Set<() => void>();

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
  for (const material of materials.values()) material.dispose();
  materials.clear();
  materialsByTexture.clear();
  tintCache.clear();
  textureFlags.clear();
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

/** Animated textures stack frames vertically; sample only the first square one. */
function firstFrame(texture: Texture) {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const frame = image?.width && image.height ? animatedFrame(image.width, image.height) : null;
  if (!frame) return;
  texture.repeat.set(1, frame.repeatY);
  texture.offset.set(0, frame.offsetY);
  texture.needsUpdate = true;
}

function imageDataOf(texture: Texture): { width: number; height: number; data: Uint8ClampedArray } | null {
  const image = texture.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  if (!image?.width || !image.height || typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: data.width, height: data.height, data: data.data };
  } catch {
    return null;
  }
}

/** Cutout textures get alphaTest and double-sided faces; partly transparent ones stay translucent. */
function scanAlpha(file: string, texture: Texture) {
  if (textureFlags.has(file)) return;
  const image = imageDataOf(texture);
  if (!image) return;
  let cutout = false;
  let translucent = false;
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] === 0) cutout = true;
    else if (image.data[i] < 255) translucent = true;
    if (cutout && translucent) break;
  }
  const flags = { cutout, translucent };
  textureFlags.set(file, flags);
  for (const material of materialsByTexture.get(file) ?? []) applyTextureFlags(material, flags);
}

function applyTextureFlags(material: MeshStandardMaterial, flags: { cutout: boolean; translucent: boolean }) {
  material.alphaTest = flags.cutout ? 0.1 : 0;
  if (flags.cutout) material.side = DoubleSide;
  material.transparent = flags.translucent;
  material.depthWrite = !flags.translucent;
  material.roughness = flags.translucent ? 0.15 : 1;
  material.needsUpdate = true;
}

function textureFor(file: string) {
  const cached = textures.get(file);
  if (cached) return cached;
  const texture = loader.load(packFileUrl(file) ?? catalogTextureUrl(file), (loaded) => {
    prepare(loaded);
    firstFrame(loaded);
    scanAlpha(file, loaded);
  });
  prepare(texture);
  textures.set(file, texture);
  return texture;
}

/** Noon and nether floors stay on the bundled vanilla files, even when a pack replaces props. */
export function bundledTexture(file: string) {
  const cached = stageTextures.get(file);
  if (cached) return cached;
  const texture = loader.load(withBasePath(`${STAGE_ROOT}/${file}`), (loaded) => {
    prepare(loaded);
  });
  prepare(texture);
  stageTextures.set(file, texture);
  return texture;
}

let stageGrassTint: Promise<[number, number, number]> | null = null;

/** The stage floors always sample the bundled plains colormap. */
export function bundledGrassTop() {
  const key = "block/grass_block_top.png#plains";
  const cached = stageTextures.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const texture = new CanvasTexture(canvas);
  prepare(texture);
  stageTextures.set(key, texture);
  stageGrassTint ??= sampleTint(withBasePath(`${STAGE_ROOT}/colormap/grass.png`), [145, 189, 89]);
  void stageGrassTint.then((color) => {
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
    image.src = withBasePath(`${STAGE_ROOT}/block/grass_block_top.png`);
  });
  return texture;
}

function sampleTint(url: string, fallback: [number, number, number]): Promise<[number, number, number]> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(fallback);
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(fallback);
        return;
      }
      context.drawImage(image, 0, 0);
      const temperature = 0.8;
      const humidity = 0.4;
      const x = Math.floor((1 - temperature) * 255);
      const y = Math.floor((1 - humidity * temperature) * 255);
      const pixel = context.getImageData(x, y, 1, 1).data;
      resolve([pixel[0], pixel[1], pixel[2]]);
    };
    image.onerror = () => resolve(fallback);
    image.src = url;
  });
}

/** Vanilla tint colors: plains climate for grass and foliage, fixed water, full-power redstone. */
export function tintColor(kind: TintKind): Promise<[number, number, number]> {
  const cached = tintCache.get(kind);
  if (cached) return cached;
  let pending: Promise<[number, number, number]>;
  if (kind === "grass") pending = sampleTint(packFileUrl("colormap/grass.png") ?? catalogTextureUrl("colormap/grass.png"), [145, 189, 89]);
  else if (kind === "foliage") pending = sampleTint(packFileUrl("colormap/foliage.png") ?? catalogTextureUrl("colormap/foliage.png"), [119, 171, 47]);
  else if (kind === "water") pending = Promise.resolve([63, 118, 228]);
  else pending = Promise.resolve(redstoneTint(15));
  tintCache.set(kind, pending);
  return pending;
}

/** Vanilla redstone wire formula: power 15 is full red, lower power darkens. */
export function redstoneTint(power: number): [number, number, number] {
  const level = Math.max(0, Math.min(15, Math.round(power)));
  const channel = Math.round((level * 255) / 15);
  return [channel, 0, 0];
}

/** One material per texture+tint, shared by every prop that samples it. */
function materialFor(file: string, tint?: TintKind) {
  const key = `${file}\u0000${tint ?? ""}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const material = new MeshStandardMaterial({ map: textureFor(file), roughness: 1, metalness: 0 });
  const flags = textureFlags.get(file);
  if (flags) applyTextureFlags(material, flags);
  if (tint) {
    void tintColor(tint).then(([r, g, b]) => {
      material.color.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
      material.needsUpdate = true;
    });
  }
  let set = materialsByTexture.get(file);
  if (!set) {
    set = new Set();
    materialsByTexture.set(file, set);
  }
  set.add(material);
  materials.set(key, material);
  return material;
}

/** One mesh with per-texture groups and a matching material array. */
function meshFromQuads(quads: ModelQuad[], center: "block" | "entity" = "block") {
  const groups = groupQuads(quads);
  const geometry = geometryFromQuads(groups.flatMap((group) => group.quads), { center });
  let start = 0;
  const materialsForGroups = groups.map((group, index) => {
    geometry.addGroup(start, group.quads.length * 6, index);
    start += group.quads.length * 6;
    return materialFor(group.texture, group.tint);
  });
  const mesh = new Mesh(geometry, materialsForGroups);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Vanilla draws generated items as a pixel-thin extrusion: front and back
 * sprites plus one side face per edge pixel. The first pass is a flat slab;
 * once the layer images load, swap in the extruded geometry.
 */
function upgradeGeneratedItem(mesh: Mesh, layers: readonly string[]) {
  const loaded = layers.map((layer) => {
    const image = imageDataOf(textureFor(layer));
    return image ? { texture: layer, ...image } : null;
  });
  if (loaded.some((layer) => !layer)) return false;
  const quads = itemExtrusionQuads(loaded as Array<{ texture: string; width: number; height: number; data: Uint8ClampedArray }>);
  if (!quads.length) return false;
  const groups = groupQuads(quads);
  const geometry = geometryFromQuads(groups.flatMap((group) => group.quads));
  let start = 0;
  const next = groups.map((group, index) => {
    geometry.addGroup(start, group.quads.length * 6, index);
    start += group.quads.length * 6;
    return materialFor(group.texture, group.tint);
  });
  mesh.geometry.dispose();
  mesh.geometry = geometry;
  mesh.material = next;
  return true;
}

function addMarker(group: Group) {
  const marker = new Mesh(markerGeometry, markerMaterial);
  marker.name = "marker";
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.2;
  marker.visible = false;
  group.add(marker);
}

/** Build the scene mesh for a catalog entry. Unknown entries give an empty group. */
export function buildProp(entry: CatalogEntry) {
  const group = new Group();
  group.name = `prop-${entry.id}`;
  if (entry.kind === "entity") {
    const def = entityDef(entry.id);
    if (def) {
      const mesh = meshFromQuads(entityQuads(def), "entity");
      // Vanilla models face -Z after the renderer flip; turn them toward the stage camera (+Z).
      mesh.rotation.y = Math.PI;
      if (def.translucent) mesh.castShadow = false;
      group.add(mesh);
    }
  } else if (entry.model) {
    const mesh = meshFromQuads(modelQuads(entry.model));
    group.add(mesh);
    const layers = entry.model.layers;
    if (layers?.length) {
      const tryUpgrade = (attempt: number) => {
        if (upgradeGeneratedItem(mesh, layers) || attempt >= 120) return;
        setTimeout(() => tryUpgrade(attempt + 1), 50);
      };
      tryUpgrade(0);
    }
  }
  addMarker(group);
  return group;
}
