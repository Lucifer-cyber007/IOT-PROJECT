import { StatusBar } from "expo-status-bar";
import { useCallback, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import CaptureScreen from "./screens/CaptureScreen";
import ProcessingScreen from "./screens/ProcessingScreen";
import ResultsScreen from "./screens/ResultsScreen";
import { extractBill, type PickedFile } from "./lib/api";
import { EMPTY_RESULT, type ExtractionResult } from "./lib/types";

type Stage = "capture" | "processing" | "results";

interface Results {
  data: ExtractionResult;
  rawText?: string;
  notice?: string;
}

export default function App() {
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
        setResults({ data: outcome.data });
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
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
