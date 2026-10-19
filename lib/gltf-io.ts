import { catalogEntry } from "./catalog.ts";
import { cubeModel, meshParts, type MeshPart } from "./mesh-data.ts";
import type { Vec3 } from "./model-types.ts";
import type { ProjectFile } from "./project.ts";
import { emptyPropClip, samplePropClip, type PropChannels, type PropClip } from "./prop-clip.ts";
import type { SceneProp } from "./types.ts";

const NEAREST = 9728;
const CLAMP = 33071;
const FLOAT = 5126;
const USHORT = 5123;
const ARRAY = 34962;
const ELEMENT = 34963;

export type GltfDocument = {
  json: Record<string, unknown>;
  bin: Uint8Array;
};

const PLACEHOLDER_PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

type Quat = { x: number; y: number; z: number; w: number };

export function quatFromEuler(rotation: Vec3): Quat {
  const hx = (rotation.x * Math.PI) / 360;
  const hy = (rotation.y * Math.PI) / 360;
  const hz = (rotation.z * Math.PI) / 360;
  const cx = Math.cos(hx);
  const sx = Math.sin(hx);
  const cy = Math.cos(hy);
  const sy = Math.sin(hy);
  const cz = Math.cos(hz);
  const sz = Math.sin(hz);
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

export function eulerFromQuat(q: Quat): Vec3 {
  const sinr = 2 * (q.w * q.x + q.y * q.z);
  const cosr = 1 - 2 * (q.x * q.x + q.y * q.y);
  const x = Math.atan2(sinr, cosr);
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const y = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);
  const siny = 2 * (q.w * q.z + q.x * q.y);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  const z = Math.atan2(siny, cosy);
  const deg = 180 / Math.PI;
  const round = (value: number) => Math.round(value * deg * 1000) / 1000;
  return { x: round(x), y: round(y), z: round(z) };
}

class BinWriter {
  private readonly chunks: Uint8Array[] = [];
  length = 0;

  align(size = 4) {
    const pad = (size - (this.length % size)) % size;
    if (pad) this.raw(new Uint8Array(pad));
  }

  raw(bytes: Uint8Array) {
    const offset = this.length;
    this.chunks.push(bytes);
    this.length += bytes.length;
    return offset;
  }

  f32(values: number[]) {
    this.align(4);
    const buffer = new ArrayBuffer(values.length * 4);
    new Float32Array(buffer).set(values);
    return this.raw(new Uint8Array(buffer));
  }

  u16(values: number[]) {
    this.align(4);
    const padded = values.length + (values.length % 2);
    const buffer = new ArrayBuffer(padded * 2);
    new Uint16Array(buffer, 0, values.length).set(values);
    return this.raw(new Uint8Array(buffer));
  }

