import type { CompiledElement, CompiledModel } from "./model-types.ts";
import { FACE_NAMES } from "./model-types.ts";
import type { ProjectFile } from "./project.ts";
import { emptyPropClip, type PropChannels, type PropClip } from "./prop-clip.ts";
import type { SceneProp } from "./types.ts";

type BbGroup = { uuid?: string; name?: string; origin?: number[]; rotation?: number[]; children?: string[] };
type BbAnimator = {
  keyframes?: Array<{ channel?: string; time?: number; data_points?: Array<{ x?: string | number; y?: string | number; z?: string | number }> }>;
};

const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function modelFor(prop: SceneProp, project: ProjectFile): CompiledModel | null {
  const custom = project.customs.find((asset) => asset.id === prop.catalogId);
  if (custom?.model.elements.length) return custom.model;
  return null;
}

function num(value: string | number | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function projectToBbmodel(project: ProjectFile, textures = new Map<string, string>()) {
  const elements: Array<Record<string, unknown>> = [];
  const groups: BbGroup[] = [];
  const textureList: Array<{ name: string; source: string }> = [];
  const textureIndex = new Map<string, number>();

  function textureOf(key: string) {
    const existing = textureIndex.get(key);
    if (existing !== undefined) return existing;
    const index = textureList.length;
    textureList.push({ name: key.split("/").pop() || `tex${index}`, source: textures.get(key) || PLACEHOLDER });
    textureIndex.set(key, index);
    return index;
  }

  for (const prop of project.scene.props ?? []) {
    const model = modelFor(prop, project);
    const children: string[] = [];
    const cubes = model?.elements ?? [
      {
        from: [0, 0, 0] as [number, number, number],
        to: [16, 16, 16] as [number, number, number],
        faces: Object.fromEntries(FACE_NAMES.map((face) => [face, { uv: [0, 0, 16, 16], texture: prop.catalogId }])) as CompiledElement["faces"],
      },
    ];
    cubes.forEach((element, index) => {
      const uuid = `${prop.id}_e${index}`;
      children.push(uuid);
      const faces: Record<string, unknown> = {};
      for (const faceName of FACE_NAMES) {
        const face = element.faces[faceName];
        if (!face) continue;
        faces[faceName] = {
          uv: [face.uv[0], face.uv[1], face.uv[2], face.uv[3]],
          texture: textureOf(face.texture),
          ...(face.rotation ? { rotation: face.rotation } : {}),
        };
      }
      elements.push({
        uuid,
        name: prop.name || prop.catalogId,
        from: [...element.from],
        to: [...element.to],
        faces,
        ...(element.rotation
          ? { rotation: { origin: [...element.rotation.origin], axis: element.rotation.axis, angle: element.rotation.angle, rescale: Boolean(element.rotation.rescale) } }
          : {}),
      });
    });
    groups.push({
      uuid: prop.id,
      name: prop.name || prop.catalogId,
      origin: [prop.position.x, prop.position.y, prop.position.z],
      rotation: [prop.rotation.x, prop.rotation.y, prop.rotation.z],
      children,
    });
  }

  const clip = project.scene.propClip;
  const animations = clip?.keyframes.length
    ? [
        {
          uuid: "pixelstage_clip",
          name: "props",
          loop: clip.loop ? "loop" : "once",
          length: clip.duration,
          animators: Object.fromEntries(
            (project.scene.props ?? []).map((prop) => {
              const keyframes = clip.keyframes.flatMap((frame) => {
                const channels = frame.values[prop.id];
                if (!channels) return [];
                return (["position", "rotation", "scale"] as const).flatMap((channel) => {
                  const value = channels[channel];
                  if (!value) return [];
                  return [
                    {
                      channel,
                      time: frame.time,
                      interpolation: "linear",
                      data_points: [{ x: String(value.x), y: String(value.y), z: String(value.z) }],
                    },
                  ];
                });
              });
              return [prop.id, { name: prop.name || prop.catalogId, type: "bone", keyframes }];
            }),
          ),
        },
      ]
    : [];

  return {
    meta: { format_version: "4.10", model_format: "free", box_uv: false },
    name: "pixelstage",
    resolution: { width: 16, height: 16 },
    elements,
    groups,
    textures: textureList,
    animations,
  };
}

export function propClipFromBbmodel(json: unknown, propIds: string[]): PropClip | null {
  if (!json || typeof json !== "object") return null;
  const record = json as { animations?: Array<{ loop?: string; length?: number; animators?: Record<string, BbAnimator> }> };
  const animation = record.animations?.[0];
  if (!animation?.animators) return null;
  const wanted = new Set(propIds);
  const byTime = new Map<number, Record<string, PropChannels>>();
  let duration = typeof animation.length === "number" && animation.length > 0 ? animation.length : 0.2;
  for (const [id, animator] of Object.entries(animation.animators)) {
    if (!wanted.has(id)) continue;
    for (const key of animator.keyframes ?? []) {
      const point = key.data_points?.[0];
      if (!point || (key.channel !== "position" && key.channel !== "rotation" && key.channel !== "scale")) continue;
      const time = Math.round((Number(key.time) || 0) * 1000) / 1000;
      duration = Math.max(duration, time);
      const values = byTime.get(time) ?? {};
      byTime.set(time, values);
      const channels = values[id] ?? {};
      values[id] = channels;
      channels[key.channel] = { x: num(point.x), y: num(point.y), z: num(point.z) };
    }
  }
  if (!byTime.size) return null;
  const clip = emptyPropClip(Math.min(30, Math.max(0.2, duration)));
  clip.loop = animation.loop !== "once";
  clip.keyframes = [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, values]) => ({ time: Math.min(time, clip.duration), values }));
  return clip;
}
