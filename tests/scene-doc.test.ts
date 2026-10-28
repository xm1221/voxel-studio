import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { motionExportPlan, DEFAULT_MOTION_EXPORT, parseMotionExport } from "../lib/motion-export.ts";
import { posterHasText, posterSubjectShift, POSTER_TEMPLATES, parsePosterText } from "../lib/poster.ts";
import { SCENE_PACKS, applyScenePack, scenePackById } from "../lib/scene-packs.ts";
import { loadAnyScene, parseSceneDocument, parseSceneText, toSceneDocument } from "../lib/scene-doc.ts";
import type { SceneDraft } from "../lib/types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skins = { steve: "data:image/png;base64,STEVE", alex: "data:image/png;base64,ALEX" };

function exampleFiles() {
  return readdirSync(join(ROOT, "examples", "scenes"))
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function mustParse(value: unknown): SceneDraft {
  const parsed = parseSceneDocument(value, skins);
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.errors));
  if (!parsed.ok) throw new Error("unreachable");
  return parsed.value.scene;
}

describe("scene documents", () => {
  it("parses every shipped example", () => {
    const files = exampleFiles();
    assert.ok(files.length >= 4);
    for (const name of files) {
      const raw = JSON.parse(readFileSync(join(ROOT, "examples", "scenes", name), "utf8")) as unknown;
      const parsed = parseSceneDocument(raw, skins);
      assert.equal(parsed.ok, true, `${name}: ${parsed.ok ? "" : JSON.stringify(parsed.errors)}`);
      if (!parsed.ok) continue;
      assert.ok(parsed.value.scene.players.length >= 1);
      assert.ok(parsed.value.warnings.every((warning) => typeof warning === "string"));
    }
  });

  it("validates every example against the published JSON Schema", () => {
    const schema = JSON.parse(readFileSync(join(ROOT, "schema", "pixelstage.scene.schema.json"), "utf8")) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    for (const name of exampleFiles()) {
      const raw = JSON.parse(readFileSync(join(ROOT, "examples", "scenes", name), "utf8")) as unknown;
      assert.equal(validate(raw), true, `${name}: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
    }
    // The schema and the parser agree on what is out of bounds.
    const bad = [
      { v: 2, cast: [] },
      { v: 2, cast: [{ motion: "moonwalk" }] },
      { v: 2, cast: [{}], stage: { pack: "nope" } },
      { v: 2, cast: [{}], extra: true },
      { v: 2, cast: [{ pose: { headX: 999 } }] },
    ];
    for (const value of bad) assert.equal(validate(value), false, `schema accepted ${JSON.stringify(value)}`);
    const ease = {
      v: 2,
      cast: [{ motion: { animation: { v: 1, name: "X", duration: 1, loop: true, keyframes: [{ time: 0, joints: {}, ease: "linear", yaw: 45 }] } } }],
    };
    assert.equal(validate(ease), true, JSON.stringify(validate.errors?.slice(0, 3)));
    const badEase = structuredClone(ease) as { cast: Array<{ motion: { animation: { keyframes: Array<{ ease?: string }> } } }> };
    badEase.cast[0].motion.animation.keyframes[0].ease = "wobble";
    assert.equal(validate(badEase), false);
  });

  it("matches the JSON schema's required surface", () => {
    const schema = JSON.parse(readFileSync(join(ROOT, "schema", "pixelstage.scene.schema.json"), "utf8")) as {
      properties: Record<string, unknown>;
      $defs: Record<string, { enum?: string[] }>;
    };
    assert.deepEqual(schema.properties.v, { const: 2, description: schema.properties.v.description });
    const clips = schema.$defs.preset.enum ?? [];
    for (const id of ["crouch", "attack", "fly", "swim", "nod", "spin", "jump", "sit"]) {
      assert.ok(clips.includes(id), `schema is missing preset ${id}`);
    }
    const packs = schema.$defs.stage.properties.pack.enum ?? [];
    assert.deepEqual(packs, SCENE_PACKS.map((pack) => pack.id));
    const templates = schema.$defs.text.properties.template.enum ?? [];
    assert.deepEqual(templates, POSTER_TEMPLATES.map((template) => template.id));
  });

  it("loads a cast with pose, motion, props, stage, text, and export", () => {
    const parsed = parseSceneDocument(
      {
        v: 2,
        cast: [
          { id: "a", name: "Steve", skin: "steve", pose: "sit", motion: "sit", position: { x: 3 } },
          { name: "Alex", skin: "alex", pose: { headX: 10 }, motion: { preset: "wave", speed: 1.5 } },
        ],
        props: [{ item: "sword", position: { x: 4, y: 1, z: -2 }, scale: 2 }],
        stage: { pack: "promo-poster", light: "hard" },
        text: { title: "Hi", template: "lower-third" },
        export: { format: "story", motion: { fps: 18, gifEdge: 720 } },
      },
      skins,
    );
    assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.errors));
    if (!parsed.ok) return;
    const { scene, poster, motion } = parsed.value;
    assert.equal(scene.players.length, 2);
    assert.equal(scene.players[0].clip, "sit");
    assert.equal(scene.players[0].position.x, 3);
    assert.equal(scene.players[1].clip, "wave");
    assert.equal(scene.players[1].clipSpeed, 1.5);
    assert.equal(scene.players[1].joints.headX, 10);
    assert.equal(scene.props.length, 1);
    assert.equal(scene.props[0].catalogId, "item:diamond_sword");
    assert.equal(scene.props[0].scale.x, 2);
    // The pack sets the look, explicit stage fields win.
    assert.equal(scene.light, "hard");
    assert.equal(scene.outline, "sticker");
    assert.equal(scene.formatId, "story");
    assert.equal(poster.title, "Hi");
    assert.equal(poster.template, "lower-third");
    assert.equal(motion.fps, 18);
    assert.equal(motion.gifEdge, 720);
  });

  it("keeps a v1 animation loading inside a scene", () => {
    const animation = {
      v: 1,
      name: "Wave",
      duration: 1.6,
      loop: true,
      keyframes: [
        { time: 0, joints: { rArmZ: -20 } },
        { time: 0.8, joints: { rArmZ: -150 }, ease: "ease-in-out", yaw: 90 },
        { time: 1.6, joints: { rArmZ: -20 } },
      ],
    };
    const parsed = parseSceneDocument({ v: 2, cast: [{ name: "Steve", motion: { animation } }] }, skins);
    assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.errors));
    if (!parsed.ok) return;
    assert.equal(parsed.value.scene.players[0].clip, "custom");
    const loaded = parsed.value.scene.players[0].customAnimation;
    assert.equal(loaded?.name, "Wave");
    assert.equal(loaded?.keyframes[1].ease, "ease-in-out");
    assert.equal(loaded?.keyframes[1].yaw, 90);
    // v1 parsing fills the omitted scalars with zero, exactly as before easing existed.
    assert.equal(loaded?.keyframes[0].bob, 0);
  });

  it("wraps a bare v1 animation file as a one-avatar scene", () => {
    const animation = {
      v: 1,
      name: "Nod",
      duration: 1,
      loop: true,
      keyframes: [
        { time: 0, joints: { headX: 0 } },
        { time: 1, joints: { headX: 20 } },
      ],
    };
    const parsed = loadAnyScene(animation, skins);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.scene.players.length, 1);
    assert.equal(parsed.value.scene.players[0].clip, "custom");
    assert.equal(parsed.value.warnings.length, 1);
  });

  it("rejects bad documents with a useful path", () => {
    const cases: Array<[unknown, string]> = [
      [null, "err.sceneJson"],
      [{ v: 1, cast: [] }, "err.sceneVersion"],
      [{ v: 2 }, "err.sceneCast"],
      [{ v: 2, cast: [] }, "err.sceneCast"],
      [{ v: 2, cast: [{ skin: "https://x/y.png", motion: "moonwalk" }] }, "err.sceneMotion"],
      [{ v: 2, cast: [{ pose: "dab" }] }, "err.scenePose"],
      [{ v: 2, cast: [{ skin: "javascript:alert(1)" }] }, "err.sceneSkin"],
      [{ v: 2, cast: [{ pose: { headX: 999 } }] }, "err.sceneJoints"],
      [{ v: 2, cast: [{}], stage: { pack: "nope" } }, "err.scenePack"],
      [{ v: 2, cast: [{}], stage: { light: "disco" } }, "err.sceneStage"],
      [{ v: 2, cast: [{}], props: [{ item: "diamond" }] }, "err.sceneProp"],
      [{ v: 2, cast: [{}], camera: { position: [1, 2] } }, "err.sceneCamera"],
      [{ v: 2, cast: [{}], export: { format: "billboard" } }, "err.sceneFormat"],
      [{ v: 2, cast: [{}], extra: true }, "err.sceneUnknown"],
    ];
    for (const [value, code] of cases) {
      const parsed = parseSceneDocument(value, skins);
      assert.equal(parsed.ok, false, `expected ${code} for ${JSON.stringify(value)}`);
      if (parsed.ok) continue;
      assert.ok(
        parsed.errors.some((issue) => issue.code === code),
        `${JSON.stringify(value)} produced ${JSON.stringify(parsed.errors)}`,
      );
    }
    assert.equal(parseSceneText("{", skins).ok, false);
    assert.equal(parseSceneText(`{"v":2,"cast":[],"x":"${"a".repeat(4_000_001)}"}`, skins).ok, false);
  });

  it("round-trips the studio draft back to a document", () => {
    const scene = mustParse({
      v: 2,
      cast: [
        { id: "a", name: "Steve", skin: "steve", pose: "hero", motion: { preset: "wave", speed: 1.2 }, position: { x: 2 } },
        { id: "b", name: "Alex", skin: "alex", model: "slim", pose: "sit", motion: "sit" },
      ],
      props: [{ id: "o1", item: "stone", position: { x: 5 }, hidden: true }],
      stage: { background: "night", grade: "ice", outline: "ink", godrays: true, light: "neon", keyIntensity: 1.3 },
      export: { format: "xhs" },
    });
    const doc = toSceneDocument(scene, {
      camera: { p: [1, 2, 3], t: [0, 1, 0] },
      poster: parsePosterText({ title: "T" }),
      motion: { ...DEFAULT_MOTION_EXPORT, fps: 20 },
    });
    const again = mustParse(doc);
    assert.equal(again.players.length, 2);
    assert.equal(again.players[0].clipSpeed, 1.2);
    assert.equal(again.players[1].model, "slim");
    assert.equal(again.props[0].hidden, true);
    assert.equal(again.background, "night");
    assert.equal(again.grade, "ice");
    assert.equal(again.keyIntensity, 1.3);
    assert.equal(again.formatId, "xhs");
  });
});

describe("scene packs", () => {
  it("applies look fields and leaves players alone", () => {
    const scene = mustParse({ v: 2, cast: [{ name: "Steve", skin: "steve" }] });
    const pack = scenePackById("nether-cinema");
    assert.ok(pack);
    if (!pack) return;
    const next = applyScenePack(scene, pack);
    assert.deepEqual(next.players, scene.players);
    assert.equal(next.background, pack.background);
    assert.equal(next.grade, pack.grade);
    assert.equal(next.outline, pack.outline);
    assert.equal(next.godrays, pack.godrays);
    assert.equal(next.light, pack.light);
    for (const entry of SCENE_PACKS) {
      assert.ok(entry.camera.p.every(Number.isFinite));
      assert.ok(entry.camera.t.every(Number.isFinite));
      assert.ok(entry.keyIntensity >= 0.45 && entry.keyIntensity <= 1.6);
    }
  });
});

describe("poster text", () => {
  it("clamps text and scale", () => {
    const poster = parsePosterText({ title: "  a\nb  ", subtitle: "x".repeat(200), scale: 99, template: "nope" });
    assert.equal(poster.title, "a b");
    assert.equal(poster.subtitle.length, 96);
    assert.equal(poster.scale, 2);
    assert.equal(poster.template, "clean");
    assert.equal(posterHasText(poster), true);
    assert.equal(posterHasText(parsePosterText({})), false);
  });

  it("only shifts the subject on layouts that ask for it", () => {
    assert.equal(posterSubjectShift(parsePosterText({ title: "x" }), 1920, 1080), 0);
    assert.ok(posterSubjectShift(parsePosterText({ title: "x", template: "x-header" }), 1920, 1080) > 0);
  });
});

describe("motion export plans", () => {
  it("scales long edges and keeps dimensions even", () => {
    const scene = mustParse({ v: 2, cast: [{ name: "Steve", motion: "walk" }] });
    const gif = motionExportPlan(scene.players, { width: 1920, height: 1080 }, parseMotionExport({ gifEdge: 720, fps: 12 }), "gif");
    assert.equal(gif.width, 720);
    assert.equal(gif.height, 406);
    assert.equal(gif.fps, 12);
    assert.ok(gif.frames >= 12 && gif.frames <= 90);
    const mp4 = motionExportPlan(scene.players, { width: 1080, height: 1920 }, parseMotionExport({ mp4Edge: 1080, mp4Fps: 30 }), "mp4");
    assert.ok(mp4.width < 1080 && mp4.height === 1080, `${mp4.width}×${mp4.height}`);
    assert.equal(mp4.frames % 1, 0);
    assert.equal(mp4.width % 2, 0);
    assert.equal(mp4.height % 2, 0);
    // Never upscale: a small canvas keeps its own size.
    const small = motionExportPlan(scene.players, { width: 480, height: 360 }, parseMotionExport({ gifEdge: 720 }), "gif");
    assert.equal(small.width, 480);
    assert.equal(small.height, 360);
  });

  it("honours an explicit frame count and clamps the GIF cap", () => {
    const scene = mustParse({ v: 2, cast: [{ name: "Steve", motion: "spin" }] });
    const plan = motionExportPlan(scene.players, { width: 1080, height: 1080 }, parseMotionExport({ frames: 30, gifEdge: 480 }), "gif");
    assert.equal(plan.frames, 30);
    const capped = motionExportPlan(scene.players, { width: 1080, height: 1080 }, parseMotionExport({ frames: 200 }), "gif");
    assert.equal(capped.frames, 90);
    const mp4 = motionExportPlan(scene.players, { width: 1080, height: 1080 }, parseMotionExport({ frames: 200 }), "mp4");
    assert.equal(mp4.frames, 200);
  });
});
