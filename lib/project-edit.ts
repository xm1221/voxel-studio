import { catalogEntries, installCatalog, resetCatalog } from "./catalog.ts";
import { customFromPng, isPngDataUrl, parseCustomFile, type CustomAsset } from "./custom-import.ts";
import { exportProject, parseProject, type ProjectFile } from "./project.ts";
import { emptyPropClip, parsePropClip, writePropKey, type PropChannels, type PropClip } from "./prop-clip.ts";
import { isCatalogId, placeProp } from "./props.ts";
import { defaultScene, sceneFromPayload } from "./studio-state.ts";
import type { SceneDraft } from "./types.ts";

export function blankProject(): ProjectFile {
  return exportProject(defaultScene(""), undefined, []);
}

export function projectErrors(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["/ : expected a project object"];
  const record = value as { v?: unknown; scene?: unknown; customs?: unknown };
  if (record.v !== 1) errors.push("/v : expected 1");
  if (!record.scene || typeof record.scene !== "object") {
    errors.push("/scene : expected an object");
    return errors;
  }
  const scene = record.scene as { v?: unknown; players?: unknown; props?: unknown; propClip?: unknown };
  if (scene.v !== 1) errors.push("/scene/v : expected 1");
  if (!Array.isArray(scene.players) || scene.players.length === 0) errors.push("/scene/players : expected a non-empty array");
  else {
    scene.players.forEach((player, index) => {
      if (!player || typeof player !== "object" || typeof (player as { id?: unknown }).id !== "string") {
        errors.push(`/scene/players/${index}/id : expected a string`);
      }
    });
  }
  if (scene.props !== undefined) {
    if (!Array.isArray(scene.props)) errors.push("/scene/props : expected an array");
    else {
      scene.props.forEach((prop, index) => {
        const item = prop as { id?: unknown; catalogId?: unknown; position?: { x?: unknown } };
        if (!item || typeof item !== "object") {
          errors.push(`/scene/props/${index} : expected an object`);
          return;
        }
        if (typeof item.id !== "string") errors.push(`/scene/props/${index}/id : expected a string`);
        if (typeof item.catalogId !== "string" || !isCatalogId(item.catalogId)) errors.push(`/scene/props/${index}/catalogId : not a catalog id`);
        if (!item.position || typeof item.position.x !== "number") errors.push(`/scene/props/${index}/position : expected x, y, z numbers`);
      });
    }
  }
  if (scene.propClip !== undefined && scene.propClip !== null && !parsePropClip(scene.propClip)) errors.push("/scene/propClip : not a v1 prop clip");
  if (record.customs !== undefined) {
    if (!Array.isArray(record.customs)) errors.push("/customs : expected an array");
    else {
      record.customs.forEach((asset, index) => {
        const item = asset as { id?: unknown; textures?: Record<string, unknown>; model?: { elements?: unknown } };
        if (!item || typeof item.id !== "string" || !item.id.startsWith("custom:")) errors.push(`/customs/${index}/id : expected a custom: id`);
        if (!item.model || !Array.isArray(item.model.elements) || item.model.elements.length === 0) errors.push(`/customs/${index}/model : expected elements`);
        const textures = item.textures ?? {};
        for (const [key, texture] of Object.entries(textures)) {
          if (typeof texture !== "string" || !isPngDataUrl(texture)) errors.push(`/customs/${index}/textures/${key} : expected a PNG data URL`);
        }
      });
    }
  }
  if (!errors.length && !parseProject(value)) errors.push("/ : project failed to parse");
  return errors;
}

function sceneFromPayloadSafe(parsed: { payload: ProjectFile["scene"]; customs: CustomAsset[] }) {
  return sceneFromPayload(parsed.payload, "", "").scene;
}

export function openProject(value: unknown): { project: ProjectFile; scene: SceneDraft } | { error: string } {
  const errors = projectErrors(value);
  if (errors.length) return { error: errors[0] };
  const parsed = parseProject(value);
  if (!parsed) return { error: "/ : project failed to parse" };
  const scene = sceneFromPayloadSafe(parsed);
  return { project: { v: 1, scene: parsed.payload, customs: parsed.customs }, scene };
}

export function withScene(scene: SceneDraft, customs: CustomAsset[], camera?: ProjectFile["scene"]["camera"]): ProjectFile {
  return exportProject(scene, camera, customs);
}

export function addCatalogProp(project: ProjectFile, catalogId: string): { project: ProjectFile } | { error: string } {
  const opened = openProject(project);
  if ("error" in opened) return opened;
  const prop = placeProp(catalogId, opened.scene.props);
  if (!prop) return { error: `cannot place ${catalogId}` };
  opened.scene.props = [...opened.scene.props, prop];
  opened.scene.activePropId = prop.id;
  return { project: withScene(opened.scene, opened.project.customs, opened.project.scene.camera) };
}

export function addCustom(project: ProjectFile, asset: CustomAsset): { project: ProjectFile } | { error: string } {
  const opened = openProject(project);
  if ("error" in opened) return opened;
  if (opened.project.customs.length >= 32 && !opened.project.customs.some((item) => item.id === asset.id)) return { error: "custom asset cap is 32" };
  const customs = [...opened.project.customs.filter((item) => item.id !== asset.id), asset];
  const prop = placeProp(asset.id, opened.scene.props);
  if (!prop) return { error: "cannot place the custom asset" };
  opened.scene.props = [...opened.scene.props, prop];
  opened.scene.activePropId = prop.id;
  return { project: withScene(opened.scene, customs, opened.project.scene.camera) };
}

export function customFromImage(name: string, kind: "item" | "block", png: Uint8Array): CustomAsset {
  const data = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  return customFromPng({ name, kind, images: { all: data } });
}

export function customFromModelText(name: string, text: string): CustomAsset {
  return parseCustomFile(name, text);
}

export function writeKeyframe(project: ProjectFile, propId: string, time: number, channels: PropChannels): { project: ProjectFile } | { error: string } {
  const opened = openProject(project);
  if ("error" in opened) return opened;
  if (!opened.scene.props.some((prop) => prop.id === propId)) return { error: `no prop ${propId}` };
  const clip = opened.scene.propClip ?? emptyPropClip(Math.max(2, time));
  const duration = Math.min(30, Math.max(clip.duration, time));
  opened.scene.propClip = writePropKey({ ...clip, duration }, time, propId, channels);
  return { project: withScene(opened.scene, opened.project.customs, opened.project.scene.camera) };
}

export function replacePropClip(project: ProjectFile, clip: PropClip): { project: ProjectFile } | { error: string } {
  const opened = openProject(project);
  if ("error" in opened) return opened;
  opened.scene.propClip = clip;
  return { project: withScene(opened.scene, opened.project.customs, opened.project.scene.camera) };
}

export function searchCatalog(query: string, file?: unknown) {
  if (file) installCatalog(file);
  else resetCatalog();
  const needle = query.trim().toLowerCase();
  return catalogEntries()
    .filter((entry) => !needle || entry.id.includes(needle) || entry.en.toLowerCase().includes(needle) || entry.zh.includes(needle))
    .slice(0, 40);
}
