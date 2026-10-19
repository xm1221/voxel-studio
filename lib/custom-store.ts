import type { CustomAsset } from "./custom-import.ts";

const DB_NAME = "pixelstage.custom.v1";
const STORE = "assets";
const KEY = "all";

/** This browser only. Share links keep the id and leave the bytes behind. */
export async function storeCustomAssets(assets: CustomAsset[]) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(assets, KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadStoredCustomAssets(): Promise<CustomAsset[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => {
      db.close();
      const value = request.result;
      resolve(Array.isArray(value) ? (value as CustomAsset[]) : []);
    };
    request.onerror = () => {
      db.close();
      resolve([]);
    };
  });
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
