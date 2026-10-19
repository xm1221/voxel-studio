import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodePayload, encodePayload, toPayload } from "../lib/persist.ts";
import { MAX_PROPS, parseSceneProps, placeProp, PROP_SPECS } from "../lib/props.ts";
import { poseById } from "../lib/poses.ts";
import { sceneFromPayload } from "../lib/studio-state.ts";
import type { SceneDraft } from "../lib/types.ts";

function scene(): SceneDraft {
  return {
    players: [
      {
        id: "p_test",
        name: "Steve",
        source: "builtin",
        username: null,
        skinUrl: "skin",
        capeUrl: null,
        showCape: true,
        model: "default",
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
      },
    ],
    activeId: "p_test",
    props: [],
    activePropId: null,
    background: "studio",
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

describe("scene props", () => {
  it("drops junk and keeps a valid prop inside a v1 share link", () => {
    const placed = placeProp("creeper", []);
    assert.ok(placed);
    if (!placed) return;
    const draft = scene();
    draft.props = [
      placed,
      { ...placed, id: "o_extra", catalogId: "not-a-block", position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 },
    ];
    draft.activePropId = placed.id;
    const decoded = decodePayload(encodePayload(toPayload(draft, undefined, false)));
    assert.ok(decoded);
    assert.equal(decoded.v, 1);
    assert.equal(decoded.props?.length, 2);
    const next = sceneFromPayload(decoded, "steve", "alex");
    assert.equal(next.scene.props.length, 1);
    assert.equal(next.scene.props[0].catalogId, "creeper");
    assert.equal(next.scene.activePropId, placed.id);
    assert.equal(next.scene.players[0].id, "p_test");
  });

  it("treats a link from before props as an empty stage", () => {
    const payload = toPayload(scene(), undefined, false);
    assert.equal(payload.props, undefined);
    const decoded = decodePayload(encodePayload(payload));
    assert.ok(decoded);
    const next = sceneFromPayload(decoded, "steve", "alex");
    assert.deepEqual(next.scene.props, []);
    assert.equal(next.scene.activePropId, null);
  });

  it("caps the catalog and refuses a 17th prop", () => {
    assert.equal(new Set(PROP_SPECS.map((spec) => spec.id)).size, PROP_SPECS.length);
    const noisy = Array.from({ length: 20 }, (_, index) => ({
      id: `o_${index}`,
      catalogId: "grass",
      position: { x: 99, y: 0, z: 0 },
      rotationY: 0,
      scale: 9,
    }));
    const parsed = parseSceneProps(noisy);
    assert.equal(parsed.length, MAX_PROPS);
    assert.equal(parsed[0].position.x, 32);
    assert.equal(parsed[0].scale, 2.2);
    const full = parsed;
    assert.equal(placeProp("stone", full), null);
  });
});
