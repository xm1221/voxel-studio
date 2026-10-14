import type { Joints, PlayerDraft } from "./types";

/** 动作相位对齐 skinview3d 的行走 / 跑步，并在肘、膝上加随摆动弯曲。 */
export type ClipId = "none" | "idle" | "walk" | "run" | "wave" | "cheer";

export type ClipSample = {
  joints: Joints;
  bob: number;
  sway: number;
  roll: number;
  cape: number;
};

export const CLIPS: Array<{ id: ClipId; name: string; hint: string }> = [
  { id: "none", name: "静止", hint: "停在滑块上的姿势。导出时人物转一圈。" },
  { id: "idle", name: "呼吸", hint: "在当前姿势上，肩、肘和披风轻轻起伏。" },
  { id: "walk", name: "行走", hint: "手脚交叉，后腿屈膝，后臂屈肘。" },
  { id: "run", name: "跑步", hint: "步幅更大，身体一起一伏。" },
  { id: "wave", name: "挥手", hint: "右臂抬起，小臂来回摆。" },
  { id: "cheer", name: "欢呼", hint: "双臂举起，肘和膝跟着节拍弯。" },
];

const CLIP_IDS = new Set<string>(CLIPS.map((clip) => clip.id));

export function clipById(id: string | undefined): ClipId {
  return id && CLIP_IDS.has(id) ? (id as ClipId) : "none";
}

/** 速度为 1 时，一个无缝循环的秒数。 */
export function clipCycle(clip: ClipId): number {
  if (clip === "walk") return (Math.PI * 2) / 8;
  if (clip === "run") return (Math.PI * 2) / 15;
  if (clip === "wave") return 2;
  if (clip === "cheer") return 1.2;
  if (clip === "idle") return Math.PI;
  return 2.4;
}

/** 导出用的循环。行走和跑步收两步，转一圈和呼吸收一整段。 */
export function clipExportSpan(clip: ClipId): { frames: number; seconds: number } {
  const cycle = clipCycle(clip);
  const seconds = clip === "walk" || clip === "run" ? cycle * 2 : cycle;
  const frames = clip === "none" ? 24 : Math.min(28, Math.max(12, Math.round(seconds * 12)));
  return { frames, seconds };
}

export function clipExportSpanForPlayers(players: Array<Pick<PlayerDraft, "clip" | "clipSpeed">>): { frames: number; seconds: number } {
  if (!players.length) return clipExportSpan("none");
  const seconds = Math.max(
    ...players.map((player) => {
      const span = clipExportSpan(player.clip);
      const speed = Number.isFinite(player.clipSpeed) && player.clipSpeed > 0 ? player.clipSpeed : 1;
      return span.seconds / speed;
    }),
  );
  const allStill = players.every((player) => player.clip === "none");
  const frames = allStill ? 24 : Math.min(28, Math.max(12, Math.round(seconds * 12)));
  return { frames, seconds };
}

export function phaseOffset(index: number, clip: ClipId): number {
  return index * clipCycle(clip) * 0.17;
}

function trailBend(backward: number, fullSwing: number, amount: number) {
  const t = Math.min(1, Math.max(0, backward) / fullSwing);
  const eased = t * t * (3 - 2 * t);
  return eased * amount;
}

export function sampleClip(clip: ClipId, time: number, rest: Joints): ClipSample {
  const joints: Joints = { ...rest };
  let bob = 0;
  let sway = 0;
  let roll = 0;
  let cape = 0;

  if (clip === "idle") {
    const w = time * 2;
    joints.rArmZ = rest.rArmZ + Math.cos(w + Math.PI) * 2.4;
    joints.lArmZ = rest.lArmZ + Math.cos(w) * 2.4;
    joints.rElbow = rest.rElbow + Math.sin(w) * 7;
    joints.lElbow = rest.lElbow + Math.sin(w + 0.6) * 7;
    joints.headX = rest.headX + Math.sin(w) * 2.2;
    joints.rKnee = rest.rKnee + Math.max(0, Math.sin(w)) * 3;
    joints.lKnee = rest.lKnee + Math.max(0, Math.sin(w + Math.PI)) * 3;
    cape = Math.sin(w) * 2.4;
  } else if (clip === "walk") {
    const t = time * 8;
    const s = Math.sin(t);
    joints.lLegX = s * 28.6;
    joints.rLegX = -s * 28.6;
    joints.lArmX = -s * 28.6;
    joints.rArmX = s * 28.6;
    joints.lArmZ = rest.lArmZ + Math.cos(t) * 2.2;
    joints.rArmZ = rest.rArmZ - Math.cos(t) * 2.2;
    joints.lKnee = trailBend(joints.lLegX, 28.6, 34);
    joints.rKnee = trailBend(joints.rLegX, 28.6, 34);
    joints.lElbow = rest.lElbow - trailBend(joints.lArmX, 28.6, 28);
    joints.rElbow = rest.rElbow - trailBend(joints.rArmX, 28.6, 28);
    joints.headY = rest.headY + Math.sin(t) * 6;
    joints.headX = rest.headX + Math.sin(t * 2) * 3;
    joints.bodyX = rest.bodyX + Math.sin(t * 2) * 2.5;
    bob = Math.abs(Math.sin(t)) * 0.55;
    cape = Math.sin(t / 2) * 4;
  } else if (clip === "run") {
    const t = time * 15 + Math.PI * 0.5;
    const c = Math.cos(t);
    joints.lLegX = -c * 72;
    joints.rLegX = c * 72;
    joints.lArmX = c * 84;
    joints.rArmX = -c * 84;
    joints.lArmZ = 8 + Math.cos(t) * 5;
    joints.rArmZ = -8 - Math.cos(t) * 5;
    joints.lKnee = trailBend(joints.lLegX, 72, 52);
    joints.rKnee = trailBend(joints.rLegX, 72, 52);
    joints.lElbow = -trailBend(joints.lArmX, 84, 40);
    joints.rElbow = -trailBend(joints.rArmX, 84, 40);
    joints.bodyX = 10;
    joints.headX = -6;
    bob = Math.cos(t * 2) * 1.15;
    sway = Math.cos(t) * 0.18;
    roll = Math.cos(t + Math.PI) * 0.8;
    cape = 10 + Math.sin(t * 2) * 6;
  } else if (clip === "wave") {
    const t = time * Math.PI;
    joints.rArmX = -18;
    joints.rArmZ = -146 + Math.sin(t) * 8;
    joints.rElbow = -58 + Math.sin(t) * 24;
    joints.headY = -12 + Math.sin(t) * 4;
    joints.headX = rest.headX * 0.25 - 4;
    cape = Math.sin(t) * 2;
  } else if (clip === "cheer") {
    const t = (time * Math.PI * 2) / 1.2;
    joints.rArmX = -28 + Math.sin(t) * 12;
    joints.lArmX = -28 + Math.sin(t + 0.7) * 12;
    joints.rArmZ = -152;
    joints.lArmZ = 152;
    joints.rElbow = -48 + Math.sin(t) * 18;
    joints.lElbow = -48 + Math.sin(t + 0.7) * 18;
    joints.headX = -8 + Math.sin(t) * 3;
    joints.rKnee = rest.rKnee + Math.max(0, Math.sin(t)) * 10;
    joints.lKnee = rest.lKnee + Math.max(0, Math.sin(t + Math.PI)) * 10;
    bob = Math.abs(Math.sin(t)) * 1.05;
    cape = 4 + Math.sin(t * 2) * 3;
  }

  return { joints, bob, sway, roll, cape };
}
