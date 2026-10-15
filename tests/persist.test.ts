import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clipExportSpanForPlayers } from "../lib/motion.ts";
import { poseById } from "../lib/poses.ts";
import {
  backgroundImageFrom,
  decodePayload,
  encodePayload,
  layerModeFrom,
  playerSettingsFromPayload,
  toPayload,
  type SharePayload,
} from "../lib/persist.ts";
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
        clip: "wave",
        clipSpeed: 1.45,
        customAnimation: null,
        showOuter: true,
        layerMode: "flat",
        position: { x: 4, y: 1, z: -3 },
        scale: 1.2,
        nametag: "",
        bubble: "",
      },
    ],
    activeId: "p_test",
    background: "night",
    backgroundImage: null,
    backgroundFit: "cover",
    grade: "clean",
    outline: "none",
    godrays: false,
    light: "soft",
    keyIntensity: 1,
    formatId: "youtube",
  };
}

describe("pose url serialization", () => {
  it("round-trips joints, per-player animation, transform and camera", () => {
    const draft = scene();
    const camera = { p: [1, 2, 3] as [number, number, number], t: [0, 1, 0] as [number, number, number] };
    const encoded = encodePayload(toPayload(draft, camera, true));
    const decoded = decodePayload(encoded);
    assert.ok(decoded);
    assert.equal(decoded.background, "night");
    assert.deepEqual(decoded.camera, camera);
    assert.deepEqual(decoded.players[0].joints, joints);
    assert.equal(decoded.players[0].clip, "wave");
    assert.equal(decoded.players[0].clipSpeed, 1.45);
    assert.equal(decoded.players[0].showOuter, true);
    assert.equal(decoded.players[0].layerMode, "flat");
    assert.deepEqual(decoded.players[0].position, { x: 4, y: 1, z: -3 });
    assert.equal(decoded.players[0].scale, 1.2);
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

  it("keeps voxel layers in the link and treats an old link as flat", () => {
    const draft = scene();
    draft.players[0].layerMode = "voxel";
    const decoded = decodePayload(encodePayload(toPayload(draft, undefined, false)));
    assert.ok(decoded);
    assert.equal(decoded.players[0].layerMode, "voxel");
    assert.equal(layerModeFrom(undefined), "flat");
    assert.equal(layerModeFrom("blocks"), "flat");
    assert.equal(layerModeFrom("voxel"), "voxel");
  });

  it("falls back to scene-wide animation and layer values from old links", () => {
    const legacy = structuredClone(toPayload(scene(), undefined, false));
    legacy.clip = "run";
    legacy.clipSpeed = 1.8;
    legacy.showOuter = false;
    legacy.layerMode = "voxel";
    delete legacy.players[0].clip;
    delete legacy.players[0].clipSpeed;
    delete legacy.players[0].showOuter;
    delete legacy.players[0].layerMode;
    delete legacy.players[0].position;
    delete legacy.players[0].scale;

    const restored = playerSettingsFromPayload(legacy.players[0], legacy);
    assert.equal(restored.clip, "run");
    assert.equal(restored.clipSpeed, 1.8);
    assert.equal(restored.showOuter, false);
    assert.equal(restored.layerMode, "voxel");
  });

  it("keeps a background image in local saves and drops it from share links", () => {
    const draft = scene();
    const image = "data:image/png;base64,aaaa";
    draft.backgroundImage = image;
    draft.backgroundFit = "contain";

    const share = toPayload(draft, undefined, false);
    assert.equal(share.backgroundImage, undefined);
    assert.equal(share.backgroundFit, undefined);
    assert.equal(backgroundImageFrom("https://example.com/bg.png"), null);
    assert.equal(backgroundImageFrom("data:image/gif;base64,aaaa"), null);

    const local = toPayload(draft, undefined, true);
    assert.equal(local.backgroundImage, image);
    assert.equal(local.backgroundFit, "contain");
    const decoded = decodePayload(encodePayload(local));
    assert.ok(decoded);
    assert.equal(decoded.backgroundImage, image);
    assert.equal(decoded.backgroundFit, "contain");
    assert.equal(backgroundImageFrom(decoded.backgroundImage), image);
    assert.equal(backgroundImageFrom("https://example.com/bg.jpg"), null);
  });

  it("uses the slowest player when calculating a shared GIF span", () => {
    const span = clipExportSpanForPlayers([
      { clip: "walk", clipSpeed: 1 },
      { clip: "run", clipSpeed: 0.5 },
    ]);
    assert.ok(span.seconds > 1);
    assert.ok(span.frames >= 12 && span.frames <= 28);
  });
});
