import type { ModelType } from "./types";

type SkinCanvas = HTMLCanvasElement;

function scaleOf(width: number) {
  return width / 64;
}

function hasTransparency(context: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
  const img = context.getImageData(x0, y0, w, h).data;
  for (let i = 3; i < img.length; i += 4) {
    if (img[i] !== 255) return true;
  }
  return false;
}

function clearArea(context: CanvasRenderingContext2D, scale: number, x: number, y: number, w: number, h: number) {
  context.clearRect(x * scale, y * scale, w * scale, h * scale);
}

function fixOpaqueSkin(context: CanvasRenderingContext2D, width: number, modern: boolean) {
  if (hasTransparency(context, 0, 0, width, modern ? width : width / 2)) return;
  const scale = scaleOf(width);
  const clear = (x: number, y: number, w: number, h: number) => clearArea(context, scale, x, y, w, h);
  clear(32, 0, 32, 16);
  if (!modern) return;
  clear(0, 32, 16, 16);
  clear(16, 32, 24, 16);
  clear(40, 32, 16, 16);
  clear(0, 48, 16, 16);
  clear(48, 48, 16, 16);
}

function convertLegacy(context: CanvasRenderingContext2D, width: number) {
  context.save();
  context.scale(-1, 1);
  const scale = scaleOf(width);
  const copy = (sx: number, sy: number, w: number, h: number, dx: number, dy: number) => {
    context.drawImage(context.canvas, sx * scale, sy * scale, w * scale, h * scale, -dx * scale, dy * scale, -w * scale, h * scale);
  };
  copy(4, 16, 4, 4, 20, 48);
  copy(8, 16, 4, 4, 24, 48);
  copy(0, 20, 4, 12, 24, 52);
  copy(4, 20, 4, 12, 20, 52);
  copy(8, 20, 4, 12, 16, 52);
  copy(12, 20, 4, 12, 28, 52);
  copy(44, 16, 4, 4, 36, 48);
  copy(48, 16, 4, 4, 40, 48);
  copy(40, 20, 4, 12, 40, 52);
  copy(44, 20, 4, 12, 36, 52);
  copy(48, 20, 4, 12, 32, 52);
  copy(52, 20, 4, 12, 44, 52);
  context.restore();
}

export function loadSkinToCanvas(canvas: SkinCanvas, image: CanvasImageSource & { width: number; height: number }) {
  const legacy = image.width === image.height * 2;
  if (!legacy && image.width !== image.height) {
    throw new Error("皮肤需要是 64×64，或旧版 64×32，高清皮肤同比例也行。");
  }
  const side = image.width;
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("画布不可用。");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, side, side);
  if (legacy) {
    context.drawImage(image, 0, 0, side, side / 2);
    convertLegacy(context, side);
    fixOpaqueSkin(context, side, false);
  } else {
    context.drawImage(image, 0, 0, side, side);
    fixOpaqueSkin(context, side, true);
  }
}

function areaMatches(
  context: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  test: (r: number, g: number, b: number, a: number) => boolean,
) {
  const img = context.getImageData(x0, y0, w, h).data;
  for (let i = 0; i < img.length; i += 4) {
    if (!test(img[i], img[i + 1], img[i + 2], img[i + 3])) return false;
  }
  return true;
}

export function inferModelType(canvas: SkinCanvas): ModelType {
  const scale = scaleOf(canvas.width);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "default";
  const region = (x: number, y: number, w: number, h: number) => ({
    x: x * scale,
    y: y * scale,
    w: w * scale,
    h: h * scale,
  });
  const zones = [
    region(50, 16, 2, 4),
    region(54, 20, 2, 12),
    region(42, 48, 2, 4),
    region(46, 52, 2, 12),
  ];
  const transparent = zones.some((zone) => hasTransparency(context, zone.x, zone.y, zone.w, zone.h));
  const allBlack = zones.every((zone) =>
    areaMatches(context, zone.x, zone.y, zone.w, zone.h, (r, g, b, a) => r === 0 && g === 0 && b === 0 && a === 255),
  );
  const allWhite = zones.every((zone) =>
    areaMatches(context, zone.x, zone.y, zone.w, zone.h, (r, g, b, a) => r === 255 && g === 255 && b === 255 && a === 255),
  );
  return transparent || allBlack || allWhite ? "slim" : "default";
}

export function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("皮肤图片没有读出来。"));
    image.src = url;
  });
}
