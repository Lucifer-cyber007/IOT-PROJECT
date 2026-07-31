import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import * as api from "../lib/api";
import { MAX_BATCH_FILES, type PickedFile } from "../lib/api";
import type { AssetClass, Machine } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";

interface BatchScanFlowProps {
  assetClass: AssetClass;
  onDone: () => void;
  onCancel: () => void;
}

type Stage = "pick" | "processing" | "review";

interface ReviewItem {
  index: number;
  filename: string;
  status: "matched" | "ambiguous" | "no_match" | "error" | "saved";
  machine?: Machine;
  fields?: Record<string, string | null>;
  confidenceFlags?: Record<string, string>;
  rawText?: string;
  candidates?: Machine[];
  error?: string;
  resolving?: boolean;
  saving?: boolean;
}

const STATUS_LABEL: Record<ReviewItem["status"], string> = {
  matched: "Matched",
  ambiguous: "Multiple matches",
  no_match: "No match",
  error: "Failed",
  saved: "Saved",
};

export default function BatchScanFlow({ assetClass, onDone, onCancel }: BatchScanFlowProps) {
  const [stage, setStage] = useState<Stage>("pick");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (picked: PickedFile[]) => {
    setFiles((previous) => [...previous, ...picked].slice(0, MAX_BATCH_FILES));
  };

  const pickPhotos = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: MAX_BATCH_FILES,
      });
      if (result.canceled || !result.assets?.length) return;
      addFiles(
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? api.fileNameFrom(asset.uri, "bill.jpg"),
          mimeType: api.guessMimeType(asset.uri, asset.mimeType),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo library could not be opened.");
    }
  };

  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      addFiles(
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name ?? api.fileNameFrom(asset.uri, "bill.pdf"),
          mimeType: api.guessMimeType(asset.name ?? asset.uri, asset.mimeType),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file picker could not be opened.");
    }
  };

  const removeFile = (index: number) => {
    setFiles((previous) => previous.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (files.length === 0) return;
    setStage("processing");
    setError(null);
    try {
      const result = await api.scanBatch(files, { assetClassId: assetClass.id });
      setItems(
        result.results.map((r) => ({
          index: r.index,
          filename: r.filename,
          status: r.status,
          machine: r.machine,
          fields: r.fields,
          confidenceFlags: r.confidence_flags,
          rawText: r.raw_text,
          candidates: r.candidates,
          error: r.error,
        }))
      );
      setStage("review");
    } catch (err) {
      setError(
        err instanceof api.ApiError ? err.message : "Batch scan failed. Please try again."
      );
      setStage("pick");
    }
  };

  const updateItem = (index: number, patch: Partial<ReviewItem>) => {
    setItems((previous) =>
      previous.map((item) => (item.index === index ? { ...item, ...patch } : item))
    );
  };

  const resolveItem = async (item: ReviewItem, machine: Machine) => {
    const file = files[item.index];
    if (!file) return;
    updateItem(item.index, { resolving: true });
    try {
      const outcome = await api.scanOne(file, { machineId: machine.id });
      if (outcome.status === "matched") {
        updateItem(item.index, {
          status: "matched",
          machine: outcome.machine,
          fields: outcome.fields,
          confidenceFlags: outcome.confidence_flags,
          rawText: outcome.raw_text,
          resolving: false,
        });
      } else {
        updateItem(item.index, {
          status: "error",
          error: "Could not extract fields for that machine.",
          resolving: false,
        });
      }
    } catch (err) {
      updateItem(item.index, {
        status: "error",
        error: err instanceof api.ApiError ? err.message : "Failed to resolve machine.",
        resolving: false,
      });
    }
  };

  const saveItem = async (item: ReviewItem) => {
    if (!item.machine || !item.fields) return;
    updateItem(item.index, { saving: true });
    try {
      await api.createReading({
        machineId: item.machine.id,
        captureMethod: "ocr",
        fields: item.fields,
        confidenceFlags: item.confidenceFlags,
        rawText: item.rawText,
      });
      updateItem(item.index, { status: "saved", saving: false });
    } catch (err) {
      updateItem(item.index, {
        status: "error",
        error: err instanceof api.ApiError ? err.message : "Could not save that reading.",
        saving: false,
      });
    }
  };

  const saveAllMatched = async () => {
    for (const item of items) {
      if (item.status === "matched") await saveItem(item);
    }
  };

  if (stage === "processing") {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.ink} />
          <Text style={styles.processingTitle}>Scanning {files.length} files…</Text>
          <Text style={styles.processingSubtitle}>
            This can take a little while for larger batches.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === "review") {
    const matchedCount = items.filter((i) => i.status === "matched").length;
    const savedCount = items.filter((i) => i.status === "saved").length;
    const unresolvedCount = items.filter(
      (i) => i.status === "ambiguous" || i.status === "no_match"
    ).length;
    const failedCount = items.filter((i) => i.status === "error").length;

    return (
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.heading}>Batch Results</Text>
          <Text style={styles.subheading}>
            {matchedCount} matched · {savedCount} saved · {unresolvedCount} need a machine ·{" "}
            {failedCount} failed
          </Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => String(item.index)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <BatchItemCard item={item} onResolve={resolveItem} onSave={saveItem} />
          )}
          ListFooterComponent={
            <View style={styles.footerActions}>
              {matchedCount > 0 && (
                <SafeButton style={styles.primaryButton} onPress={saveAllMatched}>
                  <Text style={styles.primaryButtonText}>Save All Matched</Text>
                </SafeButton>
              )}
              <SafeButton style={styles.secondaryButton} onPress={onDone}>
                <Text style={styles.secondaryButtonText}>Done</Text>
              </SafeButton>
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <SafeButton style={styles.backButton} onPress={onCancel}>
          <Text style={styles.backButtonText}>‹ Cancel</Text>
        </SafeButton>
        <Text style={styles.heading}>Batch Scan</Text>
        <Text style={styles.subheading}>
          {assetClass.label} · up to {MAX_BATCH_FILES} files at once
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={files}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <View style={styles.fileRow}>
            <Text style={styles.fileName} numberOfLines={1}>
              {item.name}
            </Text>
            <SafeButton style={styles.removeButton} onPress={() => removeFile(index)}>
              <Text style={styles.removeButtonText}>Remove</Text>
            </SafeButton>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No files picked yet.</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footerActions}>
            <SafeButton
              style={styles.pickButton}
              onPress={pickPhotos}
              disabled={files.length >= MAX_BATCH_FILES}
            >
              <Text style={styles.pickButtonText}>Pick Photos</Text>
            </SafeButton>
            <SafeButton
              style={styles.pickButton}
              onPress={pickDocuments}
              disabled={files.length >= MAX_BATCH_FILES}
            >
              <Text style={styles.pickButtonText}>Pick Files</Text>
            </SafeButton>
            <SafeButton
              style={styles.primaryButton}
              onPress={submit}
              disabled={files.length === 0}
            >
              <Text style={styles.primaryButtonText}>
                Scan {files.length} File{files.length === 1 ? "" : "s"}
              </Text>
            </SafeButton>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function BatchItemCard({
  item,
  onResolve,
  onSave,
}: {
  item: ReviewItem;
  onResolve: (item: ReviewItem, machine: Machine) => void;
  onSave: (item: ReviewItem) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardFilename} numberOfLines={1}>
          {item.filename}
        </Text>
        <View style={[styles.statusBadge, statusBadgeStyle(item.status)]}>
          <Text style={[styles.statusBadgeText, statusBadgeTextStyle(item.status)]}>
            {STATUS_LABEL[item.status]}
          </Text>
        </View>
      </View>

      {item.machine && <Text style={styles.cardMachine}>{item.machine.name}</Text>}

      {(item.status === "matched" || item.status === "saved") && item.fields && item.machine && (
        <>
          {item.machine.template.fields.map((field) => (
            <View key={field.key} style={styles.cardRow}>
              <Text style={styles.cardLabel}>{field.label}</Text>
              <Text style={styles.cardValue}>{item.fields?.[field.key] ?? "—"}</Text>
            </View>
          ))}
          {item.status === "matched" && (
            <SafeButton
              style={styles.saveButton}
              onPress={() => onSave(item)}
              disabled={item.saving}
            >
              <Text style={styles.saveButtonText}>{item.saving ? "Saving…" : "Save"}</Text>
            </SafeButton>
          )}
        </>
      )}

      {(item.status === "ambiguous" || item.status === "no_match") && (
        <>
          <Text style={styles.cardHint}>
            {item.status === "ambiguous"
              ? "Matched more than one machine - pick the right one:"
              : "Couldn't tell which machine this belongs to - pick one:"}
          </Text>
          {item.candidates?.map((machine) => (
            <SafeButton
              key={machine.id}
              style={styles.candidateButton}
              onPress={() => onResolve(item, machine)}
              disabled={item.resolving}
            >
              <Text style={styles.candidateButtonText}>
                {item.resolving ? "Checking…" : machine.name}
              </Text>
            </SafeButton>
          ))}
        </>
      )}

      {item.status === "error" && item.error && <Text style={styles.cardError}>{item.error}</Text>}
    </View>
  );
}

