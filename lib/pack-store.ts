import type { PackTexture, PropTextureKey } from "./resource-pack.ts";

const DB_NAME = "pixelstage.pack.v1";
const STORE = "pack";
const KEY = "current";

type Stored = { name: string; textures: Array<{ key: PropTextureKey; bytes: ArrayBuffer }> };

/** This browser only. Share links never include these bytes. */
export async function storePropTexturePack(name: string, textures: PackTexture[]) {
  const db = await openDb();
  if (!db) return;
  const record: Stored = {
    name,
    textures: textures.map((texture) => ({
      key: texture.key,
      bytes: texture.bytes.buffer.slice(texture.bytes.byteOffset, texture.bytes.byteOffset + texture.bytes.byteLength) as ArrayBuffer,
    })),
  };
  await write(db, record);
}

export async function loadStoredPropTexturePack(): Promise<{ name: string; textures: PackTexture[] } | null> {
  const db = await openDb();
  if (!db) return null;
  const record = await read(db);
  if (!record?.textures?.length) return null;
  return {
    name: record.name,
    textures: record.textures.map((texture) => ({ key: texture.key, bytes: new Uint8Array(texture.bytes) })),
  };
}

export async function clearStoredPropTexturePack() {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function write(db: IDBDatabase, record: Stored) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record, KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

function read(db: IDBDatabase) {
  return new Promise<Stored | null>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => {
      db.close();
      resolve((request.result as Stored | undefined) ?? null);
    };
    request.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}
