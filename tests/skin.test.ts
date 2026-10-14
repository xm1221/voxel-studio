import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { inferModelType, loadSkinToCanvas } from "../lib/skin-image.ts";

type Stub = ReturnType<typeof createCanvas>;

function paint(width: number, height: number, fill: (context: SKRSContext2D) => void) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#c48b62";
  context.fillRect(0, 0, width, height);
  fill(context);
  return canvas;
}

function pixel(canvas: Stub, x: number, y: number) {
  const data = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}

describe("skin parsing", () => {
  it("keeps a 64x64 classic skin and clears an opaque jacket", () => {
    const source = paint(64, 64, (context) => {
      context.fillStyle = "#2244aa";
      context.fillRect(8, 8, 8, 8);
      context.fillStyle = "#ff00aa";
      context.fillRect(40, 32, 8, 8);
    });
    const canvas = createCanvas(1, 1);
    loadSkinToCanvas(canvas as unknown as HTMLCanvasElement, source as unknown as HTMLImageElement);
    assert.equal(canvas.width, 64);
    assert.equal(canvas.height, 64);
    assert.deepEqual(pixel(canvas, 10, 10).slice(0, 3), [34, 68, 170]);
    assert.equal(pixel(canvas, 44, 36)[3], 0);
    assert.equal(inferModelType(canvas as unknown as HTMLCanvasElement), "default");
  });

  it("detects slim arms from the empty columns, including a 128x128 skin", () => {
    const source = paint(128, 128, (context) => {
      context.clearRect(100, 32, 4, 8);
    });
    const canvas = createCanvas(1, 1);
    loadSkinToCanvas(canvas as unknown as HTMLCanvasElement, source as unknown as HTMLImageElement);
    assert.equal(inferModelType(canvas as unknown as HTMLCanvasElement), "slim");
  });

  it("treats all-white slim columns as slim and a filled classic arm as wide", () => {
    const slim = paint(64, 64, (context) => {
      context.fillStyle = "#ffffff";
      for (const [x, y, w, h] of [
        [50, 16, 2, 4],
        [54, 20, 2, 12],
        [42, 48, 2, 4],
        [46, 52, 2, 12],
      ] as const) {
        context.fillRect(x, y, w, h);
      }
    });
    const wide = paint(64, 64, (context) => {
      context.fillStyle = "#335577";
      context.fillRect(50, 16, 2, 4);
      context.fillRect(54, 20, 2, 12);
      context.fillRect(42, 48, 2, 4);
      context.fillRect(46, 52, 2, 12);
    });
    const slimCanvas = createCanvas(1, 1);
    const wideCanvas = createCanvas(1, 1);
    loadSkinToCanvas(slimCanvas as unknown as HTMLCanvasElement, slim as unknown as HTMLImageElement);
    loadSkinToCanvas(wideCanvas as unknown as HTMLCanvasElement, wide as unknown as HTMLImageElement);
    assert.equal(inferModelType(slimCanvas as unknown as HTMLCanvasElement), "slim");
    assert.equal(inferModelType(wideCanvas as unknown as HTMLCanvasElement), "default");
  });

  it("expands a 64x32 skin and mirrors the right leg onto the left", () => {
    const source = paint(64, 32, (context) => {
      context.fillStyle = "#ff0000";
      context.fillRect(4, 20, 1, 1);
      context.fillStyle = "#0000ff";
      context.fillRect(7, 20, 1, 1);
    });
    const canvas = createCanvas(1, 1);
    loadSkinToCanvas(canvas as unknown as HTMLCanvasElement, source as unknown as HTMLImageElement);
    assert.equal(canvas.height, 64);
    assert.deepEqual(pixel(canvas, 4, 20).slice(0, 3), [255, 0, 0]);
    const left = pixel(canvas, 20, 52);
    const leftFar = pixel(canvas, 23, 52);
    assert.notDeepEqual(left.slice(0, 3), leftFar.slice(0, 3));
    assert.equal(left[3], 255);
    assert.equal(leftFar[3], 255);
  });
});
