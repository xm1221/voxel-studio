import { clipById } from "./motion";
import { withBasePath } from "./paths";
import { poseById } from "./poses";
import type { SharePayload } from "./persist";
import type { CameraSnapshot, PlayerDraft, SceneDraft } from "./types";

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
    background: "studio",
    grade: "clean",
    outline: "none",
    godrays: false,
    light: "soft",
    keyIntensity: 1,
    formatId: "youtube",
    showOuter: true,
    clip: "idle",
    clipSpeed: 1,
  };
}

export function sceneFromPayload(payload: SharePayload, steve: string, alex: string): { scene: SceneDraft; camera?: CameraSnapshot; refetch: string[] } {
  const refetch: string[] = [];
  const players = payload.players.slice(0, 4).map((player) => {
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
      id: player.id || newId(),
      name: player.name || "Steve",
      source: player.source || "builtin",
      username: player.username ?? null,
      skinUrl,
      capeUrl: player.capeUrl ?? null,
      showCape: player.showCape !== false,
      model: player.model === "slim" ? "slim" : "default",
      poseId: player.poseId || "idle",
      joints: player.joints,
      nametag: player.nametag || "",
      bubble: player.bubble || "",
    } satisfies PlayerDraft;
  });
  const activeId = players.some((player) => player.id === payload.activeId) ? payload.activeId : players[0].id;
  return {
    camera: payload.camera,
    refetch,
    scene: {
      players,
      activeId,
      background: payload.background || "studio",
      grade: payload.grade || "clean",
      outline: payload.outline || "none",
      godrays: Boolean(payload.godrays),
      light: payload.light || "soft",
      keyIntensity: typeof payload.keyIntensity === "number" ? payload.keyIntensity : 1,
      formatId: payload.formatId || "youtube",
      showOuter: payload.showOuter !== false,
      clip: clipById(payload.clip),
      clipSpeed: typeof payload.clipSpeed === "number" && payload.clipSpeed > 0 ? payload.clipSpeed : 1,
    },
  };
}

export async function requestPlayer(name: string) {
  const response = await fetch(withBasePath(`/api/player?name=${encodeURIComponent(name)}`));
  const data = (await response.json()) as { error?: string; name: string; model: "default" | "slim"; skin: string; cape: string | null };
  if (!response.ok) throw new Error(data.error || "没有取到皮肤。");
  return data;
}