  bytes() {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function modelFor(prop: SceneProp, project: ProjectFile) {
  const custom = project.customs.find((asset) => asset.id === prop.catalogId);
  if (custom?.model.elements.length) return custom.model;
  const entry = catalogEntry(prop.catalogId);
  if (entry?.model?.elements.length) return entry.model;
  return cubeModel("pixelstage:placeholder");
}

function pose(prop: SceneProp, clip: PropClip | null | undefined, time: number) {
  const sample = samplePropClip(clip ?? null, time)[prop.id] ?? {};
  return {
    position: sample.position ?? prop.position,
    rotation: sample.rotation ?? prop.rotation,
    scale: sample.scale ?? prop.scale,
  };
}

function alphaMode(texture: string) {
  const name = texture.toLowerCase();
  if (/glass|ice|water|honey|slime|portal/.test(name) && !/packed_ice|blue_ice/.test(name)) return "BLEND";
  if (name.startsWith("custom:") || /leaves|sapling|flower|torch|rail|grass|plant/.test(name)) return "MASK";
  return "OPAQUE";
}

export function projectToGltf(project: ProjectFile, textures = new Map<string, Uint8Array>()): GltfDocument {
  const bin = new BinWriter();
  const bufferViews: Array<Record<string, number>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const images: Array<Record<string, unknown>> = [];
  const textureIndex = new Map<string, number>();

  function view(byteOffset: number, byteLength: number, target?: number) {
    const entry: Record<string, number> = { buffer: 0, byteOffset, byteLength };
    if (target) entry.target = target;
    bufferViews.push(entry);
    return bufferViews.length - 1;
  }

  function imageFor(key: string) {
    const existing = textureIndex.get(key);
    if (existing !== undefined) return existing;
    const png = textures.get(key) ?? PLACEHOLDER_PNG;
    bin.align(4);
    const offset = bin.raw(png);
    const image = images.length;
    images.push({ mimeType: "image/png", bufferView: view(offset, png.byteLength) });
    textureIndex.set(key, image);
    return image;
  }

  function accessor(type: string, componentType: number, count: number, values: number[], target?: number, bounds?: { min: number[]; max: number[] }) {
    const width = type === "SCALAR" ? 1 : type === "VEC2" ? 2 : type === "VEC3" ? 3 : 4;
    const offset = componentType === FLOAT ? bin.f32(values) : bin.u16(values);
    const byteLength = count * width * (componentType === FLOAT ? 4 : 2);
    const index = accessors.length;
    accessors.push({
      bufferView: view(offset, byteLength, target),
      byteOffset: 0,
      componentType,
      count,
      type,
      ...(bounds ? { min: bounds.min, max: bounds.max } : {}),
    });
    return index;
  }

  const meshes: Array<Record<string, unknown>> = [];
  const materials: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [];
  const rootChildren: number[] = [];
  const propNodes = new Map<string, number>();
  const props = (project.scene.props ?? []).filter((prop) => !prop.hidden);

  function primitive(part: MeshPart) {
    const count = part.positions.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < count; index += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = part.positions[index * 3 + axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
    const material = materials.length;
    const image = imageFor(part.texture);
    const mode = alphaMode(part.texture);
    materials.push({
      name: part.texture,
      doubleSided: mode !== "OPAQUE",
      alphaMode: mode,
      ...(mode === "MASK" ? { alphaCutoff: 0.1 } : {}),
      pbrMetallicRoughness: {
        baseColorTexture: { index: image },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    });
    return {
      attributes: {
        POSITION: accessor("VEC3", FLOAT, count, part.positions, ARRAY, { min, max }),
        TEXCOORD_0: accessor("VEC2", FLOAT, count, part.uvs, ARRAY),
      },
      indices: accessor("SCALAR", USHORT, part.indices.length, part.indices, ELEMENT),
      material,
      mode: 4,
    };
  }

  for (const prop of props) {
    const parts = meshParts(modelFor(prop, project));
    const mesh = meshes.length;
    meshes.push({ name: prop.name || prop.catalogId, primitives: parts.map(primitive) });
    const node = nodes.length;
    const base = pose(prop, project.scene.propClip, 0);
    const q = quatFromEuler(base.rotation);
    nodes.push({
      name: prop.id,
      mesh,
      translation: [base.position.x, base.position.y, base.position.z],
      rotation: [q.x, q.y, q.z, q.w],
      scale: [base.scale.x, base.scale.y, base.scale.z],
    });
    propNodes.set(prop.id, node);
    rootChildren.push(node);
  }

  const player = project.scene.players[0];
  if (player) {
    const node = nodes.length;
    nodes.push({
      name: player.id,
      translation: [player.position?.x ?? 0, player.position?.y ?? 0, player.position?.z ?? 0],
    });
    rootChildren.push(node);
  }

  const animation = animationDocument(props, propNodes, project.scene.propClip, (type, count, values, bounds) =>
    accessor(type, FLOAT, count, values, undefined, bounds),
  );
  const root = nodes.length;
  nodes.push({ name: "pixelstage", children: rootChildren });
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "pixelstage" },
    scene: 0,
    scenes: [{ name: "pixelstage", nodes: [root] }],
    nodes,
    meshes,
    materials,
    textures: images.map((_image, index) => ({ sampler: 0, source: index })),
    images,
    samplers: [{ magFilter: NEAREST, minFilter: NEAREST, wrapS: CLAMP, wrapT: CLAMP }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  if (animation) json.animations = [animation];
  return { json, bin: bin.bytes() };
}

function animationDocument(
  props: SceneProp[],
  propNodes: Map<string, number>,
  clip: PropClip | null | undefined,
  accessor: (type: string, count: number, values: number[], bounds?: { min: number[]; max: number[] }) => number,
) {
  if (!clip?.keyframes.length) return null;
  const times = [...new Set(clip.keyframes.map((frame) => frame.time))].sort((a, b) => a - b);
  if (times.length < 1) return null;
  const timeAccessor = accessor("SCALAR", times.length, times, { min: [times[0]], max: [times[times.length - 1]] });
  const channels: Array<Record<string, unknown>> = [];
  const samplers: Array<Record<string, unknown>> = [];
  for (const prop of props) {
    const node = propNodes.get(prop.id);
    if (node === undefined) continue;
    const frames = times.map((time) => pose(prop, clip, time));
    const translation = frames.flatMap((frame) => [frame.position.x, frame.position.y, frame.position.z]);
    const rotation = frames.flatMap((frame) => {
      const q = quatFromEuler(frame.rotation);
      return [q.x, q.y, q.z, q.w];
    });
    const scale = frames.flatMap((frame) => [frame.scale.x, frame.scale.y, frame.scale.z]);
    pushChannel("translation", "VEC3", translation);
    pushChannel("rotation", "VEC4", rotation);
    pushChannel("scale", "VEC3", scale);

    function pushChannel(path: string, type: string, values: number[]) {
      const sampler = samplers.length;
      samplers.push({ input: timeAccessor, output: accessor(type, times.length, values), interpolation: "LINEAR" });
      channels.push({ sampler, target: { node, path } });
    }
  }
  if (!channels.length) return null;
  return { name: "props", channels, samplers };
}

export function gltfToGlb(document: GltfDocument): Uint8Array {
  const jsonText = JSON.stringify(document.json);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (document.bin.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + document.bin.length + binPad;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length + jsonPad, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad);
  const binHeader = 20 + jsonBytes.length + jsonPad;
  view.setUint32(binHeader, document.bin.length + binPad, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(document.bin, binHeader + 8);
  const patched = JSON.parse(jsonText) as { buffers: Array<{ byteLength: number; uri?: string }> };
  patched.buffers[0].byteLength = document.bin.length;
  return out;
}

export function writeGltfJson(document: GltfDocument, binName: string) {
  const json = structuredClone(document.json) as { buffers: Array<{ byteLength: number; uri?: string }> };
  json.buffers[0].uri = binName;
  json.buffers[0].byteLength = document.bin.length;
  return json;
}

type GltfJson = {
  nodes?: Array<{ name?: string }>;
  animations?: Array<{
    samplers?: Array<{ input?: number; output?: number }>;
    channels?: Array<{ sampler?: number; target?: { node?: number; path?: string } }>;
  }>;
  accessors?: Array<{ bufferView?: number; componentType?: number; count?: number; type?: string }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength?: number }>;
};

function readFloats(bin: Uint8Array, json: GltfJson, accessorIndex: number | undefined) {
  const accessor = accessorIndex === undefined ? undefined : json.accessors?.[accessorIndex];
  const bufferView = accessor?.bufferView === undefined ? undefined : json.bufferViews?.[accessor.bufferView];
  if (!accessor || !bufferView || accessor.componentType !== FLOAT) return null;
  const width = accessor.type === "SCALAR" ? 1 : accessor.type === "VEC3" ? 3 : accessor.type === "VEC4" ? 4 : 0;
  if (!width || !accessor.count) return null;
  const start = bufferView.byteOffset ?? 0;
  const floats = new Float32Array(bin.buffer, bin.byteOffset + start, accessor.count * width);
  return { width, values: Array.from(floats) };
}

/** Read node TRS keys written by `projectToGltf` back into a prop clip. */
export function propClipFromGltf(json: unknown, bin: Uint8Array, propIds: string[]): PropClip | null {
  if (!json || typeof json !== "object") return null;
  const document = json as GltfJson;
  const animation = document.animations?.[0];
  if (!animation?.channels?.length || !animation.samplers) return null;
  const names = new Map((document.nodes ?? []).map((node, index) => [index, node.name ?? ""]));
  const wanted = new Set(propIds);
  const byProp = new Map<string, Map<number, PropChannels>>();
  let duration = 0.2;
  for (const channel of animation.channels) {
    const name = names.get(channel.target?.node ?? -1) ?? "";
    if (!wanted.has(name) || !channel.target?.path) continue;
    const sampler = animation.samplers[channel.sampler ?? -1];
    const times = readFloats(bin, document, sampler?.input);
    const output = readFloats(bin, document, sampler?.output);
    if (!times || !output || times.width !== 1) continue;
    const path = channel.target.path;
    for (let index = 0; index < times.values.length; index += 1) {
      const time = Math.round(times.values[index] * 1000) / 1000;
      duration = Math.max(duration, time);
      const frames = byProp.get(name) ?? new Map<number, PropChannels>();
      byProp.set(name, frames);
      const channels = frames.get(time) ?? {};
      frames.set(time, channels);
      if (path === "translation" && output.width === 3) {
        const offset = index * 3;
        channels.position = { x: output.values[offset], y: output.values[offset + 1], z: output.values[offset + 2] };
      } else if (path === "scale" && output.width === 3) {
        const offset = index * 3;
        channels.scale = { x: output.values[offset], y: output.values[offset + 1], z: output.values[offset + 2] };
      } else if (path === "rotation" && output.width === 4) {
        const offset = index * 4;
        channels.rotation = eulerFromQuat({
          x: output.values[offset],
          y: output.values[offset + 1],
          z: output.values[offset + 2],
          w: output.values[offset + 3],
        });
      }
    }
  }
  if (!byProp.size) return null;
  const times = [...new Set([...byProp.values()].flatMap((frames) => [...frames.keys()]))].sort((a, b) => a - b);
  const clip = emptyPropClip(Math.min(30, Math.max(0.2, duration || 0.2)));
  clip.keyframes = times.map((time) => {
    const values: Record<string, PropChannels> = {};
    for (const [id, frames] of byProp) {
      const channels = frames.get(time);
      if (channels) values[id] = channels;
    }
    return { time, values };
  });
  return clip;
}

export function parseGlb(bytes: Uint8Array): { json: unknown; bin: Uint8Array } | null {
  if (bytes.length < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) return null;
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) return null;
  const jsonBytes = bytes.slice(20, 20 + jsonLength);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(jsonBytes)) as unknown;
  } catch {
    return null;
  }
  const binHeader = 20 + jsonLength;
  if (bytes.length < binHeader + 8) return { json, bin: new Uint8Array() };
  const binLength = view.getUint32(binHeader, true);
  const bin = bytes.slice(binHeader + 8, binHeader + 8 + binLength);
  return { json, bin };
}
