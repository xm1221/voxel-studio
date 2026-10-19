import type { Vec3 } from "./model-types.ts";

export type PropChannels = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

export type PropKeyframe = {
  time: number;
  values: Record<string, PropChannels>;
};

export type PropClip = {
  v: 1;
  duration: number;
  loop: boolean;
  autoKey: boolean;
  keyframes: PropKeyframe[];
};

const MIN_DURATION = 0.2;
const MAX_DURATION = 30;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}

function smooth(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mixVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) };
}

export function emptyPropClip(duration = 2): PropClip {
  return { v: 1, duration: clamp(duration, MIN_DURATION, MAX_DURATION), loop: true, autoKey: true, keyframes: [] };
}

export function parsePropClip(value: unknown): PropClip | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<PropClip>;
  if (record.v !== 1 || !Array.isArray(record.keyframes)) return null;
  const duration = typeof record.duration === "number" && Number.isFinite(record.duration) ? clamp(record.duration, MIN_DURATION, MAX_DURATION) : 2;
  const keyframes: PropKeyframe[] = [];
  for (const frame of record.keyframes) {
    if (!frame || typeof frame !== "object") continue;
    const time = (frame as PropKeyframe).time;
    const values = (frame as PropKeyframe).values;
    if (typeof time !== "number" || !Number.isFinite(time) || !values || typeof values !== "object") continue;
    keyframes.push({ time: roundTime(clamp(time, 0, duration)), values });
  }
  keyframes.sort((a, b) => a.time - b.time);
  return { v: 1, duration, loop: record.loop !== false, autoKey: Boolean(record.autoKey), keyframes };
}

export function writePropKey(clip: PropClip, time: number, id: string, channels: PropChannels): PropClip {
  const at = roundTime(clamp(time, 0, clip.duration));
  const keyframes = clip.keyframes.map((frame) => ({ time: frame.time, values: { ...frame.values } }));
  let frame = keyframes.find((entry) => Math.abs(entry.time - at) < 0.02);
  if (!frame) {
    frame = { time: at, values: {} };
    keyframes.push(frame);
    keyframes.sort((a, b) => a.time - b.time);
  }
  frame.values[id] = {
    position: channels.position ? { ...channels.position } : frame.values[id]?.position,
    rotation: channels.rotation ? { ...channels.rotation } : frame.values[id]?.rotation,
    scale: channels.scale ? { ...channels.scale } : frame.values[id]?.scale,
  };
  return { ...clip, keyframes };
}

function channelAt(frames: Array<{ time: number; value: Vec3 }>, time: number): Vec3 | undefined {
  if (!frames.length) return undefined;
  if (time <= frames[0].time) return frames[0].value;
  const last = frames[frames.length - 1];
  if (time >= last.time) return last.value;
  for (let index = 0; index < frames.length - 1; index += 1) {
    const a = frames[index];
    const b = frames[index + 1];
    if (time >= a.time && time <= b.time) {
      const span = Math.max(0.0001, b.time - a.time);
      return mixVec(a.value, b.value, smooth((time - a.time) / span));
    }
  }
  return last.value;
}

/** Sample every prop that has keys. Missing channels are left unset. */
export function samplePropClip(clip: PropClip | null, time: number): Record<string, PropChannels> {
  if (!clip || !clip.keyframes.length) return {};
  const duration = clip.duration;
  let at = time;
  if (clip.loop && duration > 0) {
    at = time % duration;
    if (at < 0) at += duration;
  } else {
    at = clamp(time, 0, duration);
  }
  const ids = new Set<string>();
  for (const frame of clip.keyframes) {
    for (const id of Object.keys(frame.values)) ids.add(id);
  }
  const result: Record<string, PropChannels> = {};
  for (const id of ids) {
    const position = channelAt(
      clip.keyframes.filter((frame) => frame.values[id]?.position).map((frame) => ({ time: frame.time, value: frame.values[id].position as Vec3 })),
      at,
    );
    const rotation = channelAt(
      clip.keyframes.filter((frame) => frame.values[id]?.rotation).map((frame) => ({ time: frame.time, value: frame.values[id].rotation as Vec3 })),
      at,
    );
    const scale = channelAt(
      clip.keyframes.filter((frame) => frame.values[id]?.scale).map((frame) => ({ time: frame.time, value: frame.values[id].scale as Vec3 })),
      at,
    );
    result[id] = { ...(position ? { position } : {}), ...(rotation ? { rotation } : {}), ...(scale ? { scale } : {}) };
  }
  return result;
}
