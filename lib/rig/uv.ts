const INSET = 0.12;

export type UvRect = {
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
  texW: number;
  texH: number;
  /** Shift the side faces down the texture, in pixels. Top and bottom stay put. */
  side?: number;
};

/** Face order matches three.js BoxGeometry: +X, -X, +Y, -Y, +Z, -Z. */
export function buildBoxUVs(rect: UvRect) {
  const { u, v, w, h, d, texW, texH } = rect;
  const side = rect.side ?? 0;
  const top = face(u + d, v, u + w + d, v + d, texW, texH);
  const bottom = face(u + w + d, v, u + w * 2 + d, v + d, texW, texH);
  const sideY = v + d + side;
  const left = face(u, sideY, u + d, sideY + h, texW, texH);
  const front = face(u + d, sideY, u + w + d, sideY + h, texW, texH);
  const right = face(u + w + d, sideY, u + w + d * 2, sideY + h, texW, texH);
  const back = face(u + w + d * 2, sideY, u + w * 2 + d * 2, sideY + h, texW, texH);
  const order = [
    [right[3], right[2], right[0], right[1]],
    [left[3], left[2], left[0], left[1]],
    [top[3], top[2], top[0], top[1]],
    [bottom[0], bottom[1], bottom[3], bottom[2]],
    [front[3], front[2], front[0], front[1]],
    [back[3], back[2], back[0], back[1]],
  ];
  const data = new Float32Array(48);
  let index = 0;
  for (const corners of order) {
    for (const uv of corners) {
      data[index] = uv[0];
      data[index + 1] = uv[1];
      index += 2;
    }
  }
  return data;
}

/** Collapse one box face to a single texel so a cut joint does not show the hand or the hip. */
export function capFace(uvs: Float32Array, face: number, px: number, py: number, texW: number, texH: number) {
  const x = (px + 0.5) / texW;
  const y = 1 - (py + 0.5) / texH;
  const offset = face * 8;
  for (let i = 0; i < 4; i += 1) {
    uvs[offset + i * 2] = x;
    uvs[offset + i * 2 + 1] = y;
  }
}

function face(x1: number, y1: number, x2: number, y2: number, texW: number, texH: number): Array<[number, number]> {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const hx = Math.max(Math.abs(x2 - x1) / 2 - INSET, 0.02);
  const hy = Math.max(Math.abs(y2 - y1) / 2 - INSET, 0.02);
  const sx = x2 >= x1 ? 1 : -1;
  const sy = y2 >= y1 ? 1 : -1;
  const left = cx - sx * hx;
  const right = cx + sx * hx;
  const top = cy - sy * hy;
  const bottom = cy + sy * hy;
  return [
    [left / texW, 1 - bottom / texH],
    [right / texW, 1 - bottom / texH],
    [right / texW, 1 - top / texH],
    [left / texW, 1 - top / texH],
  ];
}
