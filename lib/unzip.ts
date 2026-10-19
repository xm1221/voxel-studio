export type ZipEntry = { name: string; bytes: Uint8Array };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Read a zip. Only entries accepted by `include` are inflated. */
export async function readZip(
  data: Uint8Array,
  options?: { include?: (name: string) => boolean; maxEntryBytes?: number },
): Promise<ZipEntry[]> {
  const include = options?.include ?? (() => true);
  const maxEntryBytes = options?.maxEntryBytes ?? 8 * 1024 * 1024;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEocd(data);
  if (eocd < 0) throw new Error("bad zip");
  const count = view.getUint16(eocd + 10, true);
  const offset = view.getUint32(eocd + 16, true);
  if (count > 20000 || offset === 0xffffffff || offset > data.length) throw new Error("bad zip");

  const entries: ZipEntry[] = [];
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > data.length || view.getUint32(cursor, true) !== CENTRAL) throw new Error("bad zip");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(data.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    const encrypted = (flags & 1) !== 0;
    if (encrypted || !include(name) || name.endsWith("/")) continue;
    if (uncompressed > maxEntryBytes || compressed > maxEntryBytes) continue;
    if (method !== 0 && method !== 8) continue;
    if (localOffset + 30 > data.length || view.getUint32(localOffset, true) !== LOCAL) throw new Error("bad zip");
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + localExtra;
    if (start + compressed > data.length) throw new Error("bad zip");
    const slice = data.subarray(start, start + compressed);
    const bytes = method === 0 ? slice.slice() : await inflateRaw(slice);
    if (bytes.byteLength > maxEntryBytes) continue;
    entries.push({ name, bytes });
  }
  return entries;
}

function view32(data: Uint8Array, offset: number) {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
}

function findEocd(data: Uint8Array) {
  const start = Math.max(0, data.length - 22 - 65535);
  for (let index = data.length - 22; index >= start; index -= 1) {
    if (view32(data, index) === EOCD) return index;
  }
  return -1;
}

async function inflateRaw(data: Uint8Array) {
  const stream = new DecompressionStream("deflate-raw");
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const writing = writer.write(copy).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    chunks.push(step.value);
    length += step.value.byteLength;
  }
  await writing;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
