import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodePayload, encodePayload, toPayload } from "../lib/persist.ts";
import {
  classifyPropDisplayArchetype,
  getPropDisplayTransform,
  MAX_PROPS,
  parseSceneProps,
  placeProp,
  propSlot,
  type PropParseIssue,
} from "../lib/props.ts";
import { poseById } from "../lib/poses.ts";
import { applyStarterScene, STARTER_SCENES } from "../lib/starter-scenes.ts";
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

  it("uses one field table for share links and scene documents", () => {
    const entry = {
      id: "o_1",
      item: "sword",
      name: " Blade ",
      position: { x: 1, y: 2, z: 3 },
      rotationY: 40,
      scale: 2,
      pivot: { x: 0, y: 8, z: 0 },
      locked: true,
    };
    const issues: PropParseIssue[] = [];
    const strict = parseSceneProps([entry], { strict: true, onIssue: (issue) => issues.push(issue) });
    const lenient = parseSceneProps([entry]);
    assert.deepEqual(issues, []);
    assert.equal(lenient.length, 1);
    assert.deepEqual(strict, lenient);
    assert.equal(strict[0].catalogId, "item:diamond_sword");
    assert.equal(strict[0].name, "Blade");
    assert.equal(strict[0].rotation.y, 40);
    assert.equal(strict[0].pivot.y, 8);
    assert.equal(strict[0].locked, true);
    assert.equal(strict[0].scale.x, 2);
    const missingId = parseSceneProps([{ item: "stone", locked: true }], { strict: true });
    assert.equal(missingId[0]?.id, "o_1");
    assert.equal(parseSceneProps([{ item: "stone", locked: true }]).length, 0);
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

  it("parses and round-trips prop attachments to player bones", () => {
    const placed = placeProp("item:diamond_sword", []);
    assert.ok(placed);
    if (!placed) return;
    placed.attach = { playerId: "p_test", slot: "rHand" };
    const draft = scene();
    draft.props = [placed];
    const payload = toPayload(draft, undefined, false);
    assert.deepEqual(payload.props?.[0].attach, { playerId: "p_test", slot: "rHand" });
    const decoded = decodePayload(encodePayload(payload));
    assert.ok(decoded);
    const next = sceneFromPayload(decoded, "steve", "alex");
    assert.equal(next.scene.props[0].attach?.slot, "rHand");
    assert.equal(next.scene.props[0].attach?.playerId, "p_test");
  });

  it("computes Minecraft-aligned display transforms per item archetype and slot", () => {
    assert.equal(classifyPropDisplayArchetype("item:diamond_sword"), "handheld");
    assert.equal(classifyPropDisplayArchetype("item:diamond_pickaxe"), "handheld");
    assert.equal(classifyPropDisplayArchetype("block:torch"), "torch");
    assert.equal(classifyPropDisplayArchetype("block:grass_block"), "block");
    assert.equal(classifyPropDisplayArchetype("item:apple"), "generated");
    assert.equal(classifyPropDisplayArchetype("entity:creeper"), "entity");

    const rSword = getPropDisplayTransform("item:diamond_sword", "rHand");
    const lSword = getPropDisplayTransform("item:diamond_sword", "lHand");
    assert.deepEqual(rSword.modelOrigin, { x: -4.5, y: 3.5, z: 0 });
    assert.equal(rSword.scale, 0.85);
    assert.equal(rSword.rotation.y, -90);
    assert.equal(lSword.rotation.y, -90);
    assert.equal(rSword.position.y, -4.8);

    const rBlock = getPropDisplayTransform("block:grass_block", "rHand");
    const lBlock = getPropDisplayTransform("block:grass_block", "lHand");
    const headBlock = getPropDisplayTransform("block:grass_block", "head");
    assert.equal(rBlock.scale, 0.375);
    assert.equal(rBlock.rotation.y, 45);
    assert.equal(lBlock.rotation.y, 45);
    assert.equal(headBlock.scale, 0.625);

    const rTorch = getPropDisplayTransform("block:torch", "rHand");
    assert.equal(rTorch.rotation.x, 110);
    assert.equal(rTorch.scale, 0.85);
  });

  it("applies starter scenes (single-player, multi-player, and custom animation) while preserving character identity", () => {
    assert.equal(STARTER_SCENES.length, 6);
    const draft = scene();
    draft.players[0].name = "CustomHero";
    draft.players[0].model = "slim";
    draft.players[0].skinUrl = "https://custom.skin/hero.png";
    const wilderness = STARTER_SCENES.find((s) => s.id === "wilderness-hero");
    assert.ok(wilderness);
    const result = applyStarterScene(draft, wilderness);
    assert.equal(result.scene.players[0].name, "CustomHero");
    assert.equal(result.scene.players[0].model, "slim");
    assert.equal(result.scene.players[0].skinUrl, "https://custom.skin/hero.png");
    assert.equal(result.scene.players[0].poseId, "guard");
    assert.equal(result.scene.props.length, 5);
    assert.equal(result.scene.props[0].attach?.playerId, "p_test");
    assert.equal(result.scene.props[0].attach?.slot, "rHand");
    assert.equal(result.scene.background, "noon");
    assert.equal(result.poster.title, "WILDERNESS HERO");

    // Multi-player starter template
    const showdown = STARTER_SCENES.find((s) => s.id === "duo-showdown");
    assert.ok(showdown);
    const duoResult = applyStarterScene(draft, showdown, { skinUrl: "alex_skin", model: "slim", name: "Alex" });
    assert.equal(duoResult.scene.players.length, 2);
    assert.equal(duoResult.scene.players[0].name, "CustomHero");
    assert.equal(duoResult.scene.players[1].name, "Alex");
    const secondId = duoResult.scene.players[1].id;
    assert.ok(duoResult.scene.props.some((p) => p.attach?.playerId === secondId && p.attach?.slot === "rHand"));

    // Custom keyframe animation starter template
    const combo = STARTER_SCENES.find((s) => s.id === "sword-combo");
    assert.ok(combo);
    const comboResult = applyStarterScene(draft, combo);
    assert.equal(comboResult.scene.players[0].clip, "custom");
    assert.ok(comboResult.scene.players[0].customAnimation);
    assert.equal(comboResult.scene.players[0].customAnimation?.keyframes.length, 4);
  });
});
