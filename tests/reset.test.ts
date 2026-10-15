import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { poseById, resetPlayer } from "../lib/poses.ts";
import { DEFAULT_SCENE_LOOK, resetSceneLook } from "../lib/stage-look.ts";
import type { PlayerDraft, SceneDraft } from "../lib/types.ts";

function player(): PlayerDraft {
  return {
    id: "p_test",
    name: "Notch",
    source: "username",
    username: "Notch",
    skinUrl: "data:image/png;base64,skin",
    capeUrl: "data:image/png;base64,cape",
    showCape: false,
    model: "slim",
    poseId: "sit",
    joints: { ...poseById("sit").joints },
    clip: "run",
    clipSpeed: 1.45,
    customAnimation: {
      v: 1,
      name: "Wave",
      duration: 1.6,
      loop: true,
      keyframes: [{ time: 0, joints: { rArmZ: -20 }, bob: 0, sway: 0, roll: 0, cape: 0 }],
    },
    showOuter: false,
    layerMode: "voxel",
    position: { x: 4, y: 2, z: -3 },
    scale: 1.4,
    nametag: "你好",
    bubble: "在吗",
  };
}

describe("reset to default", () => {
  it("returns the active player to the idle pose, breathing clip, origin, and empty labels", () => {
    const current = player();
    const next = resetPlayer(current);
    assert.equal(next.poseId, "idle");
    assert.deepEqual(next.joints, poseById("idle").joints);
    assert.equal(next.clip, "idle");
    assert.equal(next.clipSpeed, 1);
    assert.deepEqual(next.position, { x: 0, y: 0, z: 0 });
    assert.equal(next.scale, 1);
    assert.equal(next.nametag, "");
    assert.equal(next.bubble, "");
    assert.equal(next.skinUrl, current.skinUrl);
    assert.equal(next.capeUrl, current.capeUrl);
    assert.equal(next.model, "slim");
    assert.equal(next.showOuter, false);
    assert.equal(next.layerMode, "voxel");
    assert.equal(next.showCape, false);
    assert.equal(next.customAnimation, null);
    assert.notEqual(next.joints, poseById("idle").joints);
  });

  it("resets lights and background without touching players or the export size", () => {
    const scene: SceneDraft = {
      players: [player()],
      activeId: "p_test",
      background: "nether",
      backgroundImage: "data:image/png;base64,aaaa",
      backgroundFit: "contain",
      grade: "comic",
      outline: "ink",
      godrays: true,
      light: "neon",
      keyIntensity: 1.5,
      formatId: "avatar",
    };
    const next = resetSceneLook(scene);
    assert.equal(next.background, "studio");
    assert.equal(next.backgroundImage, null);
    assert.equal(next.backgroundFit, "cover");
    assert.equal(next.grade, "clean");
    assert.equal(next.outline, "none");
    assert.equal(next.godrays, false);
    assert.equal(next.light, "soft");
    assert.equal(next.keyIntensity, 1);
    assert.equal(next.formatId, "avatar");
    assert.equal(next.players[0].id, "p_test");
    assert.equal(next.players[0].poseId, "sit");
    assert.deepEqual(
      { background: next.background, backgroundImage: next.backgroundImage, backgroundFit: next.backgroundFit, grade: next.grade, outline: next.outline, godrays: next.godrays, light: next.light, keyIntensity: next.keyIntensity },
      DEFAULT_SCENE_LOOK,
    );
  });
});
