import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planExport, stageIsTransparent } from "../lib/exporters.ts";
import { parseSceneDocument } from "../lib/scene-doc.ts";
import type { SceneDraft } from "../lib/types.ts";

const skins = { steve: "data:image/png;base64,STEVE", alex: "data:image/png;base64,ALEX" };

function scene(value: unknown): SceneDraft {
  const parsed = parseSceneDocument(value, skins);
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.errors));
  if (!parsed.ok) throw new Error("unreachable");
  return parsed.value.scene;
}

describe("planExport", () => {
  it("sizes a PNG from the format and names a transparent still differently", () => {
    const draft = scene({ v: 2, cast: [{ id: "a", name: "Steve", motion: "walk" }], export: { format: "square" } });
    const still = planExport(draft, {}, "png");
    assert.equal(still.width, 1080);
    assert.equal(still.height, 1080);
    assert.equal(still.frames, 1);
    assert.equal(still.transparent, false);
    assert.equal(still.round, false);
    assert.equal(still.filename, "pixelstage-steve-square.png");
    assert.equal(still.mime, "image/png");

    const avatar = scene({ v: 2, cast: [{ id: "a", name: "Steve O'Neil" }], export: { format: "pfp" } });
    const round = planExport(avatar, {}, "png");
    assert.equal(round.width, 800);
    assert.equal(round.height, 800);
    assert.equal(round.round, true);
    assert.equal(round.formatId, "avatar");
    assert.equal(round.filename, "pixelstage-steve-o-neil-avatar.png");
    const cutout = planExport(avatar, { transparent: true }, "png");
    assert.equal(cutout.transparent, true);
    assert.equal(cutout.round, false);
    assert.equal(cutout.filename, "pixelstage-steve-o-neil-transparent.png");
  });

  it("scales GIF and MP4 once from the long edge and keeps even pixels", () => {
    const draft = scene({
      v: 2,
      cast: [{ id: "a", name: "Steve", motion: "walk" }],
      export: { format: "desktop" },
    });
    const gif = planExport(draft, { longEdge: 720, fps: 12, frames: 24 }, "gif");
    assert.equal(gif.width, 720);
    assert.equal(gif.height, 406);
    assert.equal(gif.fps, 12);
    assert.equal(gif.frames, 24);
    assert.equal(gif.width % 2, 0);
    assert.equal(gif.height % 2, 0);
    assert.equal(gif.filename, "pixelstage-steve-walk.gif");
    assert.equal(gif.mime, "image/gif");

    const wide = scene({ v: 2, cast: [{ id: "a", name: "Steve", motion: "idle" }], export: { format: "youtube" } });
    const mp4 = planExport(wide, { longEdge: 1080, fps: 30, bitrate: 8_000_000 }, "mp4");
    assert.equal(mp4.width, 1080);
    assert.equal(mp4.height, 608);
    assert.equal(mp4.fps, 30);
    assert.equal(mp4.bitrate, 8_000_000);
    assert.equal(mp4.round, false);
    assert.equal(mp4.transparent, false);
    assert.equal(mp4.filename, "pixelstage-steve-idle.mp4");
    // A 1080 request must not be scaled again by the default 720 MP4 edge.
    assert.ok(mp4.width > 720);

    const custom = planExport(wide, { width: 513, height: 200 }, "png");
    assert.equal(custom.width, 513);
    assert.equal(custom.height, 200);
    assert.equal(custom.filename, "pixelstage-steve-custom.png");
  });

  it("names a group export and only turns on alpha when asked", () => {
    const draft = scene({
      v: 2,
      cast: [
        { id: "a", name: "史蒂夫", motion: "wave" },
        { id: "b", name: "Alex", motion: "idle" },
      ],
      export: { format: "story" },
    });
    const gif = planExport(draft, { transparent: true, frames: 12 }, "gif");
    assert.equal(gif.transparent, true);
    assert.equal(gif.round, false);
    assert.equal(gif.filename, "pixelstage-skin-players.gif");
    assert.equal(gif.frames, 12);
    const plain = planExport(draft, { frames: 12 }, "gif");
    assert.equal(plain.transparent, false);

    draft.background = "none";
    draft.backgroundImage = null;
    assert.equal(stageIsTransparent(draft), true);
    draft.backgroundImage = "data:image/png;base64,aaaa";
    assert.equal(stageIsTransparent(draft), false);
    assert.equal(stageIsTransparent(null), false);
    const seconds = planExport(draft, { seconds: 4, frames: 10 }, "mp4");
    assert.equal(seconds.seconds, 4);
    assert.equal(seconds.frames, 10);
  });
});
