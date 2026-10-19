import { cubeElements, resolveModel, textureFile, type ModelDocument, type ModelLibrary } from "./mc-model.ts";
import type { CompiledElement, CompiledModel, FaceName } from "./model-types.ts";
import { FACE_NAMES } from "./model-types.ts";

export type CustomAsset = {
  id: string;
  name: string;
  kind: "block" | "item";
  model: CompiledModel;
  /** `custom:` texture keys → PNG data URLs. Vanilla paths stay as files. */
  textures: Record<string, string>;
};

const DATA_URL = /^data:image\/png;base64,[a-z0-9+/]+=*$/i;

export function isPngDataUrl(value: string) {
  return DATA_URL.test(value) && value.length < 4_000_000;
}

function slug(name: string) {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
  return cleaned || "custom";
}

export function customId(name: string, salt = Math.random().toString(36).slice(2, 8)) {
  return `custom:${slug(name)}_${salt}`;
}

function withTextures(model: CompiledModel, textures: Record<string, string>): CompiledModel {
  const remap = (texture: string) => textures[texture] ? texture : texture;
  return {
    ...model,
    particle: model.particle ? remap(model.particle) : undefined,
    layers: model.layers?.map(remap),
    elements: model.elements.map((element) => ({
      ...element,
      faces: Object.fromEntries(
        Object.entries(element.faces).map(([face, value]) => [face, value ? { ...value, texture: remap(value.texture) } : value]),
      ),
    })),
  };
}

export function customFromPng(options: {
  name: string;
  kind: "block" | "item";
  /** Data URLs. `all` fills every missing face. An item uses `all` or `south`. */
  images: Partial<Record<FaceName | "all", string>>;
  id?: string;
}): CustomAsset {
  const name = options.name.trim().slice(0, 48) || (options.kind === "item" ? "Item" : "Block");
  const id = options.id ?? customId(name);
  const images = options.images;
  for (const value of Object.values(images)) {
    if (value && !isPngDataUrl(value)) throw new Error("err.customPng");
  }
  const textures: Record<string, string> = {};
  const keyFor = (slot: string, data: string) => {
    const key = `${id}:${slot}`;
    textures[key] = data;
    return key;
  };
  if (options.kind === "item") {
    const data = images.all || images.south || images.up;
    if (!data) throw new Error("err.customPng");
    const texture = keyFor("sprite", data);
    const model = resolveModel({ get: () => ({ parent: "builtin/generated", textures: { layer0: texture } }) }, "item/custom");
    if (!model) throw new Error("err.customModel");
    return { id, name, kind: "item", model: { ...model, particle: texture, layers: [texture] }, textures };
  }
  const all = images.all;
  const faces: Partial<Record<FaceName, string>> = {};
  for (const face of FACE_NAMES) {
    const data = images[face] || all;
    if (!data) continue;
    faces[face] = keyFor(face, data);
  }
  if (!Object.keys(faces).length) throw new Error("err.customPng");
  const elements = cubeElements(faces);
  return {
    id,
    name,
    kind: "block",
    model: { elements, particle: faces.up || faces.south || Object.values(faces)[0] },
    textures,
  };
}

function textureKey(reference: string, files: Map<string, string>, id: string, textures: Record<string, string>) {
  const file = textureFile(reference);
  const base = file.split("/").pop() ?? file;
  const data = files.get(base) || files.get(file) || files.get(base.replace(/\.png$/, ""));
  if (data) {
    if (!isPngDataUrl(data)) throw new Error("err.customPng");
    const key = `${id}:${base}`;
    textures[key] = data;
    return key;
  }
  return file;
}

/** A Java block/item model. Parents in the same upload are resolved; common vanilla parents are built in. */
export function customFromJavaModel(json: unknown, files: Map<string, string>, options?: { name?: string; id?: string; kind?: "block" | "item" }): CustomAsset {
  if (!json || typeof json !== "object") throw new Error("err.customModel");
  const document = json as ModelDocument & { credit?: string };
  const name = (options?.name || "Model").trim().slice(0, 48) || "Model";
  const id = options?.id ?? customId(name);
  const textures: Record<string, string> = {};
  const rewritten = rewriteDocument(document, files, id, textures);
  const library = builtinLibrary(rewritten);
  const model = resolveModel(library, "upload/model");
  if (!model || !model.elements.length) throw new Error("err.customModel");
  const kind = options?.kind ?? (model.layers?.length && model.elements.length <= 2 ? "item" : "block");
  return { id, name, kind, model: withTextures(model, textures), textures };
}

function textureString(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "sprite" in value && typeof (value as { sprite?: unknown }).sprite === "string") {
    return (value as { sprite: string }).sprite;
  }
  return "";
}

function rewriteDocument(document: ModelDocument, files: Map<string, string>, id: string, textures: Record<string, string>): ModelDocument {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(document.textures ?? {})) {
    const raw = textureString(value);
    if (!raw) continue;
    mapped[key] = raw.startsWith("#") ? raw : textureKey(raw, files, id, textures);
  }
  return { ...document, textures: mapped };
}

