export type GifFrame = {
  rgba: Uint8ClampedArray;
  delayCs: number;
};

/** 把一串 RGBA 帧编成循环 GIF。索引 0 留给透明像素。 */
export function encodeGif(frames: GifFrame[], width: number, height: number): Uint8Array {
  if (!frames.length) throw new Error("没有可以导出的帧。");
  const expected = width * height * 4;
  if (frames.some((frame) => frame.rgba.length !== expected)) throw new Error("帧尺寸和画布对不上。");

  const samples: number[] = [];
  let transparent = false;
  const stride = Math.max(1, Math.floor((width * height) / 4000));
  for (const frame of frames) {
    const data = frame.rgba;
    for (let pixel = 0; pixel < width * height; pixel += stride) {
      const offset = pixel * 4;
      if (data[offset + 3] < 128) {
        transparent = true;
        continue;
      }
      samples.push((data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]);
    }
  }
  const palette = medianCut(samples, 255);
  while (palette.length < 255) palette.push(palette[palette.length - 1] ?? 0);
  const lookup = buildLookup(palette);

  const bytes: number[] = [];
  const push = (...values: number[]) => {
    bytes.push(...values);
  };
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  push(...u16(width), ...u16(height), 0xf7, 0x00, 0x00);
  push(0, 0, 0);
  for (const color of palette) push((color >> 16) & 255, (color >> 8) & 255, color & 255);
  push(
    0x21,
    0xff,
    0x0b,
    0x4e,
    0x45,
    0x54,
    0x53,
    0x43,
    0x41,
    0x50,
    0x45,
    0x32,
    0x2e,
    0x30,
    0x03,
    0x01,
    0x00,
    0x00,
    0x00,
  );

  for (const frame of frames) {
    const indices = new Uint8Array(width * height);
    const data = frame.rgba;
    for (let pixel = 0; pixel < indices.length; pixel += 1) {
      const offset = pixel * 4;
      if (data[offset + 3] < 128) {
        indices[pixel] = 0;
        continue;
      }
      const key = ((data[offset] >> 3) << 10) | ((data[offset + 1] >> 3) << 5) | (data[offset + 2] >> 3);
      indices[pixel] = lookup[key];
    }
    const packed = transparent ? 0x05 : 0x04;
    const delay = Math.max(2, Math.round(frame.delayCs));
    push(0x21, 0xf9, 0x04, packed, delay & 255, (delay >> 8) & 255, 0x00, 0x00);
    push(0x2c, ...u16(0), ...u16(0), ...u16(width), ...u16(height), 0x00);
    const lzw = lzwEncode(indices, 8);
    push(8);
    for (let offset = 0; offset < lzw.length; offset += 255) {
      const chunk = lzw.subarray(offset, Math.min(lzw.length, offset + 255));
      push(chunk.length, ...chunk);
    }
    push(0x00);
  }
  push(0x3b);
  return Uint8Array.from(bytes);
}

function u16(value: number) {
  return [value & 255, (value >> 8) & 255];
}

function medianCut(samples: number[], count: number) {
  const unique = [...new Set(samples)];
  if (!unique.length) return [0x87a0c4];
  const boxes = [unique];
  while (boxes.length < count) {
    boxes.sort((a, b) => channelRange(b) - channelRange(a));
    const next = boxes.shift();
    if (!next || next.length < 2) {
      if (next) boxes.push(next);
      break;
    }
    const channel = widestChannel(next);
    next.sort((a, b) => ((a >> channel) & 255) - ((b >> channel) & 255));
    const mid = next.length >> 1;
    boxes.push(next.slice(0, mid), next.slice(mid));
  }
  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const color of box) {
      r += (color >> 16) & 255;
      g += (color >> 8) & 255;
      b += color & 255;
    }
    const n = box.length || 1;
    return ((Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)) >>> 0;
  });
}

function channelRange(colors: number[]) {
  return rangeOf(colors, 16) + rangeOf(colors, 8) + rangeOf(colors, 0);
}

function widestChannel(colors: number[]) {
  const scores = [rangeOf(colors, 16), rangeOf(colors, 8), rangeOf(colors, 0)];
  let best = 0;
  if (scores[1] > scores[best]) best = 1;
  if (scores[2] > scores[best]) best = 2;
  return 16 - best * 8;
}

function rangeOf(colors: number[], shift: number) {
  let min = 255;
  let max = 0;
  for (const color of colors) {
    const value = (color >> shift) & 255;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}

function buildLookup(palette: number[]) {
  const lut = new Uint8Array(32768);
  for (let key = 0; key < lut.length; key += 1) {
    const r = ((key >> 10) & 31) << 3;
    const g = ((key >> 5) & 31) << 3;
    const b = (key & 31) << 3;
    let best = 1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let index = 0; index < palette.length; index += 1) {
      const color = palette[index];
      const dr = r - ((color >> 16) & 255);
      const dg = g - ((color >> 8) & 255);
      const db = b - (color & 255);
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = index + 1;
      }
    }
    lut[key] = best;
  }
  return lut;
}

function lzwEncode(indices: Uint8Array, minCodeSize: number) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let maxCode = (1 << codeSize) - 1;
  const children = new Map<number, Map<number, number>>();
  const resetDict = () => {
    children.clear();
    for (let code = 0; code < clear; code += 1) children.set(code, new Map());
    next = eoi + 1;
  };
  resetDict();

  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  let pendingClear = false;
  const write = (value: number) => {
    acc |= value << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
    if (pendingClear) {
      codeSize = minCodeSize + 1;
      maxCode = (1 << codeSize) - 1;
      pendingClear = false;
    } else if (next > maxCode && codeSize < 12) {
      codeSize += 1;
      maxCode = codeSize === 12 ? 4096 : (1 << codeSize) - 1;
    }
  };

  write(clear);
  let prefix = indices[0] ?? 0;
  for (let index = 1; index < indices.length; index += 1) {
    const symbol = indices[index];
    const table = children.get(prefix);
    const existing = table?.get(symbol);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      if (table) table.set(symbol, next);
      else children.set(prefix, new Map([[symbol, next]]));
      next += 1;
    } else {
      resetDict();
      pendingClear = true;
      write(clear);
    }
    prefix = symbol;
  }
  write(prefix);
  write(eoi);
  if (bits > 0) bytes.push(acc & 255);
  return Uint8Array.from(bytes);
}
