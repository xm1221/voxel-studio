import type { CompiledElement, CompiledFace, CompiledModel, CompiledRotation, FaceName } from "./model-types.ts";
import { FACE_NAMES } from "./model-types.ts";

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

export type MeshPart = {
  texture: string;
  positions: number[];
  uvs: number[];
  indices: number[];
};

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

function pushQuad(part: MeshPart, corners: Array<[number, number, number]>, uvs: Array<[number, number]>) {
  const start = part.positions.length / 3;
  for (let index = 0; index < 4; index += 1) {
    part.positions.push(corners[index][0], corners[index][1], corners[index][2]);
    part.uvs.push(uvs[index][0], uvs[index][1]);
  }
  part.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function elementQuads(element: CompiledElement, parts: Map<string, MeshPart>) {
  const [x1, y1, z1] = element.from;
  const [x2, y2, z2] = element.to;
  for (const faceName of FACE_NAMES) {
    const face: CompiledFace | undefined = element.faces[faceName];
    if (!face) continue;
    const corners = FACE_LAYOUT[faceName].map(([tx, ty, tz]) => {
      const x = x1 + (x2 - x1) * tx;
      const y = y1 + (y2 - y1) * ty;
      const z = z1 + (z2 - z1) * tz;
      return bakePoint(x, y, z, element.rotation);
    });
    const part = parts.get(face.texture) ?? { texture: face.texture, positions: [], uvs: [], indices: [] };
    parts.set(face.texture, part);
    pushQuad(part, corners, faceUv(face.uv, face.rotation));
  }
}

export function cubeModel(texture: string): CompiledModel {
  const face = { uv: [0, 0, 16, 16] as [number, number, number, number], texture };
  return {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: { east: face, west: face, up: face, down: face, south: face, north: face },
      },
    ],
    particle: texture,
  };
}

/** Triangles for a compiled Minecraft model, grouped by texture. Coordinates stay in stage units (16 = 1 block). */
export function meshParts(model: CompiledModel): MeshPart[] {
  const parts = new Map<string, MeshPart>();
  for (const element of model.elements.slice(0, 120)) elementQuads(element, parts);
  return [...parts.values()].filter((part) => part.indices.length > 0);
}
