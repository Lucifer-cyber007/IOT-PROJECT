import { File, Paths } from "expo-file-system";
import type { AssetClassId } from "./assetClasses";

export interface Asset {
  id: string;
  classId: AssetClassId;
  name: string;
  createdAt: string;
}

function assetsFile(): File {
  return new File(Paths.document, "assets.json");
}

export async function loadAssets(): Promise<Asset[]> {
  try {
    const file = assetsFile();
    if (!file.exists) return [];
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAssets(assets: Asset[]): Promise<void> {
  const file = assetsFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(assets));
}

export async function addAsset(classId: AssetClassId, name: string): Promise<Asset> {
  const assets = await loadAssets();
  const asset: Asset = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    classId,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  await saveAssets([asset, ...assets]);
  return asset;
}

export async function deleteAsset(id: string): Promise<void> {
  const assets = await loadAssets();
  await saveAssets(assets.filter((asset) => asset.id !== id));
}
