import { useCallback, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import * as api from "../lib/api";
import type { PickedFile } from "../lib/api";
import type { Machine } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";
import CaptureScreen from "./CaptureScreen";
import ProcessingScreen from "./ProcessingScreen";
import ResultsScreen from "./ResultsScreen";

type Stage = "capture" | "processing" | "resolve" | "results";

const ENERGY_METER_CLASS_ID = "energy_meter";

interface MatchedResult {
  machine: Machine;
  fields: Record<string, string | null>;
  confidenceFlags: Record<string, string>;
  rawText: string;
}

export default function ScanBillFlow() {
  const [stage, setStage] = useState<Stage>("capture");
  const [result, setResult] = useState<MatchedResult | null>(null);
  const [candidates, setCandidates] = useState<Machine[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastFileRef = useRef<PickedFile | null>(null);

  const runScan = useCallback(async (file: PickedFile, machineId?: number) => {
    lastFileRef.current = file;
    setStage("processing");
    setErrorMessage(null);

    try {
      const outcome = await api.scanOne(file, { assetClassId: ENERGY_METER_CLASS_ID, machineId });
      if (outcome.status === "matched") {
        setResult({
          machine: outcome.machine,
          fields: outcome.fields,
          confidenceFlags: outcome.confidence_flags,
          rawText: outcome.raw_text,
        });
        setStage("results");
      } else {
        setCandidates(outcome.candidates);
        setStage("resolve");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof api.ApiError ? error.message : "Something went wrong. Please try again."
      );
    }
  }, []);

  const startOver = () => {
    lastFileRef.current = null;
    setResult(null);
    setCandidates([]);
    setErrorMessage(null);
    setStage("capture");
  };

  const retry = () => {
    if (lastFileRef.current) {
      void runScan(lastFileRef.current);
    } else {
      startOver();
    }
  };

  return (
    <>
      <StatusBar style={stage === "capture" ? "light" : "dark"} />

      {stage === "capture" && <CaptureScreen onSubmit={(file) => void runScan(file)} />}

      {stage === "processing" && (
        <ProcessingScreen error={errorMessage} onRetry={retry} onStartOver={startOver} />
      )}

      {stage === "resolve" && (
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.heading}>Which meter is this?</Text>
            <Text style={styles.subheading}>
              {candidates.length === 0
                ? "You don't have any Energy Meters set up yet. Add one from Home before scanning."
                : "We couldn't automatically tell which of your meters this bill belongs to. Pick one:"}
            </Text>

            {candidates.map((machine) => (
              <SafeButton
                key={machine.id}
                style={styles.candidateRow}
                contentStyle={styles.candidateRowContent}
                onPress={() => {
                  if (lastFileRef.current) void runScan(lastFileRef.current, machine.id);
                }}
              >
                <Text style={styles.candidateName}>{machine.name}</Text>
                <Text style={styles.candidateChevron}>›</Text>
              </SafeButton>
            ))}

            <SafeButton style={styles.secondaryButton} onPress={startOver}>
              <Text style={styles.secondaryButtonText}>Start Over</Text>
            </SafeButton>
          </ScrollView>
        </SafeAreaView>
      )}

      {stage === "results" && result && (
        <ResultsScreen
          machine={result.machine}
          fields={result.fields}
          confidenceFlags={result.confidenceFlags}
          rawText={result.rawText}
          onSaved={startOver}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
  },
  subheading: {
    fontSize: 14,
    color: colors.slate500,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  candidateRow: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    height: 56,
  },
  candidateRowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  candidateName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  candidateChevron: {
    fontSize: 18,
    color: colors.slate400,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.md,
  },
  secondaryButtonText: {
    color: colors.inkSoft,
    fontSize: 15,
    fontWeight: "600",
  },
});
