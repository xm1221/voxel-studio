import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { gltfToGlb, parseGlb, projectToGltf, propClipFromGltf, writeGltfJson } from "../lib/gltf-io.ts";
import { projectToBbmodel, propClipFromBbmodel } from "../lib/bbmodel-io.ts";
import { addCatalogProp, addCustom, blankProject, customFromImage, writeKeyframe } from "../lib/project-edit.ts";

const require = createRequire(import.meta.url);
const gltfValidator = require("gltf-validator") as {
  validateBytes: (data: Uint8Array) => Promise<{ issues: { numErrors: number; messages: Array<{ message: string; severity: number }> } }>;
};

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function projectWithMotion() {
  const placed = addCustom(blankProject(), customFromImage("ruby", "block", PNG));
  assert.equal("error" in placed, false);
  if ("error" in placed) throw new Error(placed.error);
  const prop = placed.project.scene.props?.[0];
  assert.ok(prop);
  const keyed = writeKeyframe(placed.project, prop.id, 0, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
  if ("error" in keyed) throw new Error(keyed.error);
  const end = writeKeyframe(keyed.project, prop.id, 1, { position: { x: 8, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 } });
  if ("error" in end) throw new Error(end.error);
  return { project: end.project, propId: prop.id };
}

describe("blockbench and gltf interchange", () => {
  it("round-trips prop animation through a bbmodel", () => {
    const { project, propId } = projectWithMotion();
    const bbmodel = projectToBbmodel(project);
    const clip = propClipFromBbmodel(bbmodel, [propId]);
    assert.ok(clip);
    const start = clip.keyframes.find((frame) => frame.time === 0)?.values[propId];
    const end = clip.keyframes.find((frame) => frame.time === 1)?.values[propId];
    assert.deepEqual(start?.position, { x: 0, y: 0, z: 0 });
    assert.deepEqual(end?.position, { x: 8, y: 0, z: 0 });
    assert.equal(end?.rotation?.y, 90);
  });

  it("writes a glb with nearest sampling and reads the animation back", async () => {
    const { project, propId } = projectWithMotion();
    const textures = new Map([[project.customs[0].id + ":sprite", PNG]]);
    for (const [key, url] of Object.entries(project.customs[0].textures)) {
      const body = url.split(",")[1] ?? "";
      textures.set(key, Buffer.from(body, "base64"));
    }
    const document = projectToGltf(project, textures);
    const sampler = (document.json.samplers as Array<{ magFilter: number; minFilter: number }>)[0];
    assert.equal(sampler.magFilter, 9728);
    assert.equal(sampler.minFilter, 9728);
    const names = (document.json.nodes as Array<{ name?: string }>).map((node) => node.name);
    assert.ok(names.includes(propId));
    const glb = gltfToGlb(document);
    assert.equal(glb[0], 0x67);
    assert.equal(glb[1], 0x6c);
    assert.equal(glb[2], 0x54);
    assert.equal(glb[3], 0x46);
    const parsed = parseGlb(glb);
    assert.ok(parsed);
    const clip = propClipFromGltf(parsed.json, parsed.bin, [propId]);
    assert.ok(clip);
    const end = clip.keyframes.find((frame) => frame.time === 1)?.values[propId];
    assert.equal(end?.position?.x, 8);
    assert.ok(Math.abs((end?.rotation?.y ?? 0) - 90) < 0.05);
    const external = writeGltfJson(document, "scene.bin");
    assert.equal(external.buffers[0].uri, "scene.bin");
    const report = await gltfValidator.validateBytes(glb);
    const errors = report.issues.messages.filter((issue) => issue.severity === 0);
    assert.deepEqual(errors.map((issue) => issue.message), []);
  });

  it("places a namespaced catalog id on a blank project", () => {
    const placed = addCatalogProp(blankProject(), "block:stone");
    assert.equal("error" in placed, false);
  });
});
