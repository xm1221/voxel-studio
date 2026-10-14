import { BoxGeometry, BufferAttribute, BufferGeometry } from "three";
import type { ModelType } from "../types";

/** Same noon spans as `layout.ts`: arm y 2 → -9.65 around elbow -3.65, leg y 0 → -11.65 around knee -5.65. */
const ARM_TOP = 2;
const ARM_BOTTOM = -9.65;
const ARM_PIVOT = -3.65;
const LEG_TOP = 0;
const LEG_BOTTOM = -11.65;
const LEG_PIVOT = -5.65;

export type SkinPixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type VoxelParent = "head" | "body" | "rArm" | "lArm" | "rLeg" | "lLeg";
export type BendJoint = "rElbow" | "lElbow" | "rKnee" | "lKnee";

export type VoxelPiece = {
  parent: VoxelParent;
  geometry: BufferGeometry;
  pivotY?: number;
  joint?: BendJoint;
};

const EXTRUDE = 1;
const ALPHA = 32;

type BoxSpec = {
  parent: VoxelParent;
  center: [number, number, number];
  size: [number, number, number];
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
  pivotY?: number;
  joint?: BendJoint;
};

/** Overlay regions, in the same parent space as the bent limb meshes. */
export function overlaySpecs(model: ModelType): BoxSpec[] {
  const slim = model === "slim";
  const armW = slim ? 3 : 4;
  const armCenter = (ARM_TOP + ARM_BOTTOM) / 2;
  const legCenter = (LEG_TOP + LEG_BOTTOM) / 2;
  const armH = ARM_TOP - ARM_BOTTOM;
  const legH = LEG_TOP - LEG_BOTTOM;
  return [
    { parent: "head", center: [0, 4, 0], size: [8, 8, 8], u: 32, v: 0, w: 8, h: 8, d: 8 },
    { parent: "body", center: [0, 0, 0], size: [8, 12, 4], u: 16, v: 32, w: 8, h: 12, d: 4 },
    { parent: "rArm", center: [0, armCenter, 0], size: [armW, armH, 4], u: 40, v: 32, w: armW, h: 12, d: 4, pivotY: ARM_PIVOT, joint: "rElbow" },
    { parent: "lArm", center: [0, armCenter, 0], size: [armW, armH, 4], u: 48, v: 48, w: armW, h: 12, d: 4, pivotY: ARM_PIVOT, joint: "lElbow" },
    { parent: "rLeg", center: [0, legCenter, 0], size: [4, legH, 4], u: 0, v: 32, w: 4, h: 12, d: 4, pivotY: LEG_PIVOT, joint: "rKnee" },
    { parent: "lLeg", center: [0, legCenter, 0], size: [4, legH, 4], u: 0, v: 48, w: 4, h: 12, d: 4, pivotY: LEG_PIVOT, joint: "lKnee" },
  ];
}

export function voxelPieces(model: ModelType, skin: SkinPixels): VoxelPiece[] {
  const pieces: VoxelPiece[] = [];
  for (const spec of overlaySpecs(model)) {
    const geometry = voxelsForBox(skin, spec);
    if (!geometry) continue;
    pieces.push({ parent: spec.parent, geometry, pivotY: spec.pivotY, joint: spec.joint });
  }
  return pieces;
}

function sample(skin: SkinPixels, texX: number, texY: number) {
  const scale = skin.width / 64;
  const sx = Math.min(skin.width - 1, Math.max(0, Math.floor((texX + 0.5) * scale)));
  const sy = Math.min(skin.height - 1, Math.max(0, Math.floor((texY + 0.5) * scale)));
  const index = (sy * skin.width + sx) * 4;
  return {
    alpha: skin.data[index + 3] ?? 0,
    u: (sx + 0.5) / skin.width,
    v: 1 - (sy + 0.5) / skin.height,
  };
}

function voxelsForBox(skin: SkinPixels, spec: BoxSpec) {
  const [cx, cy, cz] = spec.center;
  const [w, h, d] = spec.size;
  const boxes: BufferGeometry[] = [];
  const push = (texX: number, texY: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number) => {
    const pixel = sample(skin, texX, texY);
    if (pixel.alpha < ALPHA) return;
    const geometry = new BoxGeometry(nx !== 0 ? EXTRUDE : 1, ny !== 0 ? EXTRUDE : 1, nz !== 0 ? EXTRUDE : 1);
    geometry.translate(px + nx * (EXTRUDE / 2), py + ny * (EXTRUDE / 2), pz + nz * (EXTRUDE / 2));
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, pixel.u, pixel.v);
    boxes.push(geometry.toNonIndexed());
    geometry.dispose();
  };

  // +Z front, texture column 0 at the -X edge.
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      push(spec.u + d + i, spec.v + d + j, cx - w / 2 + i + 0.5, cy + h / 2 - j - 0.5, cz + d / 2, 0, 0, 1);
    }
  }
  // -Z back, texture column 0 at the +X edge.
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      push(spec.u + w + d * 2 + i, spec.v + d + j, cx + w / 2 - i - 0.5, cy + h / 2 - j - 0.5, cz - d / 2, 0, 0, -1);
    }
  }
  // +X, texture column 0 at +Z.
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < d; i += 1) {
      push(spec.u + w + d + i, spec.v + d + j, cx + w / 2, cy + h / 2 - j - 0.5, cz + d / 2 - i - 0.5, 1, 0, 0);
    }
  }
  // -X, texture column 0 at -Z.
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < d; i += 1) {
      push(spec.u + i, spec.v + d + j, cx - w / 2, cy + h / 2 - j - 0.5, cz - d / 2 + i + 0.5, -1, 0, 0);
    }
  }
  // +Y top.
  for (let j = 0; j < d; j += 1) {
    for (let i = 0; i < w; i += 1) {
      push(spec.u + d + i, spec.v + j, cx - w / 2 + i + 0.5, cy + h / 2, cz + d / 2 - j - 0.5, 0, 1, 0);
    }
  }
  // -Y bottom.
  for (let j = 0; j < d; j += 1) {
    for (let i = 0; i < w; i += 1) {
      push(spec.u + w + d + i, spec.v + j, cx + w / 2 - i - 0.5, cy - h / 2, cz + d / 2 - j - 0.5, 0, -1, 0);
    }
  }

  if (!boxes.length) return null;
  const merged = merge(boxes);
  for (const box of boxes) box.dispose();
  const position = merged.getAttribute("position");
  const normal = merged.getAttribute("normal");
  merged.setAttribute("rest", position.clone());
  merged.setAttribute("restNormal", normal.clone());
  return merged;
}

function merge(geometries: BufferGeometry[]) {
  let count = 0;
  for (const geometry of geometries) count += geometry.getAttribute("position").count;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let vertex = 0;
  for (const geometry of geometries) {
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const uvs = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i += 1) {
      position.set([positions.getX(i), positions.getY(i), positions.getZ(i)], vertex * 3);
      normal.set([normals.getX(i), normals.getY(i), normals.getZ(i)], vertex * 3);
      uv.set([uvs.getX(i), uvs.getY(i)], vertex * 2);
      vertex += 1;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("normal", new BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  return geometry;
}
