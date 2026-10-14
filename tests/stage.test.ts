import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKGROUNDS, backgroundDrawRect, stageLook } from "../lib/stage-look.ts";
import type { BackgroundId } from "../lib/types.ts";

const ids: BackgroundId[] = ["studio", "noon", "sunset", "night", "nether", "none"];

describe("stage backgrounds", () => {
  it("switches floor, sky, and fog with each preset", () => {
    for (const background of ids) {
      const look = stageLook({ background, godrays: true, light: "soft", backgroundImage: null });
      assert.equal(look.shadowFloor, true);
      assert.equal(look.studioFloor, background === "studio");
      assert.equal(look.grass, background === "noon" || background === "sunset" || background === "night");
      assert.equal(look.nether, background === "nether");
      assert.equal(look.fog, background !== "studio" && background !== "none");
      assert.equal(look.rays, background !== "none");
      if (background === "none") assert.equal(look.sky, null);
      else assert.equal(look.sky, BACKGROUNDS[background]);
    }
  });

  it("hides preset floors and fog when a custom image is set, and keeps the shadow", () => {
    const look = stageLook({
      background: "noon",
      godrays: true,
      light: "moon",
      backgroundImage: "data:image/png;base64,aaaa",
    });
    assert.equal(look.customImage, true);
    assert.equal(look.studioFloor, false);
    assert.equal(look.grass, false);
    assert.equal(look.nether, false);
    assert.equal(look.shadowFloor, true);
    assert.equal(look.fog, false);
    assert.equal(look.rays, false);
    assert.equal(look.sky, BACKGROUNDS.noon);
  });

  it("covers a wide image by cropping the sides and contains it with bars", () => {
    const cover = backgroundDrawRect(200, 100, 100, 100, "cover");
    assert.equal(cover.width, 200);
    assert.equal(cover.height, 100);
    assert.equal(cover.x, -50);
    assert.equal(cover.y, 0);

    const contain = backgroundDrawRect(200, 100, 100, 100, "contain");
    assert.equal(contain.width, 100);
    assert.equal(contain.height, 50);
    assert.equal(contain.x, 0);
    assert.equal(contain.y, 25);
  });

  it("covers a tall image by cropping the top and bottom", () => {
    const cover = backgroundDrawRect(100, 200, 100, 100, "cover");
    assert.equal(cover.width, 100);
    assert.equal(cover.height, 200);
    assert.equal(cover.x, 0);
    assert.equal(cover.y, -50);
  });
});
