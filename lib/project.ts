import type { CustomAsset } from "./custom-import.ts";
import { isPngDataUrl } from "./custom-import.ts";
import { toPayload, type SharePayload } from "./persist.ts";
import type { CameraSnapshot, SceneDraft } from "./types.ts";

export type ProjectFile = {
  v: 1;
  scene: SharePayload;
  customs: CustomAsset[];
};

function isCustomAsset(value: unknown): value is CustomAsset {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CustomAsset>;
  if (typeof record.id !== "string" || !record.id.startsWith("custom:")) return false;
  if (typeof record.name !== "string" || (record.kind !== "block" && record.kind !== "item")) return false;
  if (!record.model || !Array.isArray(record.model.elements) || !record.model.elements.length) return false;
  if (!record.textures || typeof record.textures !== "object") return false;
  return Object.values(record.textures).every((texture) => typeof texture === "string" && isPngDataUrl(texture));
}

export function exportProject(scene: SceneDraft, camera: CameraSnapshot | undefined, customs: CustomAsset[]): ProjectFile {
  return {
    v: 1,
    scene: toPayload(scene, camera, true),
    customs: customs.filter(isCustomAsset),
  };
}

export function parseProject(value: unknown): { payload: SharePayload; customs: CustomAsset[] } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { v?: unknown; scene?: SharePayload; customs?: unknown };
  if (record.v !== 1 || !record.scene || record.scene.v !== 1 || !Array.isArray(record.scene.players) || record.scene.players.length === 0) return null;
  const customs = Array.isArray(record.customs) ? record.customs.filter(isCustomAsset) : [];
  return { payload: record.scene, customs };
}
