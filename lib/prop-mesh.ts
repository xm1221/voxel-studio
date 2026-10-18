import { BoxGeometry, CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter } from "three";
import type { BlockTexture, PropBox, PropSpec } from "./props";
import { configureTexture } from "./rig/build";

const colorMaterials = new Map<string, MeshStandardMaterial>();
const geometries = new Map<string, BoxGeometry>();
const blockMaterials = new Map<BlockTexture, MeshStandardMaterial | MeshStandardMaterial[]>();

const markerGeometry = new CircleGeometry(7, 28);
const markerMaterial = new MeshBasicMaterial({
  color: 0x2457d6,
  transparent: true,
  opacity: 0.88,
  depthWrite: false,
});

function colorMaterial(color: string) {
  let material = colorMaterials.get(color);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
    colorMaterials.set(color, material);
  }
  return material;
}

function boxGeometry(w: number, h: number, d: number) {
  const key = `${w}x${h}x${d}`;
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = new BoxGeometry(w, h, d);
    geometries.set(key, geometry);
  }
  return geometry;
}

function paintTexture(draw: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  draw(context);
  const texture = new CanvasTexture(canvas);
  configureTexture(texture);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}

function speck(context: CanvasRenderingContext2D, base: string, colors: string[], salt: number) {
  context.fillStyle = base;
  context.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 36; i += 1) {
    const n = Math.abs(Math.sin((i + 1) * salt) * 10000);
    context.fillStyle = colors[i % colors.length];
    context.fillRect(Math.floor(n % 16), Math.floor((n * 1.7) % 16), 1 + (i % 3 === 0 ? 1 : 0), 1);
  }
}

function textured(draw: (context: CanvasRenderingContext2D) => void) {
  const texture = paintTexture(draw);
  return new MeshStandardMaterial({ map: texture ?? undefined, roughness: 1, metalness: 0 });
}

function materialsFor(texture: BlockTexture): MeshStandardMaterial | MeshStandardMaterial[] {
  const cached = blockMaterials.get(texture);
  if (cached) return cached;
  let materials: MeshStandardMaterial | MeshStandardMaterial[];
  if (texture === "glass") {
    materials = new MeshStandardMaterial({
      color: "#d7f3ff",
      roughness: 0.05,
      metalness: 0.05,
      transparent: true,
      opacity: 0.45,
    });
  } else if (texture === "grass") {
    const side = textured((context) => {
      speck(context, "#8a5a32", ["#6d4524", "#a56b3e"], 4.4);
      context.fillStyle = "#5d9b3a";
      context.fillRect(0, 0, 16, 4);
    });
    const top = textured((context) => speck(context, "#5d9b3a", ["#6eaf45", "#4e852f", "#87c85a"], 2.2));
    const bottom = textured((context) => speck(context, "#8a5a32", ["#6d4524", "#a56b3e", "#c98958"], 6.1));
    materials = [side, side, top, bottom, side, side];
  } else if (texture === "dirt") {
    materials = textured((context) => speck(context, "#8a5a32", ["#6d4524", "#a56b3e", "#c98958"], 5.2));
  } else if (texture === "stone") {
    materials = textured((context) => speck(context, "#8d8d8d", ["#6f6f6f", "#a3a3a3", "#787878"], 3.1));
  } else if (texture === "log") {
    const side = textured((context) => {
      context.fillStyle = "#6b4a2a";
      context.fillRect(0, 0, 16, 16);
      context.fillStyle = "#4e341c";
      for (const x of [2, 6, 11, 14]) context.fillRect(x, 0, 2, 16);
    });
    const top = textured((context) => {
      context.fillStyle = "#c4a15a";
      context.fillRect(0, 0, 16, 16);
      context.strokeStyle = "#6b4a2a";
      context.lineWidth = 1;
      context.strokeRect(3, 3, 10, 10);
      context.strokeRect(6, 6, 4, 4);
    });
    materials = [side, side, top, top, side, side];
  } else if (texture === "planks") {
    materials = textured((context) => {
      context.fillStyle = "#c4a15a";
      context.fillRect(0, 0, 16, 16);
      context.fillStyle = "#a8843e";
      for (const y of [0, 4, 8, 12]) context.fillRect(0, y, 16, 1);
      context.fillRect(0, 4, 1, 4);
      context.fillRect(8, 8, 1, 4);
    });
  } else if (texture === "sand") {
    materials = textured((context) => speck(context, "#e6d7a2", ["#f3e7c2", "#cbb888", "#efe3bf"], 7.7));
  } else if (texture === "tnt") {
    const side = textured((context) => {
      context.fillStyle = "#c83b32";
      context.fillRect(0, 0, 16, 16);
      context.fillStyle = "#f4f4f4";
      context.fillRect(0, 6, 16, 4);
      context.fillStyle = "#1a1a1a";
      context.fillRect(3, 7, 2, 2);
      context.fillRect(7, 7, 2, 2);
      context.fillRect(11, 7, 2, 2);
    });
    const top = textured((context) => speck(context, "#c83b32", ["#a12e28", "#e15a4a"], 1.7));
    materials = [side, side, top, top, side, side];
  } else {
    const side = textured((context) => {
      context.fillStyle = "#8b5a2b";
      context.fillRect(0, 0, 16, 16);
      context.fillStyle = "#6b4423";
      context.fillRect(0, 0, 16, 2);
      context.fillRect(2, 6, 5, 6);
    });
    const top = textured((context) => {
      context.fillStyle = "#c4a15a";
      context.fillRect(0, 0, 16, 16);
      context.fillStyle = "#6b4423";
      context.fillRect(7, 1, 2, 14);
      context.fillRect(1, 7, 14, 2);
    });
    materials = [side, side, top, side, side, side];
  }
  blockMaterials.set(texture, materials);
  return materials;
}

function addBox(group: Group, item: PropBox) {
  const mesh = new Mesh(boxGeometry(item.w, item.h, item.d), colorMaterial(item.color));
  mesh.position.set(item.x, item.y, item.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

export function buildProp(spec: PropSpec) {
  const group = new Group();
  group.name = `prop-${spec.id}`;
  if (spec.kind === "block") {
    const mesh = new Mesh(boxGeometry(16, 16, 16), materialsFor(spec.texture));
    mesh.position.y = 8;
    mesh.castShadow = spec.texture !== "glass";
    mesh.receiveShadow = true;
    group.add(mesh);
  } else {
    for (const item of spec.boxes) addBox(group, item);
  }
  const marker = new Mesh(markerGeometry, markerMaterial);
  marker.name = "marker";
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.2;
  marker.visible = false;
  group.add(marker);
  return group;
}
