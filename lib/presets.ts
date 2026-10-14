import type { CameraSnapshot, Joints, LightId } from "./types";

function presetError(key: string, vars?: Record<string, string | number>) {
  return vars ? `${key}|${JSON.stringify(vars)}` : key;
}

export const PRESET_STORAGE_KEY = "pixelstage.presets.v1";

export const JOINT_LIMITS: Record<keyof Joints, { min: number; max: number }> = {
  headX: { min: -40, max: 40 },
  headY: { min: -55, max: 55 },
  bodyX: { min: -30, max: 30 },
  rArmX: { min: -170, max: 170 },
  rArmZ: { min: -180, max: 40 },
  rElbow: { min: -150, max: 30 },
  lArmX: { min: -170, max: 170 },
  lArmZ: { min: -40, max: 180 },
  lElbow: { min: -150, max: 30 },
  rLegX: { min: -120, max: 70 },
  rKnee: { min: -15, max: 150 },
  lLegX: { min: -120, max: 70 },
  lKnee: { min: -15, max: 150 },
};

const JOINT_KEYS = Object.keys(JOINT_LIMITS) as (keyof Joints)[];
const LIGHTS = new Set<LightId>(["soft", "hard", "neon", "moon"]);

export type PresetLook = {
  light?: LightId;
  keyIntensity?: number;
};

export type UserPreset = {
  id: string;
  name: string;
  joints: Joints;
  look?: PresetLook;
  camera?: CameraSnapshot;
};

export type PresetDocument = {
  v: 1;
  presets: UserPreset[];
};

export function presetDocument(presets: UserPreset[]): PresetDocument {
  return { v: 1, presets };
}

export function newPresetId(existing: { id: string }[]) {
  const taken = new Set(existing.map((preset) => preset.id));
  let id = "";
  do {
    id = `u_${Math.random().toString(36).slice(2, 8)}`;
  } while (taken.has(id));
  return id;
}

export function mergePresets(current: UserPreset[], incoming: UserPreset[]): { ok: true; presets: UserPreset[] } | { ok: false; error: string } {
  if (current.length + incoming.length > 40) return { ok: false, error: presetError("err.presetMerge") };
  const taken = new Set(current.map((preset) => preset.id));
  const presets = [...current];
  for (const preset of incoming) {
    let id = taken.has(preset.id) ? "" : preset.id;
    while (!id || taken.has(id)) id = `u_${Math.random().toString(36).slice(2, 8)}`;
    taken.add(id);
    presets.push({ ...preset, id });
  }
  return { ok: true, presets };
}

export function parsePresetDocument(value: unknown): { ok: true; presets: UserPreset[] } | { ok: false; error: string } {
  const body = unwrap(value);
  if (!body.ok) return body;
  if (body.presets.length > 40) return { ok: false, error: presetError("err.presetCap") };
  const presets: UserPreset[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < body.presets.length; index += 1) {
    const parsed = parsePreset(body.presets[index], index);
    if (!parsed.ok) return parsed;
    let id = parsed.preset.id;
    while (seen.has(id)) id = `${id}_${presets.length}`;
    seen.add(id);
    presets.push({ ...parsed.preset, id });
  }
  if (!presets.length) return { ok: false, error: presetError("err.presetEmpty") };
  return { ok: true, presets };
}

function unwrap(value: unknown): { ok: true; presets: unknown[] } | { ok: false; error: string } {
  if (Array.isArray(value)) return { ok: true, presets: value };
  if (!value || typeof value !== "object") return { ok: false, error: presetError("err.presetJson") };
  const record = value as { v?: unknown; presets?: unknown; joints?: unknown };
  if (record.joints && !record.presets) return { ok: true, presets: [value] };
  if (record.v !== 1) return { ok: false, error: presetError("err.presetVersion") };
  if (!Array.isArray(record.presets)) return { ok: false, error: presetError("err.presetList") };
  return { ok: true, presets: record.presets };
}

function parsePreset(value: unknown, index: number): { ok: true; preset: UserPreset } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: presetError("err.presetObject", { n: index + 1 }) };
  const record = value as { id?: unknown; name?: unknown; joints?: unknown; look?: unknown; camera?: unknown };
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name || name.length > 24) return { ok: false, error: presetError("err.presetName", { n: index + 1 }) };
  const joints = parseJoints(record.joints);
  if (!joints) return { ok: false, error: presetError("err.presetJoints", { name }) };
  const look = parseLook(record.look);
  if (look === "bad") return { ok: false, error: presetError("err.presetLight", { name }) };
  const camera = parseCamera(record.camera);
  if (camera === "bad") return { ok: false, error: presetError("err.presetCamera", { name }) };
  const id = typeof record.id === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(record.id) ? record.id : `u_${index}`;
  return { ok: true, preset: { id, name, joints, look, camera } };
}

function parseJoints(value: unknown): Joints | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Record<keyof Joints, unknown>>;
  const joints = {} as Joints;
  for (const key of JOINT_KEYS) {
    const number = record[key];
    const limit = JOINT_LIMITS[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < limit.min || number > limit.max) return null;
    joints[key] = number;
  }
  return joints;
}

function parseLook(value: unknown): PresetLook | undefined | "bad" {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return "bad";
  const record = value as { light?: unknown; keyIntensity?: unknown };
  const look: PresetLook = {};
  if (record.light !== undefined) {
    if (typeof record.light !== "string" || !LIGHTS.has(record.light as LightId)) return "bad";
    look.light = record.light as LightId;
  }
  if (record.keyIntensity !== undefined) {
    if (typeof record.keyIntensity !== "number" || !Number.isFinite(record.keyIntensity) || record.keyIntensity < 0.45 || record.keyIntensity > 1.6) return "bad";
    look.keyIntensity = record.keyIntensity;
  }
  return look;
}

function parseCamera(value: unknown): CameraSnapshot | undefined | "bad" {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return "bad";
  const record = value as { p?: unknown; t?: unknown };
  const p = triple(record.p);
  const t = triple(record.t);
  if (!p || !t) return "bad";
  return { p, t };
}

function triple(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item) && Math.abs(item) < 500)) return null;
  return [value[0], value[1], value[2]];
}
