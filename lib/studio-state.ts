import { code } from "./i18n.ts";
import { withBasePath } from "./paths.ts";
import { poseById, resetPlayer } from "./poses.ts";
import { backgroundFitFrom, backgroundImageFrom, playerSettingsFromPayload, type SharePayload } from "./persist.ts";
import { parsePropClip } from "./prop-clip.ts";
import { activePropFrom, parseSceneProps } from "./props.ts";
import { scenePackById } from "./scene-packs.ts";
import { DEFAULT_SCENE_LOOK, resetSceneLook } from "./stage-look.ts";
import type { CameraSnapshot, PlayerDraft, SceneDraft } from "./types.ts";

export { resetPlayer, resetSceneLook };

export const STORAGE_KEY = "pixelstage.v1";

export function newId() {
  return `p_${Math.random().toString(36).slice(2, 8)}`;
}

export function makePlayer(partial: Partial<PlayerDraft> & Pick<PlayerDraft, "name" | "skinUrl" | "model">): PlayerDraft {
  return {
    id: newId(),
    source: "builtin",
    username: null,
    capeUrl: null,
    showCape: true,
    poseId: "idle",
    joints: poseById("idle").joints,
    clip: "idle",
    clipSpeed: 1,
    customAnimation: null,
    showOuter: true,
    layerMode: "flat",
    position: { x: 0, y: 0, z: 0 },
    scale: 1,
    nametag: "",
    bubble: "",
    ...partial,
  };
}

export function defaultScene(steve: string): SceneDraft {
  const player = makePlayer({ name: "Steve", skinUrl: steve, model: "default", source: "builtin" });
  return {
    players: [player],
    activeId: player.id,
    props: [],
    activePropId: null,
    propClip: null,
    ...DEFAULT_SCENE_LOOK,
    formatId: "youtube",
  };
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function positionPart(value: unknown, fallback: number, min: number, max: number) {
  return numberInRange(value, min, max, fallback);
}

export function sceneFromPayload(payload: SharePayload, steve: string, alex: string): { scene: SceneDraft; camera?: CameraSnapshot; refetch: string[] } {
  const refetch: string[] = [];
  const players = payload.players.slice(0, 4).map((player, index) => {
    const settings = playerSettingsFromPayload(player, payload);
    let skinUrl = player.skinUrl || "";
    if (player.source === "builtin") {
      skinUrl = player.name === "Alex" ? alex : steve;
    } else if (player.source === "username" && player.username) {
      refetch.push(player.id);
      skinUrl = steve;
    } else if (!skinUrl) {
      skinUrl = steve;
    }
    return {
      id: player.id || `p_${index + 1}`,
      name: player.name || "Steve",
      source: player.source || "builtin",
      username: player.username ?? null,
      skinUrl,
      capeUrl: player.capeUrl ?? null,
      showCape: player.showCape !== false,
      model: player.model === "slim" ? "slim" : "default",
      poseId: player.poseId || "idle",
      joints: player.joints,
      ...settings,
      position: {
        x: positionPart(player.position?.x, 0, -32, 32),
        y: positionPart(player.position?.y, 0, -12, 16),
        z: positionPart(player.position?.z, 0, -32, 32),
      },
      scale: numberInRange(player.scale, 0.5, 1.6, 1),
      nametag: player.nametag || "",
      bubble: player.bubble || "",
    } satisfies PlayerDraft;
  });
  const activeId = players.some((player) => player.id === payload.activeId) ? payload.activeId : players[0].id;
  const props = parseSceneProps(payload.props);
  return {
    camera: payload.camera,
    refetch,
    scene: {
      players,
      activeId,
      props,
      activePropId: activePropFrom(payload.activePropId, props),
      propClip: parsePropClip(payload.propClip),
      pack: scenePackById(payload.pack)?.id ?? null,
      background: payload.background || "studio",
      backgroundImage: backgroundImageFrom(payload.backgroundImage),
      backgroundFit: backgroundFitFrom(payload.backgroundFit),
      grade: payload.grade || "clean",
      outline: payload.outline || "none",
      godrays: Boolean(payload.godrays),
      light: payload.light || "soft",
      keyIntensity: typeof payload.keyIntensity === "number" ? payload.keyIntensity : 1,
      formatId: payload.formatId || "youtube",
    },
  };
}

export async function requestPlayer(name: string) {
  const response = await fetch(withBasePath(`/api/player?name=${encodeURIComponent(name)}`));
  const data = (await response.json()) as { error?: string; name: string; model: "default" | "slim"; skin: string; cape: string | null };
  if (!response.ok) throw new Error(data.error || code("err.noSkin"));
  return data;
}
