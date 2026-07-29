import { File, Paths } from "expo-file-system";
import type { AssetClassId, CaptureMethod } from "./assetClasses";
import type { ConfidenceFlag } from "./types";

export interface Reading {
  id: string;
  assetId: string;
  classId: AssetClassId;
  capturedAt: string;
  captureMethod: CaptureMethod;
  fields: Record<string, string | null>;
  confidenceFlags?: Record<string, ConfidenceFlag>;
  rawText?: string;
}

export type NewReading = Omit<Reading, "id" | "capturedAt">;

const MAX_ENTRIES = 200;

function readingsFile(): File {
  return new File(Paths.document, "readings.json");
}

export async function loadReadings(): Promise<Reading[]> {
  try {
    const file = readingsFile();
    if (!file.exists) return [];
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addReading(reading: NewReading): Promise<Reading[]> {
  const readings = await loadReadings();
  const entry: Reading = {
    ...reading,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capturedAt: new Date().toISOString(),
  };
  const next = [entry, ...readings].slice(0, MAX_ENTRIES);

  const file = readingsFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(next));

  return next;
}

export async function clearReadings(): Promise<void> {
  const file = readingsFile();
  if (file.exists) file.delete();
}

export async function readingsForAsset(assetId: string): Promise<Reading[]> {
  const readings = await loadReadings();
  return readings.filter((reading) => reading.assetId === assetId);
}
