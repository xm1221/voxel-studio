import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { main } from "../cli/pixelstage.ts";
import { projectErrors } from "../lib/project-edit.ts";

const dir = mkdtempSync(join(tmpdir(), "pixelstage-cli-"));
const project = join(dir, "stage.json");

describe("pixelstage cli", () => {
  it("inits, validates, adds a block, and keys a pose", async () => {
    assert.equal(await main(["init", project]), 0);
    assert.equal(await main(["validate", project]), 0);
    assert.equal(await main(["add", project, "block:grass_block"]), 0);
    const saved = JSON.parse(readFileSync(project, "utf8")) as { scene: { props: Array<{ id: string }> } };
    const id = saved.scene.props[0].id;
    assert.equal(await main(["keyframe", project, "--prop", id, "--time", "0.5", "--rot", "0,15,0"]), 0);
    const keyed = JSON.parse(readFileSync(project, "utf8")) as { scene: { propClip: { keyframes: Array<{ time: number }> } } };
    assert.equal(keyed.scene.propClip.keyframes[0].time, 0.5);
  });

  it("names the broken field when a project is invalid", async () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ v: 1, scene: { v: 1, players: [] }, customs: [{ id: "nope" }] }));
    const errors = projectErrors(JSON.parse(readFileSync(bad, "utf8")));
    assert.ok(errors.some((error) => error.includes("/scene/players")));
    assert.ok(errors.some((error) => error.includes("/customs/0")));
    assert.equal(await main(["validate", bad]), 1);
  });

  it("lists the built-in shelf when no catalog file is passed", async () => {
    const lines: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      assert.equal(await main(["list", "stone"]), 0);
    } finally {
      process.stdout.write = write;
    }
    assert.match(lines.join(""), /stone/);
  });
});
