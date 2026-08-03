import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FieldCard from "../components/FieldCard";
import SafeButton from "../components/SafeButton";
import * as api from "../lib/api";
import type { Machine } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

interface ResultsScreenProps {
  machine: Machine;
  fields: Record<string, string | null>;
  confidenceFlags: Record<string, string>;
  /** Raw OCR text, kept around for the "show raw text" diagnostic toggle. */
  rawText?: string;
  onSaved: () => void;
}

export default function ResultsScreen({
  machine,
  fields,
  confidenceFlags,
  rawText,
  onSaved,
}: ResultsScreenProps) {
  const templateFields = machine.template.fields;
  const [values, setValues] = useState<Record<string, string>>(() =>
    templateFields.reduce<Record<string, string>>((accumulator, field) => {
      accumulator[field.key] = fields[field.key] ?? "";
      return accumulator;
    }, {})
  );
  const [copied, setCopied] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flaggedCount = Object.keys(confidenceFlags).length;

  const payload = useMemo(() => {
    const result: Record<string, string | null> = {};
    for (const field of templateFields) {
      const value = values[field.key].trim();
      result[field.key] = value === "" ? null : value;
    }
    return result;
  }, [values, templateFields]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.createReading({
        machineId: machine.id,
        captureMethod: "ocr",
        fields: payload,
        confidenceFlags,
        rawText,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not save that reading.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCsv = async () => {
    try {
      const header = templateFields.map((field) => escapeCsv(field.label)).join(",");
      const row = templateFields.map((field) => escapeCsv(values[field.key].trim())).join(",");
      const slug = machine.name.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 32);

      const file = new File(Paths.cache, `reading-${slug || "export"}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(`${header}\n${row}\n`);

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Saved", `CSV written to:\n${file.uri}`);
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Share reading",
        UTI: "public.comma-separated-values-text",
      });
    } catch (err) {
      Alert.alert(
        "Could not export",
        err instanceof Error ? err.message : "The CSV could not be created."
      );
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{machine.name}</Text>
              {flaggedCount > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{flaggedCount} to verify</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardSubtitle}>
              {machine.template.name} — everything below is editable, correct anything the scan
              got wrong before saving.
            </Text>

            {templateFields.map((field) => (
              <FieldCard
                key={field.key}
                label={field.label}
                value={values[field.key]}
                placeholder={field.placeholder}
                flag={confidenceFlags[field.key] as "low_confidence" | "not_found" | undefined}
                keyboardType={field.keyboard_type}
                onChange={(next) =>
                  setValues((previous) => ({ ...previous, [field.key]: next }))
                }
              />
            ))}
          </View>

          {rawText ? (
            <View style={styles.card}>
              <SafeButton
                style={styles.rawToggle}
                onPress={() => setShowRawText((previous) => !previous)}
              >
                <Text style={styles.rawToggleLabel}>Raw text read from the document</Text>
                <Text style={styles.rawToggleAction}>{showRawText ? "Hide" : "Show"}</Text>
              </SafeButton>
              {showRawText && (
                <ScrollView style={styles.rawBox} nestedScrollEnabled>
                  <Text style={styles.rawText}>{rawText}</Text>
                </ScrollView>
              )}
            </View>
          ) : null}

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <SafeButton style={styles.secondaryButton} onPress={handleCopy}>
              <Text style={styles.secondaryButtonText}>{copied ? "Copied!" : "Copy as JSON"}</Text>
            </SafeButton>
            <SafeButton style={styles.secondaryButton} onPress={handleShareCsv}>
              <Text style={styles.secondaryButtonText}>Export CSV</Text>
            </SafeButton>
            <SafeButton style={styles.primaryButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? "Saving…" : "Save Reading"}</Text>
            </SafeButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.xl,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  countBadge: {
    backgroundColor: colors.amberSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.amberInk,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.slate500,
    lineHeight: 18,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  rawToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rawToggleLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  rawToggleAction: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.slate500,
  },
  rawBox: {
    maxHeight: 240,
    backgroundColor: colors.slate100,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  rawText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  errorBox: {
    backgroundColor: colors.roseSoft,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.roseInk,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.ink,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.inkSoft,
    fontSize: 15,
    fontWeight: "600",
  },
});