function builtinLibrary(uploaded: ModelDocument): ModelLibrary {
  const templates: Record<string, ModelDocument> = {
    "upload/model": uploaded,
    "block/cube": {
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: {
            down: { texture: "#down", cullface: "down" },
            up: { texture: "#up", cullface: "up" },
            north: { texture: "#north", cullface: "north" },
            south: { texture: "#south", cullface: "south" },
            west: { texture: "#west", cullface: "west" },
            east: { texture: "#east", cullface: "east" },
          },
        },
      ],
    },
    "block/cube_all": {
      parent: "block/cube",
      textures: { particle: "#all", down: "#all", up: "#all", north: "#all", south: "#all", west: "#all", east: "#all" },
    },
    "block/cube_column": {
      parent: "block/cube",
      textures: { particle: "#side", down: "#end", up: "#end", north: "#side", south: "#side", west: "#side", east: "#side" },
    },
    "block/cube_bottom_top": {
      parent: "block/cube",
      textures: { particle: "#side", down: "#bottom", up: "#top", north: "#side", south: "#side", west: "#side", east: "#side" },
    },
    "item/generated": { parent: "builtin/generated" },
    "item/handheld": { parent: "item/generated" },
    "builtin/generated": { parent: "builtin/generated" },
  };
  return { get: (path) => templates[path.replace(/^minecraft:/, "")] ?? null };
}

type BbFace = { uv?: number[]; texture?: number | null; rotation?: number };
type BbElement = {
  from?: number[];
  to?: number[];
  rotation?: { origin?: number[]; axis?: string; angle?: number; rescale?: boolean };
  faces?: Partial<Record<string, BbFace>>;
};
type BbTexture = { name?: string; source?: string; width?: number; height?: number };

/** Blockbench `.bbmodel` with embedded PNG sources. */
export function customFromBbmodel(json: unknown, options?: { name?: string; id?: string }): CustomAsset {
  if (!json || typeof json !== "object") throw new Error("err.customModel");
  const record = json as {
    name?: string;
    resolution?: { width?: number; height?: number };
    elements?: BbElement[];
    textures?: BbTexture[];
    meta?: { model_format?: string };
  };
  const name = (options?.name || record.name || "Blockbench").trim().slice(0, 48) || "Blockbench";
  const id = options?.id ?? customId(name);
  const textures: Record<string, string> = {};
  const textureKeys: string[] = [];
  for (const [index, texture] of (record.textures ?? []).entries()) {
    const source = texture.source ?? "";
    if (!source) {
      textureKeys.push("");
      continue;
    }
    if (!isPngDataUrl(source)) throw new Error("err.customPng");
    const key = `${id}:tex${index}`;
    textures[key] = source;
    textureKeys.push(key);
  }
  const width = record.resolution?.width || 16;
  const height = record.resolution?.height || 16;
  const elements: CompiledElement[] = [];
  for (const element of record.elements ?? []) {
    if (!element.from || !element.to || element.from.length < 3 || element.to.length < 3) continue;
    const faces: CompiledElement["faces"] = {};
    for (const faceName of FACE_NAMES) {
      const face = element.faces?.[faceName];
      if (!face || face.texture === null || face.texture === undefined) continue;
      const texture = textureKeys[face.texture] ?? "";
      if (!texture) continue;
      const uv: [number, number, number, number] = face.uv && face.uv.length >= 4
        ? [(face.uv[0] / width) * 16, (face.uv[1] / height) * 16, (face.uv[2] / width) * 16, (face.uv[3] / height) * 16]
        : [0, 0, 16, 16];
      const rotation = face.rotation === 90 || face.rotation === 180 || face.rotation === 270 ? face.rotation : undefined;
      faces[faceName] = { uv, texture, ...(rotation ? { rotation } : {}) };
    }
    if (!Object.keys(faces).length) continue;
    const spin = element.rotation;
    const axis = spin?.axis;
    const rotation: CompiledElement["rotation"] = spin && (axis === "x" || axis === "y" || axis === "z")
      ? {
          origin: [spin.origin?.[0] ?? 8, spin.origin?.[1] ?? 8, spin.origin?.[2] ?? 8],
          axis,
          angle: Number(spin.angle) || 0,
          ...(spin.rescale ? { rescale: true as const } : {}),
        }
      : undefined;
    elements.push({
      from: [element.from[0], element.from[1], element.from[2]],
      to: [element.to[0], element.to[1], element.to[2]],
      ...(rotation ? { rotation } : {}),
      faces,
    });
  }
  if (!elements.length) throw new Error("err.customModel");
  const kind = record.meta?.model_format?.includes("item") ? "item" : "block";
  const particle = elements[0]?.faces.up?.texture || elements[0]?.faces.south?.texture || Object.values(textures)[0];
  return { id, name, kind, model: { elements, ...(particle ? { particle } : {}) }, textures };
}

export function parseCustomFile(name: string, text: string, files: Map<string, string> = new Map()): CustomAsset {
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error("err.customModel");
  }
  if (name.toLowerCase().endsWith(".bbmodel") || (json && typeof json === "object" && "elements" in json && "textures" in json && "meta" in json)) {
    return customFromBbmodel(json, { name: name.replace(/\.(bbmodel|json)$/i, "") });
  }
  return customFromJavaModel(json, files, { name: name.replace(/\.json$/i, "") });
}
