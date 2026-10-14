import type { Joints } from "./types";

export type PosePreset = {
  id: string;
  name: string;
  hint: string;
  joints: Joints;
};

const z: Joints = {
  headX: 0,
  headY: 0,
  bodyX: 0,
  rArmX: 0,
  rArmZ: -6,
  rElbow: 0,
  lArmX: 0,
  lArmZ: 6,
  lElbow: 0,
  rLegX: 0,
  rKnee: 0,
  lLegX: 0,
  lKnee: 0,
};

function pose(partial: Partial<Joints>): Joints {
  return { ...z, ...partial };
}

export const POSES: PosePreset[] = [
  {
    id: "idle",
    name: "站立",
    hint: "肩稍打开",
    joints: pose({}),
  },
  {
    id: "wave",
    name: "挥手",
    hint: "右臂抬起，小臂弯一下",
    joints: pose({
      headY: -18,
      headX: -4,
      rArmX: -20,
      rArmZ: -112,
      rElbow: -58,
    }),
  },
  {
    id: "flex",
    name: "秀肌肉",
    hint: "双臂上举，肘部内收",
    joints: pose({
      headX: -8,
      rArmX: -28,
      lArmX: -28,
      rArmZ: -108,
      lArmZ: 108,
      rElbow: -100,
      lElbow: -100,
    }),
  },
  {
    id: "think",
    name: "思考",
    hint: "手托下巴",
    joints: pose({
      headX: 16,
      headY: -12,
      bodyX: 6,
      rArmX: -70,
      rArmZ: 36,
      rElbow: -115,
    }),
  },
  {
    id: "salute",
    name: "敬礼",
    hint: "右掌靠近额侧",
    joints: pose({
      headY: -6,
      headX: -2,
      rArmX: -120,
      rArmZ: 8,
      rElbow: -70,
    }),
  },
  {
    id: "sit",
    name: "坐下",
    hint: "大腿放平，小腿折回来",
    joints: pose({
      bodyX: 8,
      headX: 10,
      rArmX: -48,
      lArmX: -48,
      rArmZ: -10,
      lArmZ: 10,
      rElbow: -36,
      lElbow: -36,
      rLegX: -90,
      lLegX: -90,
      rKnee: 90,
      lKnee: 90,
    }),
  },
  {
    id: "hero",
    name: "英雄",
    hint: "肩打开，肘微屈",
    joints: pose({
      headX: -6,
      rArmX: 16,
      lArmX: 16,
      rArmZ: -28,
      lArmZ: 28,
      rElbow: -42,
      lElbow: -42,
    }),
  },
  {
    id: "walk",
    name: "迈步",
    hint: "手脚交叉，后膝微屈",
    joints: pose({
      bodyX: 8,
      rArmX: 24,
      lArmX: -28,
      rElbow: -12,
      lElbow: -20,
      rLegX: -34,
      lLegX: 22,
      rKnee: 6,
      lKnee: 30,
    }),
  },
];

export function poseById(id: string): PosePreset {
  return POSES.find((pose) => pose.id === id) ?? POSES[0];
}
