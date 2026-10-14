import type { CameraSnapshot, ClipId, Joints, PlayerDraft, SceneDraft } from "./types";

export type SharePayload = {
  v: 1;
  activeId: string;
  background: SceneDraft["background"];
  grade: SceneDraft["grade"];
  outline: SceneDraft["outline"];
  godrays: boolean;
  light: SceneDraft["light"];
  keyIntensity: number;
  formatId: string;
  showOuter: boolean;
  clip?: ClipId;
  clipSpeed?: number;
  camera?: CameraSnapshot;
  players: Array<Omit<PlayerDraft, "skinUrl" | "capeUrl"> & { skinUrl?: string; capeUrl?: string | null }>;
};

const JOINT_KEYS: (keyof Joints)[] = [
  "headX",
  "headY",
  "bodyX",
  "rArmX",
  "rArmZ",
  "rElbow",
  "lArmX",
  "lArmZ",
  "lElbow",
  "rLegX",
  "rKnee",
  "lLegX",
  "lKnee",
];

export function toPayload(scene: SceneDraft, camera: CameraSnapshot | undefined, keepUploads: boolean): SharePayload {
  return {
    v: 1,
    activeId: scene.activeId,
    background: scene.background,
    grade: scene.grade,
    outline: scene.outline,
    godrays: scene.godrays,
    light: scene.light,
    keyIntensity: scene.keyIntensity,
    formatId: scene.formatId,
    showOuter: scene.showOuter,
    clip: scene.clip,
    clipSpeed: scene.clipSpeed,
    camera,
    players: scene.players.map((player) => ({
      id: player.id,
      name: player.name,
      source: player.source,
      username: player.username,
      model: player.model,
      poseId: player.poseId,
      joints: player.joints,
      nametag: player.nametag,
      bubble: player.bubble,
      showCape: player.showCape,
      skinUrl: keepUploads && player.source === "upload" ? player.skinUrl : undefined,
      capeUrl: keepUploads ? player.capeUrl : undefined,
    })),
  };
}

export function encodePayload(payload: SharePayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodePayload(value: string): SharePayload | null {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    if (parsed.v !== 1 || !Array.isArray(parsed.players) || parsed.players.length === 0) return null;
    for (const player of parsed.players) {
      if (!player.joints) return null;
      for (const key of JOINT_KEYS) {
        if (typeof player.joints[key] !== "number" || Number.isNaN(player.joints[key])) return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}