function statusBadgeStyle(status: ReviewItem["status"]) {
  switch (status) {
    case "matched":
      return { backgroundColor: colors.amberSoft };
    case "saved":
      return { backgroundColor: "#dcfce7" };
    case "error":
      return { backgroundColor: colors.roseSoft };
    default:
      return { backgroundColor: colors.slate100 };
  }
}

function statusBadgeTextStyle(status: ReviewItem["status"]) {
  switch (status) {
    case "matched":
      return { color: colors.amberInk };
    case "saved":
      return { color: "#166534" };
    case "error":
      return { color: colors.roseInk };
    default:
      return { color: colors.slate500 };
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  processingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    marginTop: spacing.sm,
  },
  processingSubtitle: {
    fontSize: 13,
    color: colors.slate500,
    textAlign: "center",
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  backButton: {
    alignSelf: "flex-start",
    width: 80,
    height: 32,
    justifyContent: "center",
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.slate500,
  },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
  },
  subheading: {
    fontSize: 13,
    color: colors.slate500,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.roseSoft,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.roseInk,
    fontSize: 13,
    lineHeight: 18,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
  },
  removeButton: {
    width: 80,
    height: 32,
    justifyContent: "center",
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.rose,
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.slate400,
  },
  footerActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pickButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  pickButtonText: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.inkSoft,
    fontSize: 15,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardFilename: {
    flex: 1,
    fontSize: 13,
    color: colors.slate500,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  cardMachine: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardLabel: {
    fontSize: 13,
    color: colors.slate500,
  },
  cardValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  cardHint: {
    fontSize: 13,
    color: colors.slate500,
    marginBottom: spacing.xs,
  },
  candidateButton: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  candidateButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  cardError: {
    fontSize: 13,
    color: colors.roseInk,
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
});
