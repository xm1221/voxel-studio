import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Texture,
} from "three";
import type { CompiledElement, CompiledFace, CompiledModel, CompiledRotation, FaceName, TintKind } from "./model-types.ts";
import { FACE_NAMES } from "./model-types.ts";

type TextureLookup = (file: string, tint?: TintKind) => Texture;

const FACE_LAYOUT: Record<FaceName, Array<[number, number, number]>> = {
  east: [
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
    [1, 0, 1],
  ],
  west: [
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
    [0, 0, 0],
  ],
  up: [
    [0, 1, 1],
    [0, 1, 0],
    [1, 1, 0],
    [1, 1, 1],
  ],
  down: [
    [0, 0, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 0, 0],
  ],
  south: [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ],
  north: [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ],
};

function surfaceKind(texture: string): "translucent" | "cutout" | "solid" {
  const name = texture.toLowerCase();
  if (name.startsWith("custom:") || name.startsWith("data:")) return "cutout";
  if (/packed_ice|blue_ice/.test(name)) return "solid";
  if (/glass|ice|water|honey|slime|portal/.test(name)) return "translucent";
  if (/leaves|sapling|flower|torch|rail|ladder|vine|grass|plant|coral|cross|fern|bush|kelp|seagrass|lantern|chain/.test(name)) return "cutout";
  return "solid";
}

function bakePoint(x: number, y: number, z: number, rotation?: CompiledRotation): [number, number, number] {
  let px = x;
  let py = y;
  let pz = z;
  if (rotation && rotation.angle) {
    const [ox, oy, oz] = rotation.origin;
    let dx = px - ox;
    let dy = py - oy;
    let dz = pz - oz;
    const rad = (rotation.angle * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    if (rotation.axis === "x") {
      const y2 = dy * c - dz * s;
      const z2 = dy * s + dz * c;
      dy = y2;
      dz = z2;
    } else if (rotation.axis === "y") {
      const x2 = dx * c + dz * s;
      const z2 = -dx * s + dz * c;
      dx = x2;
      dz = z2;
    } else {
      const x2 = dx * c - dy * s;
      const y2 = dx * s + dy * c;
      dx = x2;
      dy = y2;
    }
    if (rotation.rescale) {
      const factor = 1 / Math.max(0.2, Math.abs(c));
      if (rotation.axis === "x") {
        dy *= factor;
        dz *= factor;
      } else if (rotation.axis === "y") {
        dx *= factor;
        dz *= factor;
      } else {
        dx *= factor;
        dy *= factor;
      }
    }
    px = ox + dx;
    py = oy + dy;
    pz = oz + dz;
  }
  return [px - 8, py, pz - 8];
}

function faceUv(uv: [number, number, number, number], rotation = 0): Array<[number, number]> {
  const u0 = uv[0] / 16;
  const u1 = uv[2] / 16;
  const vTop = 1 - uv[1] / 16;
  const vBot = 1 - uv[3] / 16;
  const corners: Array<[number, number]> = [
    [u0, vTop],
    [u1, vTop],
    [u1, vBot],
    [u0, vBot],
  ];
  const steps = ((Math.round(rotation / 90) % 4) + 4) % 4;
  if (!steps) return corners;
  return [...corners.slice(steps), ...corners.slice(0, steps)];
}

type Bucket = { positions: number[]; normals: number[]; uvs: number[]; kind: "translucent" | "cutout" | "solid"; texture: string; tint?: TintKind };

function pushQuad(bucket: Bucket, corners: Array<[number, number, number]>, uvs: Array<[number, number]>) {
  const [a, b, c] = corners;
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length;
  ny /= length;
  nz /= length;
  for (const index of [0, 1, 2, 0, 2, 3]) {
    bucket.positions.push(corners[index][0], corners[index][1], corners[index][2]);
    bucket.normals.push(nx, ny, nz);
    bucket.uvs.push(uvs[index][0], uvs[index][1]);
  }
}

function elementQuads(element: CompiledElement, buckets: Map<string, Bucket>) {
  const [x1, y1, z1] = element.from;
  const [x2, y2, z2] = element.to;
  for (const faceName of FACE_NAMES) {
    const face: CompiledFace | undefined = element.faces[faceName];
    if (!face) continue;
    const layout = FACE_LAYOUT[faceName];
    const corners = layout.map(([tx, ty, tz]) => {
      const x = x1 + (x2 - x1) * tx;
      const y = y1 + (y2 - y1) * ty;
      const z = z1 + (z2 - z1) * tz;
      return bakePoint(x, y, z, element.rotation);
    });
    const span = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1], corners[1][2] - corners[0][2])
      * Math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1], corners[3][2] - corners[0][2]);
    if (span < 1e-4) continue;
    const kind = surfaceKind(face.texture);
    const key = `${kind}|${face.tint ?? ""}|${face.texture}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { positions: [], normals: [], uvs: [], kind, texture: face.texture, ...(face.tint ? { tint: face.tint } : {}) };
      buckets.set(key, bucket);
    }
    pushQuad(bucket, corners, faceUv(face.uv, face.rotation));
  }
}

export function buildCompiledGroup(model: CompiledModel, textureFor: TextureLookup) {
  const group = new Group();
  const buckets = new Map<string, Bucket>();
  for (const element of model.elements.slice(0, 120)) elementQuads(element, buckets);
  for (const bucket of buckets.values()) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(bucket.positions), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(bucket.normals), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(bucket.uvs), 2));
    const translucent = bucket.kind === "translucent";
    const cutout = bucket.kind === "cutout";
    const material = new MeshStandardMaterial({
      map: textureFor(bucket.texture, bucket.tint),
      roughness: translucent ? 0.05 : 1,
      metalness: 0,
      transparent: translucent || cutout,
      alphaTest: translucent ? 0 : 0.1,
      depthWrite: !translucent,
      side: cutout || translucent ? DoubleSide : FrontSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = !translucent;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

export function buildPlaceholder() {
  const group = new Group();
  const mesh = new Mesh(new BoxGeometry(16, 16, 16), new MeshStandardMaterial({ color: 0xb7c3d4, roughness: 1, metalness: 0 }));
  mesh.position.y = 8;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
