import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { poseById } from "../lib/poses.ts";
import { decodePayload, encodePayload, toPayload, type SharePayload } from "../lib/persist.ts";
import type { Joints, SceneDraft } from "../lib/types.ts";

const joints: Joints = poseById("sit").joints;

function scene(): SceneDraft {
  return {
    players: [
      {
        id: "p_test",
        name: "Steve",
        source: "upload",
        username: null,
        skinUrl: "data:image/png;base64,abc",
        capeUrl: "data:image/png;base64,cape",
        showCape: true,
        model: "default",
        poseId: "sit",
        joints,
        nametag: "",
        bubble: "",
      },
    ],
    activeId: "p_test",
    background: "night",
    grade: "clean",
    outline: "none",
    godrays: false,
    light: "soft",
    keyIntensity: 1,
    formatId: "youtube",
    showOuter: true,
    clip: "wave",
    clipSpeed: 1.45,
  };
}

describe("pose url serialization", () => {
  it("round-trips joints, clip and camera", () => {
    const draft = scene();
    const camera = { p: [1, 2, 3] as [number, number, number], t: [0, 1, 0] as [number, number, number] };
    const encoded = encodePayload(toPayload(draft, camera, true));
    const decoded = decodePayload(encoded);
    assert.ok(decoded);
    assert.equal(decoded.clip, "wave");
    assert.equal(decoded.clipSpeed, 1.45);
    assert.equal(decoded.background, "night");
    assert.deepEqual(decoded.camera, camera);
    assert.deepEqual(decoded.players[0].joints, joints);
    assert.equal(decoded.players[0].skinUrl, "data:image/png;base64,abc");
    assert.equal(decoded.players[0].poseId, "sit");
  });

  it("drops uploaded pixels from a share link but keeps the pose", () => {
    const payload = toPayload(scene(), undefined, false);
    assert.equal(payload.players[0].skinUrl, undefined);
    assert.equal(payload.players[0].capeUrl, undefined);
    assert.equal(payload.players[0].poseId, "sit");
    const decoded = decodePayload(encodePayload(payload));
    assert.ok(decoded);
    assert.equal(decoded.players[0].skinUrl, undefined);
    assert.deepEqual(decoded.players[0].joints, joints);
  });

  it("rejects a payload that is missing a joint", () => {
    const payload = toPayload(scene(), undefined, false);
    const broken = structuredClone(payload) as SharePayload;
    const { rKnee: _removed, ...joints } = broken.players[0].joints;
    void _removed;
    broken.players[0].joints = joints as SharePayload["players"][number]["joints"];
    assert.equal(decodePayload(encodePayload(broken)), null);
    assert.equal(decodePayload("not-base64"), null);
  });
});
