import { BufferAttribute, BufferGeometry } from "three";
import type { EntityDef, VCube, VPart } from "./entities.ts";
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
/**
 * Mojang ModelPart$Cube UV regions (texOffs u,v). Note east/west and up/down
 * are swapped relative to Blockbench's face_list *names*, but match the pixels
 * ModelPart actually samples — verified against client 26.3 Cube polygons.
 *
 * Layout (pixel space):
 *        [down  u+d .. u+d+w , v .. v+d]
 *        [up    u+d+w .. u+d+2w , v .. v+d]
 * [west u..u+d | north u+d..u+d+w | east u+d+w..u+d+w+d | south u+d+w+d..u+d+2w+d] at v+d
 */
export function boxRegions(box: Pick<VCube, "u" | "v" | "w" | "h" | "d">): Record<FaceName, BoxRegion> {
  const { u, v, w, h, d } = box;
  return {
    west: [u, v + d, d, h],
    north: [u + d, v + d, w, h],
    east: [u + d + w, v + d, d, h],
    south: [u + d + w + d, v + d, w, h],
    down: [u + d, v, w, d],
    up: [u + d + w, v, w, d],
  };
}

type Mat4 = Float64Array; // column-major 4x4

function matIdentity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function matMul(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function matTranslate(x: number, y: number, z: number): Mat4 {
  const m = matIdentity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

/** Vanilla ModelPart: Quaternionf.rotationZYX(zRot, yRot, xRot). */
function matRotationZYX(xRot: number, yRot: number, zRot: number): Mat4 {
  const cx = Math.cos(xRot), sx = Math.sin(xRot);
  const cy = Math.cos(yRot), sy = Math.sin(yRot);
  const cz = Math.cos(zRot), sz = Math.sin(zRot);
  const m = matIdentity();
  m[0] = cy * cz;
  m[1] = cy * sz;
  m[2] = -sy;
  m[4] = sx * sy * cz - cx * sz;
  m[5] = sx * sy * sz + cx * cz;
  m[6] = sx * cy;
  m[8] = cx * sy * cz + sx * sz;
  m[9] = cx * sy * sz - sx * cz;
  m[10] = cx * cy;
  return m;
}

function matTransformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = p[0], y = p[1], z = p[2];
  return [
    round(m[0] * x + m[4] * y + m[8] * z + m[12]),
    round(m[1] * x + m[5] * y + m[9] * z + m[13]),
    round(m[2] * x + m[6] * y + m[10] * z + m[14]),
  ];
}


/**
 * Vanilla LivingEntityRenderer: scale(-1,-1,1) then translate(0, -1.501, 0),
 * plus an extra Z flip so models face the stage camera (+Z).
 * In pixel space: p → (-x, 24 - y, -z). Three axis flips (det -1) reverse
 * face winding — emitCubeQuads reverses verts after this map.
 */
function vanillaEntityWorld(p: Vec3): Vec3 {
  return [round(-p[0]), round(24 - p[1]), round(-p[2])];
}

function cubeGrow(cube: VCube): [number, number, number] {
  if (cube.grow) return cube.grow;
  const g = cube.inflate ?? 0;
  return [g, g, g];
}

/**
 * Emit six faces for one cube using ModelPart$Cube vertex order and UVs
 * (client 26.3). Positions are in part-local space; `parent` then maps them.
 */
function emitCubeQuads(cube: VCube, parent: Mat4, texture: string, texW: number, texH: number, quads: ModelQuad[]) {
  const [gx, gy, gz] = cubeGrow(cube);
  let x1 = cube.x - gx;
  const y1 = cube.y - gy;
  const z1 = cube.z - gz;
  let x2 = cube.x + cube.w + gx;
  const y2 = cube.y + cube.h + gy;
  const z2 = cube.z + cube.d + gz;
  if (cube.mirror) {
    const tmp = x1;
    x1 = x2;
    x2 = tmp;
  }
  const { u, v, w, h, d } = cube;
  // Pixel-space edges along the UV strip (same as Cube constructor fstore 27..35).
  const u0 = u;
  const u1 = u + d;
  const u2 = u + d + w;
  const u3 = u + d + w + w;
  const u4 = u + d + w + d;
  const u5 = u + d + w + d + w;
  const v0 = v;
  const v1 = v + d;
  const v2 = v + d + h;

  type FaceSpec = { face: FaceName; verts: Array<[number, number, number, number, number]> };
  // Each vert: x,y,z, uPix, vPix — order matches ModelPart$Polygon (CCW, outward).
  const faces: FaceSpec[] = cube.mirror
    ? [
        // Mirrored: after x1/x2 swap, verts match CubeDump headM (CCW outward in model space).
        // x1 is maxX and x2 is minX here.
        { face: "down", verts: [[x2, y1, z1, u2, v1], [x1, y1, z1, u1, v1], [x1, y1, z2, u1, v0], [x2, y1, z2, u2, v0]] },
        { face: "up", verts: [[x2, y2, z2, u3, v0], [x1, y2, z2, u2, v0], [x1, y2, z1, u2, v1], [x2, y2, z1, u3, v1]] },
        { face: "east", verts: [[x1, y2, z1, u1, v2], [x1, y2, z2, u0, v2], [x1, y1, z2, u0, v1], [x1, y1, z1, u1, v1]] },
        { face: "north", verts: [[x2, y2, z1, u2, v2], [x1, y2, z1, u1, v2], [x1, y1, z1, u1, v1], [x2, y1, z1, u2, v1]] },
        { face: "west", verts: [[x2, y2, z2, u3, v2], [x2, y2, z1, u2, v2], [x2, y1, z1, u2, v1], [x2, y1, z2, u3, v1]] },
        { face: "south", verts: [[x1, y2, z2, u5, v2], [x2, y2, z2, u4, v2], [x2, y1, z2, u4, v1], [x1, y1, z2, u5, v1]] },
      ]
    : [
        { face: "down", verts: [[x2, y1, z2, u2, v0], [x1, y1, z2, u1, v0], [x1, y1, z1, u1, v1], [x2, y1, z1, u2, v1]] },
        { face: "up", verts: [[x2, y2, z1, u3, v1], [x1, y2, z1, u2, v1], [x1, y2, z2, u2, v0], [x2, y2, z2, u3, v0]] },
        { face: "west", verts: [[x1, y1, z1, u1, v1], [x1, y1, z2, u0, v1], [x1, y2, z2, u0, v2], [x1, y2, z1, u1, v2]] },
        { face: "north", verts: [[x2, y1, z1, u2, v1], [x1, y1, z1, u1, v1], [x1, y2, z1, u1, v2], [x2, y2, z1, u2, v2]] },
        { face: "east", verts: [[x2, y1, z2, u3, v1], [x2, y1, z1, u2, v1], [x2, y2, z1, u2, v2], [x2, y2, z2, u3, v2]] },
        { face: "south", verts: [[x1, y1, z2, u5, v1], [x2, y1, z2, u4, v1], [x2, y2, z2, u4, v2], [x1, y2, z2, u5, v2]] },
      ];

  for (const spec of faces) {
    const worldPts = spec.verts.map(([x, y, z]) => vanillaEntityWorld(matTransformPoint(parent, [x, y, z]))) as [Vec3, Vec3, Vec3, Vec3];
    // vanillaEntityWorld flips X, Y, and Z (det = -1), which reverses winding.
    // Reverse verts (and keep each UV glued to its vertex) so the cross-product
    // normal points outward again and FrontSide culling can work.
    const uvs = spec.verts.map(([, , , uu, vv]) => [round(uu / texW), round(1 - vv / texH)] as Vec2) as [Vec2, Vec2, Vec2, Vec2];
    worldPts.reverse();
    uvs.reverse();
    const ax = worldPts[1][0] - worldPts[0][0];
    const ay = worldPts[1][1] - worldPts[0][1];
    const az = worldPts[1][2] - worldPts[0][2];
    const bx = worldPts[2][0] - worldPts[0][0];
    const by = worldPts[2][1] - worldPts[0][1];
    const bz = worldPts[2][2] - worldPts[0][2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    quads.push({
      positions: worldPts,
      normal: [nx / len, ny / len, nz / len],
      uvs,
      texture,
      face: spec.face,
    });
  }
}

function walkPart(part: VPart, parent: Mat4, def: EntityDef, quads: ModelQuad[]) {
  const pivot = part.pivot ?? [0, 0, 0];
  const rot = part.rot ?? [0, 0, 0];
  // ModelPart.translateAndRotate: translate by pivot, then rotationZYX(z,y,x).
  const local = matMul(matTranslate(pivot[0], pivot[1], pivot[2]), matRotationZYX(rot[0], rot[1], rot[2]));
  const matrix = matMul(parent, local);
  const texture = part.texture ?? def.texture;
  for (const cube of part.cubes ?? []) {
    emitCubeQuads(cube, matrix, texture, def.texW, def.texH, quads);
  }
  for (const child of Object.values(part.children ?? {})) {
    walkPart(child, matrix, def, quads);
  }
}

/**
 * Build entity quads from a Blockbench / ModelPart tree.
 * Positions are in pixel units, Y-up, feet near y=0 (vanilla renderer map).
 * Does NOT apply the block-model -8 centering shift — callers must use
 * geometryFromQuads(..., { center: "entity" }).
 */
export function entityQuads(def: EntityDef): ModelQuad[] {
  const quads: ModelQuad[] = [];
  walkPart(def.root, matIdentity(), def, quads);
  const scale = def.scale ?? 1;
  if (scale !== 1) {
    for (const quad of quads) {
      quad.positions = quad.positions.map((p) => [round(p[0] * scale), round(p[1] * scale), round(p[2] * scale)] as Vec3) as [Vec3, Vec3, Vec3, Vec3];
    }
  }
  // Ground-align: models bake different root pivots (ghast y=-84, wither skeleton y≈-4.8).
  // After the vanilla scale(-1,-1,1)+translate map, shift so the lowest vertex sits at y=0.
  let minY = Infinity;
  for (const quad of quads) for (const p of quad.positions) minY = Math.min(minY, p[1]);
  if (Number.isFinite(minY) && minY !== 0) {
    for (const quad of quads) {
      quad.positions = quad.positions.map((p) => [p[0], round(p[1] - minY), p[2]] as Vec3) as [Vec3, Vec3, Vec3, Vec3];
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
export function geometryFromQuads(quads: readonly ModelQuad[], options?: { center?: "block" | "entity" }): BufferGeometry {
  const shift = options?.center === "entity" ? 0 : 8;
  const positions = new Float32Array(quads.length * 18);
  const normals = new Float32Array(quads.length * 18);
  const uvs = new Float32Array(quads.length * 12);
  quads.forEach((quad, index) => {
    const order = [0, 1, 2, 0, 2, 3];
    order.forEach((corner, slot) => {
      const p = quad.positions[corner];
      const at = index * 18 + slot * 3;
      positions[at] = p[0] - shift;
      positions[at + 1] = p[1];
      positions[at + 2] = p[2] - shift;
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
