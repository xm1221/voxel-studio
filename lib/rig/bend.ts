import { BoxGeometry, BufferAttribute, BufferGeometry } from "three";
import type { UvRect } from "./uv";

/** Width of the smooth fold, in skin pixels, centered on the elbow or knee. */
export const BEND_BLEND = 1.8;

/** 0 above the joint, 1 below it, smooth through the fold. */
export function bendWeight(y: number, pivotY: number, blend = BEND_BLEND) {
  const upper = pivotY + blend;
  const lower = pivotY - blend;
  if (y >= upper) return 0;
  if (y <= lower) return 1;
  const t = (upper - y) / (upper - lower);
  return t * t * (3 - 2 * t);
}

/** Rotate rest vertices around the joint's local X axis. `angle` matches three.js rotation.x. */
export function deformBend(geometry: BufferGeometry, pivotY: number, angle: number, blend = BEND_BLEND) {
  const position = geometry.getAttribute("position");
  const rest = geometry.getAttribute("rest");
  const normal = geometry.getAttribute("normal");
  const restNormal = geometry.getAttribute("restNormal");
  if (!position || !rest || !normal || !restNormal) return;
  for (let i = 0; i < rest.count; i += 1) {
    const x = rest.getX(i);
    const y = rest.getY(i);
    const z = rest.getZ(i);
    const weight = bendWeight(y, pivotY, blend);
    const theta = angle * weight;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const dy = y - pivotY;
    position.setXYZ(i, x, pivotY + dy * cos - z * sin, dy * sin + z * cos);
    const nx = restNormal.getX(i);
    const ny = restNormal.getY(i);
    const nz = restNormal.getZ(i);
    normal.setXYZ(i, nx, ny * cos - nz * sin, ny * sin + nz * cos);
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
}

function stampRest(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  geometry.setAttribute("rest", position.clone());
  geometry.setAttribute("restNormal", normal.clone());
}

/**
 * One limb box in parent space, subdivided down its length so a later bend
 * can fold the inside and keep the outside continuous.
 * `top` and `bottom` are parent-space Y. UVs cover the full skin rect.
 */
export function createBentBox(width: number, depth: number, top: number, bottom: number, uv: UvRect) {
  const height = top - bottom;
  const center = (top + bottom) / 2;
  const geometry = new BoxGeometry(width, height, depth, 1, 12, 1);
  writeBoxUVs(geometry, uv);
  geometry.translate(0, center, 0);
  stampRest(geometry);
  return geometry;
}

function inset(value: number, min: number, size: number) {
  const pad = Math.min(0.12, size * 0.2);
  const t = size === 0 ? 0 : (value - min) / size;
  return min + (pad / size + t * (1 - (2 * pad) / size)) * size;
}

function writeBoxUVs(geometry: BoxGeometry, rect: UvRect) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const { u, v, w, h, d, texW, texH } = rect;
  const side = rect.side ?? 0;
  // The outer shell is slightly larger than the skin rect. Map the real face
  // onto that rect so edge vertices cannot sample the base layer beside it.
  const width = geometry.parameters.width;
  const height = geometry.parameters.height;
  const depth = geometry.parameters.depth;
  const across = (value: number, min: number, size: number, origin: number, span: number) =>
    origin + ((value - min) / size) * span;
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    let texX = u;
    let texY = v;
    let spanX = w;
    let spanY = h;
    let originX = u;
    let originY = v;
    if (ny > 0.5) {
      originX = u + d;
      originY = v;
      spanX = w;
      spanY = d;
      texX = across(x, -width / 2, width, originX, spanX);
      texY = across(-z, -depth / 2, depth, originY, spanY);
    } else if (ny < -0.5) {
      originX = u + w + d;
      originY = v;
      spanX = w;
      spanY = d;
      texX = across(-x, -width / 2, width, originX, spanX);
      texY = across(z, -depth / 2, depth, originY, spanY);
    } else {
      originY = v + d + side;
      spanY = h;
      texY = across(-y, -height / 2, height, originY, spanY);
      if (nx > 0.5) {
        originX = u + w + d;
        spanX = d;
        texX = across(-z, -depth / 2, depth, originX, spanX);
      } else if (nx < -0.5) {
        originX = u;
        spanX = d;
        texX = across(z, -depth / 2, depth, originX, spanX);
      } else if (nz > 0.5) {
        originX = u + d;
        spanX = w;
        texX = across(x, -width / 2, width, originX, spanX);
      } else {
        originX = u + w + d * 2;
        spanX = w;
        texX = across(-x, -width / 2, width, originX, spanX);
      }
    }
    uvs[i * 2] = inset(texX, originX, spanX) / texW;
    uvs[i * 2 + 1] = 1 - inset(texY, originY, spanY) / texH;
  }
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
}
