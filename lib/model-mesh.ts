import { BufferAttribute, BufferGeometry } from "three";
import type { EntityBox, EntityDef } from "./entities.ts";
import type { CompiledElement, CompiledFace, CompiledModel, CompiledRotation, FaceName, TintKind } from "./model-types.ts";
import { FACE_NAMES } from "./model-types.ts";

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/**
 * One textured quad in model space (0..16, y up, north is -Z). Positions run
 * counter-clockwise seen from outside. UVs are normalized 0..1 with v measured
 * from the bottom, matching three.js after its default `flipY`.
 */
export type ModelQuad = {
  positions: [Vec3, Vec3, Vec3, Vec3];
  normal: Vec3;
  uvs: [Vec2, Vec2, Vec2, Vec2];
  texture: string;
  tint?: TintKind;
  face: FaceName;
};

export type QuadGroup = { key: string; texture: string; tint?: TintKind; quads: ModelQuad[] };

const FACE_NORMALS: Record<FaceName, Vec3> = {
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
  south: [0, 0, 1],
  north: [0, 0, -1],
};

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function corners(face: FaceName, from: Vec3, to: Vec3): [Vec3, Vec3, Vec3, Vec3] {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  switch (face) {
    case "north":
      return [
        [x2, y2, z1],
        [x2, y1, z1],
        [x1, y1, z1],
        [x1, y2, z1],
      ];
    case "south":
      return [
        [x1, y2, z2],
        [x1, y1, z2],
        [x2, y1, z2],
        [x2, y2, z2],
      ];
    case "west":
      return [
        [x1, y2, z1],
        [x1, y1, z1],
        [x1, y1, z2],
        [x1, y2, z2],
      ];
    case "east":
      return [
        [x2, y2, z2],
        [x2, y1, z2],
        [x2, y1, z1],
        [x2, y2, z1],
      ];
    case "up":
      return [
        [x1, y2, z2],
        [x2, y2, z2],
        [x2, y2, z1],
        [x1, y2, z1],
      ];
    case "down":
      return [
        [x1, y1, z1],
        [x2, y1, z1],
        [x2, y1, z2],
        [x1, y1, z2],
      ];
  }
}

/** Texel-space UV corner for each vertex, before rotation. */
function faceUvCorners(face: FaceName, uv: [number, number, number, number]): [Vec2, Vec2, Vec2, Vec2] {
  const [u1, v1, u2, v2] = uv;
  switch (face) {
    case "up":
      return [
        [u1, v2],
        [u2, v2],
        [u2, v1],
        [u1, v1],
      ];
    case "down":
      return [
        [u1, v2],
        [u2, v2],
        [u2, v1],
        [u1, v1],
      ];
    default:
      return [
        [u1, v1],
        [u1, v2],
        [u2, v2],
        [u2, v1],
      ];
  }
}

/**
 * Rotate the texture clockwise in 90° steps by cycling which corner samples
 * which UV corner. Cycling keeps non-square faces (doors, slabs) inside their
 * own UV rectangle, which is how vanilla stretches a rotated texture.
 */
export function rotateUvCorners(corners: [Vec2, Vec2, Vec2, Vec2], degrees: number): [Vec2, Vec2, Vec2, Vec2] {
  const turns = ((Math.round(degrees / 90) % 4) + 4) % 4;
  if (!turns) return corners;
  return corners.map((_, index) => corners[(index + turns) % 4]) as [Vec2, Vec2, Vec2, Vec2];
}

