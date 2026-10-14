import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeGif } from "../lib/gif.ts";

describe("gif graphic control", () => {
  it("sets disposal method 2 and the transparency flag on every frame", () => {
    const width = 2;
    const height = 2;
    const frames = [0, 1].map((index) => {
      const rgba = new Uint8ClampedArray(width * height * 4);
      rgba[0] = index === 0 ? 220 : 20;
      rgba[2] = index === 0 ? 20 : 220;
      rgba[3] = 255;
      return { rgba, delayCs: 8 };
    });

    const gif = encodeGif(frames, width, height);
    const packedBytes: number[] = [];
    for (let index = 0; index < gif.length - 3; index += 1) {
      if (gif[index] === 0x21 && gif[index + 1] === 0xf9 && gif[index + 2] === 0x04) {
        packedBytes.push(gif[index + 3]);
      }
    }

    assert.equal(packedBytes.length, 2);
    for (const packed of packedBytes) {
      assert.equal((packed >> 2) & 7, 2);
      assert.equal(packed & 1, 1);
    }
  });
});
