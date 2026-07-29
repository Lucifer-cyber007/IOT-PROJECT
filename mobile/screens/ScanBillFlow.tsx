import { useCallback, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import CaptureScreen from "./CaptureScreen";
import ProcessingScreen from "./ProcessingScreen";
import ResultsScreen from "./ResultsScreen";
import { extractBill, type PickedFile } from "../lib/api";
import { addAsset, loadAssets } from "../lib/assets";
import { FIELD_META } from "../lib/types";
import { addReading } from "../lib/readings";
import { EMPTY_RESULT, type ExtractionResult } from "../lib/types";

async function mainMeterAssetId(): Promise<string> {
  const assets = await loadAssets();
  const existing = assets.find((asset) => asset.classId === "energy_meter");
  if (existing) return existing.id;
  const created = await addAsset("energy_meter", "Main Meter");
  return created.id;
}

function toFieldRecord(result: ExtractionResult): Record<string, string | null> {
  return FIELD_META.reduce<Record<string, string | null>>((accumulator, field) => {
    accumulator[field.key] = result[field.key];
    return accumulator;
  }, {});
}

type Stage = "capture" | "processing" | "results";

interface Results {
  data: ExtractionResult;
  rawText?: string;
  notice?: string;
}

export default function ScanBillFlow() {
  const [stage, setStage] = useState<Stage>("capture");
  const [results, setResults] = useState<Results | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastFileRef = useRef<PickedFile | null>(null);

  const runExtraction = useCallback(async (file: PickedFile) => {
    lastFileRef.current = file;
    setStage("processing");
    setErrorMessage(null);

    try {
      const outcome = await extractBill(file);
      if (outcome.kind === "success") {
        setResults({ data: outcome.data, rawText: outcome.rawText });
        const assetId = await mainMeterAssetId();
        void addReading({
          assetId,
          classId: "energy_meter",
          captureMethod: "ocr",
          fields: toFieldRecord(outcome.data),
          confidenceFlags: outcome.data.confidence_flags,
          rawText: outcome.rawText,
        });
      } else {
        setResults({
          data: EMPTY_RESULT,
          rawText: outcome.rawText,
          notice: outcome.message,
        });
      }
      setStage("results");
    } catch (error) {
      // Stay on the processing screen, which renders its own error state.
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again."
      );
    }
  }, []);

  const startOver = () => {
    lastFileRef.current = null;
    setResults(null);
    setErrorMessage(null);
    setStage("capture");
  };

  const retry = () => {
    if (lastFileRef.current) {
      void runExtraction(lastFileRef.current);
    } else {
      startOver();
    }
  };

  return (
    <>
      <StatusBar style={stage === "capture" ? "light" : "dark"} />

      {stage === "capture" && <CaptureScreen onSubmit={runExtraction} />}

      {stage === "processing" && (
        <ProcessingScreen error={errorMessage} onRetry={retry} onStartOver={startOver} />
      )}

      {stage === "results" && results && (
        <ResultsScreen
          result={results.data}
          rawText={results.rawText}
          notice={results.notice}
          onStartOver={startOver}
        />
      )}
    </>
  );
}
