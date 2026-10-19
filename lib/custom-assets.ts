import type { CustomAsset } from "./custom-import.ts";

const assets = new Map<string, CustomAsset>();

export function customAsset(id: string): CustomAsset | null {
  return assets.get(id) ?? null;
}

export function customAssets(): CustomAsset[] {
  return [...assets.values()];
}

export function setCustomAssets(list: CustomAsset[]) {
  assets.clear();
  for (const asset of list) assets.set(asset.id, asset);
}
