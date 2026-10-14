import { code } from "./i18n";

type FaceColors = {
  top: string;
  bottom: string;
  right: string;
  front: string;
  left: string;
  back: string;
};

function paintBox(
  context: CanvasRenderingContext2D,
  u: number,
  v: number,
  width: number,
  height: number,
  depth: number,
  colors: FaceColors,
) {
  const fill = (x: number, y: number, w: number, h: number, color: string) => {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  };
  fill(u + depth, v, width, depth, colors.top);
  fill(u + width + depth, v, width, depth, colors.bottom);
  fill(u, v + depth, depth, height, colors.right);
  fill(u + depth, v + depth, width, height, colors.front);
  fill(u + width + depth, v + depth, depth, height, colors.left);
  fill(u + width + depth * 2, v + depth, width, height, colors.back);
}

function paintFacePixels(
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  rows: string[],
  palette: Record<string, string>,
) {
  rows.forEach((row, y) => {
    [...row].forEach((token, x) => {
      const color = palette[token];
      if (!color) return;
      context.fillStyle = color;
      context.fillRect(originX + x, originY + y, 1, 1);
    });
  });
}

export function createSteveSkin() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(code("err.canvas"));
  const hair = "#3a2618";
  const skin = "#c48b62";
  const skinDeep = "#a56d49";
  const shirt = "#3d9b93";
  const shirtDeep = "#2f7d76";
  const pants = "#3a3d8f";
  const pantsDeep = "#2a2c6e";
  const white = "#f4f7fb";
  const eye = "#3d2a78";

  paintBox(context, 0, 0, 8, 8, 8, {
    top: hair,
    bottom: skin,
    right: hair,
    front: skin,
    left: hair,
    back: hair,
  });
  paintFacePixels(context, 8, 8, [
    "hhhhhhhh",
    "hhhhhhhh",
    "ssssssss",
    "swpsswps",
    "ssssssss",
    "ssddssss",
    "ssssssss",
    "ssssssss",
  ], { h: hair, s: skin, w: white, p: eye, d: skinDeep });

  paintBox(context, 16, 16, 8, 12, 4, {
    top: skin,
    bottom: shirtDeep,
    right: shirtDeep,
    front: shirt,
    left: shirtDeep,
    back: shirt,
  });
  paintBox(context, 40, 16, 4, 12, 4, {
    top: shirt,
    bottom: skin,
    right: shirtDeep,
    front: shirt,
    left: shirt,
    back: shirtDeep,
  });
  context.fillStyle = skin;
  context.fillRect(44, 28, 4, 4);
  context.fillRect(40, 28, 4, 4);
  context.fillRect(48, 28, 4, 4);
  context.fillRect(52, 28, 4, 4);
  paintBox(context, 32, 48, 4, 12, 4, {
    top: shirt,
    bottom: skin,
    right: shirt,
    front: shirt,
    left: shirtDeep,
    back: shirtDeep,
  });
  context.fillStyle = skin;
  context.fillRect(36, 60, 4, 4);
  context.fillRect(32, 60, 4, 4);
  context.fillRect(40, 60, 4, 4);
  context.fillRect(44, 60, 4, 4);
  paintBox(context, 0, 16, 4, 12, 4, {
    top: pants,
    bottom: pantsDeep,
    right: pantsDeep,
    front: pants,
    left: pants,
    back: pantsDeep,
  });
  paintBox(context, 16, 48, 4, 12, 4, {
    top: pants,
    bottom: pantsDeep,
    right: pants,
    front: pants,
    left: pantsDeep,
    back: pantsDeep,
  });
  return canvas.toDataURL("image/png");
}

export function createAlexSkin() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(code("err.canvas"));
  const hair = "#e08a3c";
  const skin = "#e2b48a";
  const skinDeep = "#c48b62";
  const shirt = "#4e9a56";
  const shirtDeep = "#3c7c44";
  const pants = "#6d4a32";
  const pantsDeep = "#543826";
  const white = "#f4f7fb";
  const eye = "#2f7a45";

  paintBox(context, 0, 0, 8, 8, 8, {
    top: hair,
    bottom: skin,
    right: hair,
    front: skin,
    left: hair,
    back: hair,
  });
  paintFacePixels(context, 8, 8, [
    "hhhhhhhh",
    "hhhhhhhh",
    "hssssssh",
    "swpsswph",
    "sssssssh",
    "sssdsssh",
    "ssssssss",
    "ssssssss",
  ], { h: hair, s: skin, w: white, p: eye, d: skinDeep });

  paintBox(context, 16, 16, 8, 12, 4, {
    top: skin,
    bottom: shirtDeep,
    right: shirtDeep,
    front: shirt,
    left: shirtDeep,
    back: shirt,
  });

  const arm = (u: number, v: number) => {
    paintBox(context, u, v, 3, 12, 4, {
      top: shirt,
      bottom: skin,
      right: shirtDeep,
      front: shirt,
      left: shirt,
      back: shirtDeep,
    });
    context.fillStyle = skin;
    context.fillRect(u + 4, v + 12, 3, 4);
    context.fillRect(u, v + 12, 4, 4);
    context.fillRect(u + 7, v + 12, 4, 4);
    context.fillRect(u + 11, v + 12, 3, 4);
  };
  arm(40, 16);
  arm(32, 48);

  paintBox(context, 0, 16, 4, 12, 4, {
    top: pants,
    bottom: pantsDeep,
    right: pantsDeep,
    front: pants,
    left: pants,
    back: pantsDeep,
  });
  paintBox(context, 16, 48, 4, 12, 4, {
    top: pants,
    bottom: pantsDeep,
    right: pants,
    front: pants,
    left: pantsDeep,
    back: pantsDeep,
  });
  return canvas.toDataURL("image/png");
}