function rotateVector(p: Vec3, rotation: CompiledRotation, rescale: boolean): Vec3 {
  let [x, y, z] = p;
  const [ox, oy, oz] = rotation.origin;
  x -= ox;
  y -= oy;
  z -= oz;
  if (rescale && rotation.rescale) {
    const cos = Math.cos((rotation.angle * Math.PI) / 180);
    const factor = Math.abs(cos) < 1e-4 ? 1 : 1 / cos;
    if (rotation.axis === "x") {
      y *= factor;
      z *= factor;
    } else if (rotation.axis === "y") {
      x *= factor;
      z *= factor;
    } else {
      x *= factor;
      y *= factor;
    }
  }
  const rad = (rotation.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  if (rotation.axis === "x") {
    [y, z] = [y * c - z * s, y * s + z * c];
  } else if (rotation.axis === "y") {
    [x, z] = [x * c + z * s, -x * s + z * c];
  } else {
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [round(x + ox), round(y + oy), round(z + oz)];
}

function rotateNormal(normal: Vec3, rotation: CompiledRotation | undefined): Vec3 {
  if (!rotation) return normal;
  const rotated = rotateVector(normal, rotation, false);
  const length = Math.hypot(rotated[0], rotated[1], rotated[2]) || 1;
  return [round(rotated[0] / length), round(rotated[1] / length), round(rotated[2] / length)];
}

/** Texel UV (0..16, v down) to normalized three.js UV (v up). */
function normalizeUv(u: number, v: number): Vec2 {
  return [round(u / 16), round(1 - v / 16)];
}

/** Quads for one compiled element face, in model space. */
export function elementFaceQuad(element: CompiledElement, face: FaceName, compiled: CompiledFace): ModelQuad {
  const points = corners(face, element.from, element.to);
  const uvCorners = faceUvCorners(face, compiled.uv);
  const rotation = element.rotation;
  const positions = points.map((point) => (rotation ? rotateVector(point, rotation, true) : point)) as [Vec3, Vec3, Vec3, Vec3];
  const uvs = rotateUvCorners(uvCorners, compiled.rotation ?? 0).map(([u, v]) => normalizeUv(u, v)) as [Vec2, Vec2, Vec2, Vec2];
  return {
    positions,
    normal: rotateNormal(FACE_NORMALS[face], rotation),
    uvs,
    texture: compiled.texture,
    ...(compiled.tint ? { tint: compiled.tint } : {}),
    face,
  };
}

/** Every face of every element, ready for a BufferGeometry. */
export function modelQuads(model: CompiledModel): ModelQuad[] {
  const quads: ModelQuad[] = [];
  for (const element of model.elements) {
    for (const face of FACE_NAMES) {
      const compiled = element.faces[face];
      if (!compiled) continue;
      quads.push(elementFaceQuad(element, face, compiled));
    }
  }
  return quads;
}

type BoxRegion = [number, number, number, number];

/** Standard Minecraft cube UV regions: [u, v, width, height]. */
export function boxRegions(box: Pick<EntityBox, "u" | "v" | "w" | "h" | "d">): Record<FaceName, BoxRegion> {
  const { u, v, w, h, d } = box;
  return {
    east: [u, v + d, d, h],
    west: [u + d + w, v + d, d, h],
    up: [u + d, v, w, d],
    down: [u + d + w, v, w, d],
    south: [u + d + w + d, v + d, w, h],
    north: [u + d, v + d, w, h],
  };
}

function rotateAroundCenter(point: Vec3, center: Vec3, spin: NonNullable<EntityBox["spin"]>): Vec3 {
  let [x, y, z] = point;
  const [cx, cy, cz] = center;
  x -= cx;
  y -= cy;
  z -= cz;
  const apply = (angle: number | undefined, axis: "x" | "y" | "z") => {
    if (!angle) return;
    const rad = (angle * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    if (axis === "x") [y, z] = [y * c - z * s, y * s + z * c];
    else if (axis === "y") [x, z] = [x * c + z * s, -x * s + z * c];
    else [x, y] = [x * c - y * s, x * s + y * c];
  };
  apply(spin.x, "x");
  apply(spin.y, "y");
  apply(spin.z, "z");
  return [round(x + cx), round(y + cy), round(z + cz)];
}

function rotateBoxNormal(normal: Vec3, spin: EntityBox["spin"]): Vec3 {
  if (!spin || (!spin.x && !spin.y && !spin.z)) return normal;
  const rotated = rotateAroundCenter(normal, [0, 0, 0], spin);
  return [round(rotated[0]), round(rotated[1]), round(rotated[2])];
}

/** Quads for an entity box model, using the standard cube UV layout. */
export function entityQuads(def: EntityDef): ModelQuad[] {
  const quads: ModelQuad[] = [];
  const texW = def.texW || 64;
  const texH = def.texH || 32;
  for (const box of def.boxes) {
    const inflate = box.inflate ?? 0;
    const from: Vec3 = [box.x - box.w / 2 - inflate, box.y - box.h / 2 - inflate, box.z - box.d / 2 - inflate];
    const to: Vec3 = [box.x + box.w / 2 + inflate, box.y + box.h / 2 + inflate, box.z + box.d / 2 + inflate];
    const center: Vec3 = [box.x, box.y, box.z];
    const regions = boxRegions(box);
    for (const face of FACE_NAMES) {
      const [mu, mv, mw, mh] = regions[face];
      let uv: [number, number, number, number] = [mu, mv, mu + mw, mv + mh];
      if (box.mirror) {
        // Mirror horizontally inside the face's own region.
        uv = [mu + mw, mv, mu, mv + mh];
      }
      const points = corners(face, from, to).map((point) => (box.spin ? rotateAroundCenter(point, center, box.spin) : point)) as [Vec3, Vec3, Vec3, Vec3];
      const uvCorners = faceUvCorners(face, uv);
      quads.push({
        positions: points,
        normal: rotateBoxNormal(FACE_NORMALS[face], box.spin),
        uvs: uvCorners.map(([u, v]) => [round(u / texW), round(1 - v / texH)] as Vec2) as [Vec2, Vec2, Vec2, Vec2],
        texture: box.texture ?? def.texture,
        face,
      });
    }
  }
  return quads;
}

export function quadKey(quad: Pick<ModelQuad, "texture" | "tint">) {
  return `${quad.texture}\u0000${quad.tint ?? ""}`;
}

/** Stable grouping by texture and tint, in first-seen order. */
export function groupQuads(quads: readonly ModelQuad[]): QuadGroup[] {
  const groups = new Map<string, QuadGroup>();
  for (const quad of quads) {
    const key = quadKey(quad);
    let group = groups.get(key);
    if (!group) {
      group = { key, texture: quad.texture, ...(quad.tint ? { tint: quad.tint } : {}), quads: [] };
      groups.set(key, group);
    }
    group.quads.push(quad);
  }
  return [...groups.values()];
}

/**
 * Non-indexed triangles for one or more quads. Model space 0..16 maps to world
 * space with the block centered on x/z and its bottom at y=0.
 */
export function geometryFromQuads(quads: readonly ModelQuad[]): BufferGeometry {
  const positions = new Float32Array(quads.length * 18);
  const normals = new Float32Array(quads.length * 18);
  const uvs = new Float32Array(quads.length * 12);
  quads.forEach((quad, index) => {
    const order = [0, 1, 2, 0, 2, 3];
    order.forEach((corner, slot) => {
      const p = quad.positions[corner];
      const at = index * 18 + slot * 3;
      positions[at] = p[0] - 8;
      positions[at + 1] = p[1];
      positions[at + 2] = p[2] - 8;
      normals[at] = quad.normal[0];
      normals[at + 1] = quad.normal[1];
      normals[at + 2] = quad.normal[2];
      const uv = quad.uvs[corner];
      const uvAt = index * 12 + slot * 2;
      uvs[uvAt] = uv[0];
      uvs[uvAt + 1] = uv[1];
    });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  return geometry;
}

export type ItemLayer = { texture: string; width: number; height: number; data: Uint8ClampedArray };

/**
 * Vanilla item extrusion: front and back sprites one model unit apart, plus a
 * side quad for every silhouette edge pixel. The side quads sample the pixel
 * center so nearest filtering paints them the edge pixel's color.
 */
export function itemExtrusionQuads(layers: readonly ItemLayer[]): ModelQuad[] {
  const quads: ModelQuad[] = [];
  layers.forEach((layer, index) => {
    const { width, height, data, texture } = layer;
    if (!width || !height) return;
    const dx = 16 / width;
    const dy = 16 / height;
    const front = 8.5 + index * 0.02;
    const back = 7.5 - index * 0.02;
    const alphaAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return 0;
      return data[(y * width + x) * 4 + 3];
    };
    const pixelUv = (x: number, y: number): Vec2 => [(x + 0.5) / width, 1 - (y + 0.5) / height];
    let any = false;
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        if (alphaAt(px, py) < 16) continue;
        any = true;
        const x0 = round(px * dx);
        const x1 = round((px + 1) * dx);
        const yTop = round(16 - py * dy);
        const yBottom = round(16 - (py + 1) * dy);
        const uv = pixelUv(px, py);
        const edge = (face: FaceName, from: Vec3, to: Vec3) => {
          quads.push({
            positions: corners(face, from, to),
            normal: FACE_NORMALS[face],
            uvs: [uv, uv, uv, uv],
            texture,
            face,
          });
        };
        if (alphaAt(px - 1, py) < 16) edge("west", [x0, yBottom, back], [x0, yTop, front]);
        if (alphaAt(px + 1, py) < 16) edge("east", [x1, yBottom, back], [x1, yTop, front]);
        if (alphaAt(px, py - 1) < 16) edge("up", [x0, yTop, back], [x1, yTop, front]);
        if (alphaAt(px, py + 1) < 16) edge("down", [x0, yBottom, back], [x1, yBottom, front]);
      }
    }
    if (!any) return;
    quads.push({
      positions: corners("south", [0, 0, front], [16, 16, front]),
      normal: [0, 0, 1],
      uvs: faceUvCorners("south", [0, 0, 16, 16]).map(([u, v]) => normalizeUv(u, v)) as [Vec2, Vec2, Vec2, Vec2],
      texture,
      face: "south",
    });
    quads.push({
      positions: corners("north", [0, 0, back], [16, 16, back]),
      normal: [0, 0, -1],
      uvs: faceUvCorners("north", [16, 0, 0, 16]).map(([u, v]) => normalizeUv(u, v)) as [Vec2, Vec2, Vec2, Vec2],
      texture,
      face: "north",
    });
  });
  return quads;
}

/**
 * Animated PNGs stack square frames vertically. Sample only the first frame by
 * shrinking the texture's V axis. Returns null for a still image.
 */
export function animatedFrame(width: number, height: number): { repeatY: number; offsetY: number } | null {
  if (!width || !height || height <= width || height % width !== 0) return null;
  const frames = height / width;
  return { repeatY: 1 / frames, offsetY: 1 - 1 / frames };
}
