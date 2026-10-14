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
  rArmZ: -7,
  rElbow: 0,
  lArmX: 0,
  lArmZ: 7,
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
      headY: -14,
      rArmX: -28,
      rArmZ: -150,
      rElbow: -78,
    }),
  },
  {
    id: "flex",
    name: "秀肌肉",
    hint: "双臂上举，肘部内收",
    joints: pose({
      headX: -6,
      rArmZ: -148,
      rElbow: -78,
      lArmZ: 148,
      lElbow: -78,
      rArmX: -24,
      lArmX: -24,
    }),
  },
  {
    id: "think",
    name: "思考",
    hint: "手托下巴",
    joints: pose({
      headX: 16,
      headY: 18,
      bodyX: 8,
      rArmX: -96,
      rArmZ: -36,
      rElbow: -96,
      lArmZ: 8,
    }),
  },
  {
    id: "salute",
    name: "敬礼",
    hint: "右掌靠近额侧",
    joints: pose({
      headY: -8,
      rArmX: -132,
      rArmZ: -28,
      rElbow: -58,
    }),
  },
  {
    id: "sit",
    name: "坐下",
    hint: "大腿放平，小腿折回来",
    joints: pose({
      bodyX: -10,
      rArmX: -28,
      lArmX: -22,
      rArmZ: -12,
      lArmZ: 14,
      rLegX: -78,
      lLegX: -78,
      rKnee: 74,
      lKnee: 74,
    }),
  },
  {
    id: "hero",
    name: "英雄",
    hint: "肩打开，肘微屈",
    joints: pose({
      headX: -8,
      rArmX: -22,
      lArmX: -22,
      rArmZ: -36,
      lArmZ: 36,
      rElbow: -28,
      lElbow: -28,
    }),
  },
  {
    id: "walk",
    name: "迈步",
    hint: "手脚交叉，后膝微屈",
    joints: pose({
      bodyX: 4,
      rArmX: 28,
      lArmX: -32,
      rLegX: -34,
      lLegX: 26,
      lKnee: 22,
    }),
  },
];

export function poseById(id: string): PosePreset {
  return POSES.find((pose) => pose.id === id) ?? POSES[0];
}
