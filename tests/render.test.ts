import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderProject } from "../cli/render.ts";
import { addCustom, blankProject, customFromImage, writeKeyframe } from "../lib/project-edit.ts";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const chrome = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

describe("headless render", () => {
  it("writes png frames and movies from the studio engine", { timeout: 120_000 }, async (t) => {
    if (!existsSync(chrome)) {
      t.skip("chrome is not installed");
      return;
    }
    const probe = await fetch("http://127.0.0.1:3000/render").catch(() => null);
    if (!probe?.ok) {
      t.skip("render page is not being served");
      return;
    }
    const placed = addCustom(blankProject(), customFromImage("ruby", "block", PNG));
    if ("error" in placed) throw new Error(placed.error);
    const prop = placed.project.scene.props?.[0];
    if (!prop) throw new Error("missing prop");
    const start = writeKeyframe(placed.project, prop.id, 0, { position: { x: -12, y: 0, z: 0 } });
    if ("error" in start) throw new Error(start.error);
    const end = writeKeyframe(start.project, prop.id, 1, { position: { x: 12, y: 0, z: 0 } });
    if ("error" in end) throw new Error(end.error);
    const out = mkdtempSync(join(tmpdir(), "pixelstage-render-"));
    const result = await renderProject({
      project: end.project,
      out,
      fps: 2,
      seconds: 1,
      width: 64,
      height: 48,
      url: "http://127.0.0.1:3000",
      gif: true,
      mp4: true,
      webm: true,
    });
    assert.equal(result.frames, 2);
    assert.ok(result.pngs[0][0] === 0x89 && result.pngs[0][1] === 0x50);
    assert.notDeepEqual(result.pngs[0], result.pngs[1]);
    for (const name of ["render.gif", "render.mp4", "render.webm"]) {
      assert.ok(existsSync(join(out, name)), name);
    }
  });
});