import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodePayload, encodePayload, toPayload } from "../lib/persist.ts";
import { MAX_PROPS, parseSceneProps, placeProp, propSlot } from "../lib/props.ts";
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
    assert.equal(placed.catalogId, "entity:creeper");
    const draft = scene();
    draft.props = [
      placed,
      { ...placed, id: "o_extra", catalogId: "not-a-block" },
    ];
    draft.activePropId = placed.id;
    const decoded = decodePayload(encodePayload(toPayload(draft, undefined, false)));
    assert.ok(decoded);
    assert.equal(decoded.v, 1);
    assert.equal(decoded.props?.length, 2);
    const next = sceneFromPayload(decoded, "steve", "alex");
    assert.equal(next.scene.props.length, 1);
    assert.equal(next.scene.props[0].catalogId, "entity:creeper");
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

  it("folds every old id onto its catalog id", () => {
    const legacy: Array<[string, string]> = [
      ["grass", "block:grass_block"],
      ["dirt", "block:dirt"],
      ["stone", "block:stone"],
      ["log", "block:oak_log"],
      ["planks", "block:oak_planks"],
      ["sand", "block:sand"],
      ["tnt", "block:tnt"],
      ["crafting", "block:crafting_table"],
      ["glass", "block:glass"],
      ["sword", "item:diamond_sword"],
      ["pickaxe", "item:diamond_pickaxe"],
      ["apple", "item:apple"],
      ["torch", "block:torch"],
      ["creeper", "entity:creeper"],
      ["pig", "entity:pig"],
      ["chicken", "entity:chicken"],
      ["slime", "entity:slime"],
    ];
    for (const [oldId, catalogId] of legacy) {
      const prop = placeProp(oldId, []);
      assert.equal(prop?.catalogId, catalogId);
    }
    const parsed = parseSceneProps([
      { id: "o_1", catalogId: "grass", position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 },
      { id: "o_2", catalogId: "entity:pig", position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 },
    ]);
    assert.deepEqual(
      parsed.map((prop) => prop.catalogId),
      ["block:grass_block", "entity:pig"],
    );
  });

  it("keeps the first sixteen placement slots where they used to be", () => {
    assert.deepEqual(propSlot(0), [18, 0, 4]);
    assert.deepEqual(propSlot(1), [-20, 0, 4]);
    assert.deepEqual(propSlot(15), [-8, 0, 24]);
    const slots = new Set<string>();
    for (let index = 0; index < MAX_PROPS; index += 1) {
      const [x, , z] = propSlot(index);
      assert.ok(Math.hypot(x, z) >= 8, `slot ${index} crowds the players`);
      slots.add(`${x},${z}`);
    }
    assert.equal(slots.size, MAX_PROPS);
  });

  it("caps the stage at 64 props and keeps legacy rotation and scale", () => {
    const noisy = Array.from({ length: 70 }, (_, index) => ({
      id: `o_${index}`,
      catalogId: "grass",
      position: { x: 99, y: 0, z: 0 },
      rotationY: 90,
      scale: 9,
    }));
    const parsed = parseSceneProps(noisy);
    assert.equal(parsed.length, MAX_PROPS);
    assert.equal(MAX_PROPS, 64);
    assert.equal(parsed[0].catalogId, "block:grass_block");
    assert.equal(parsed[0].position.x, 64);
    assert.equal(parsed[0].scale.x, 8);
    assert.equal(parsed[0].rotation.y, 90);
    assert.equal(parsed[0].pivot.x, 0);
    assert.equal(placeProp("stone", parsed), null);
  });

  it("round-trips a full transform and still accepts a namespaced id", () => {
    const placed = placeProp("block:stone", []);
    assert.ok(placed);
    if (!placed) return;
    placed.rotation = { x: 10, y: 20, z: -5 };
    placed.scale = { x: 1, y: 2, z: 0.5 };
    placed.pivot = { x: 0, y: 8, z: 0 };
    placed.name = "Stone";
    const draft = scene();
    draft.props = [placed];
    const payload = toPayload(draft, undefined, false);
    assert.equal(payload.props?.[0].rotationY, 20);
    const decoded = decodePayload(encodePayload(payload));
    assert.ok(decoded);
    const next = sceneFromPayload(decoded, "steve", "alex");
    assert.equal(next.scene.props[0].catalogId, "block:stone");
    assert.equal(next.scene.props[0].rotation.x, 10);
    assert.equal(next.scene.props[0].scale.z, 0.5);
    assert.equal(next.scene.props[0].pivot.y, 8);
    assert.equal(next.scene.props[0].name, "Stone");
  });
});
