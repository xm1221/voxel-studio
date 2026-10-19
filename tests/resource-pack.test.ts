import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { toPayload } from "../lib/persist.ts";
import { readResourcePack, texturesFromPackFiles, vanillaFallbackKeys } from "../lib/resource-pack.ts";
import { defaultScene } from "../lib/studio-state.ts";
import { readZip } from "../lib/unzip.ts";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function u16(value: number) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function u32(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function buildZip(files: Array<{ name: string; data: Buffer; method: 0 | 8 }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const stored = file.method === 8 ? deflateRawSync(file.data) : file.data;
    const crc = crc32(file.data) >>> 0;
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(file.method),
      u16(0),
      u16(0),
      u32(crc),
      u32(stored.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      stored,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(file.method),
      u16(0),
      u16(0),
      u32(crc),
      u32(stored.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBuf.length),
    u32(offset),
    u16(0),
  ]);
  return new Uint8Array(Buffer.concat([...locals, centralBuf, eocd]));
}

describe("resource pack textures", () => {
  it("reads deflate and stored entries, and maps modern, legacy, and temperate paths", async () => {
    const zip = buildZip([
      { name: "pack/assets/minecraft/textures/block/stone.png", data: PNG, method: 8 },
      { name: "pack/assets/minecraft/textures/blocks/grass_side.png", data: PNG, method: 0 },
      { name: "pack/assets/minecraft/textures/entity/pig/pig_temperate.png", data: PNG, method: 8 },
      { name: "pack/assets/minecraft/textures/entity/pig/pig.png", data: Buffer.concat([PNG, Buffer.from([9])]), method: 8 },
      { name: "pack/readme.txt", data: Buffer.from("hello"), method: 0 },
      { name: "pack/assets/minecraft/textures/block/note.txt", data: Buffer.from("nope"), method: 0 },
    ]);
    const entries = await readZip(zip, { include: () => true });
    assert.equal(entries.length, 6);
    const textures = texturesFromPackFiles(entries.map((entry) => ({ path: entry.name, bytes: entry.bytes })));
    const byKey = new Map(textures.map((texture) => [texture.key, texture.bytes]));
    assert.deepEqual([...byKey.keys()].sort(), ["block/grass_block_side.png", "block/stone.png", "entity/pig.png"]);
    assert.equal(byKey.get("entity/pig.png")?.at(-1), 9);
    assert.equal(byKey.get("block/stone.png")?.[0], 0x89);
  });

  it("keeps vanilla for every catalog texture the pack does not include", () => {
    const textures = texturesFromPackFiles([
      { path: "MyPack/assets/minecraft/textures/block/dirt.png", bytes: PNG },
      { path: "MyPack/assets/minecraft/textures/block/crafting_table_front.png", bytes: PNG },
      { path: "MyPack/assets/minecraft/textures/item/diamond_sword.png", bytes: PNG },
      { path: "MyPack/assets/minecraft/textures/item/apple.png", bytes: PNG },
      { path: "MyPack/assets/minecraft/textures/block/torch.png", bytes: PNG },
      { path: "MyPack/assets/minecraft/textures/entity/creeper/creeper.png", bytes: PNG },
      { path: "MyPack/assets/minecraft/textures/entity/slime/slime.png", bytes: PNG },
      { path: "MyPack/assets/minecraft/textures/misc/unknown.png", bytes: PNG },
    ]);
    const present = textures.map((texture) => texture.key).sort();
    assert.deepEqual(present, [
      "block/crafting_table_front.png",
      "block/dirt.png",
      "block/torch.png",
      "entity/creeper.png",
      "entity/slime.png",
      "item/apple.png",
      "item/diamond_sword.png",
    ]);
    const fallback = vanillaFallbackKeys(textures);
    for (const key of [
      "block/grass_block_side.png",
      "block/stone.png",
      "block/oak_log.png",
      "block/oak_planks.png",
      "block/sand.png",
      "block/tnt_side.png",
      "block/glass.png",
      "item/diamond_pickaxe.png",
      "entity/pig.png",
      "entity/chicken.png",
    ]) {
      assert.equal(fallback.includes(key), true);
      assert.equal(present.includes(key), false);
    }
  });

  it("rejects a file that is not a zip, an empty pack, and a pack over the size cap", async () => {
    await assert.rejects(
      () => readResourcePack({ name: "nope.zip", size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }),
      /err\.packBad/,
    );
    const empty = buildZip([{ name: "pack/readme.txt", data: Buffer.from("x"), method: 0 }]);
    await assert.rejects(
      () => readResourcePack({ name: "empty.mcpack", size: empty.byteLength, arrayBuffer: async () => empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength) }),
      /err\.packEmpty/,
    );
    await assert.rejects(
      () => readResourcePack({ name: "huge.zip", size: 256 * 1024 * 1024 + 1, arrayBuffer: async () => new ArrayBuffer(0) }),
      /err\.packBig/,
    );
  });

  it("keeps resource pack bytes out of the share payload", () => {
    const payload = toPayload(defaultScene("skin"), undefined, true);
    assert.equal("pack" in payload, false);
    assert.equal(JSON.stringify(payload).includes("resource"), false);
  });
});
