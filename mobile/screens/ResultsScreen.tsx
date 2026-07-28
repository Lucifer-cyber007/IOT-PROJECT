import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FieldCard from "../components/FieldCard";
import { colors, radius, spacing } from "../lib/theme";
import { FIELD_META, type BillFieldKey, type ExtractionResult } from "../lib/types";

type FieldValues = Record<BillFieldKey, string>;

function toFieldValues(result: ExtractionResult): FieldValues {
  return FIELD_META.reduce((accumulator, field) => {
    accumulator[field.key] = result[field.key] ?? "";
    return accumulator;
  }, {} as FieldValues);
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

interface ResultsScreenProps {
  result: ExtractionResult;
  /** Raw OCR text, shown when the backend could not structure the fields. */
  rawText?: string;
  /** Explanatory banner shown above the fields (e.g. the manual-entry fallback). */
  notice?: string;
  onStartOver: () => void;
}

export default function ResultsScreen({
  result,
  rawText,
  notice,
  onStartOver,
}: ResultsScreenProps) {
  const [values, setValues] = useState<FieldValues>(() => toFieldValues(result));
  const [copied, setCopied] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  const flags = result.confidence_flags ?? {};
  const flaggedCount = Object.keys(flags).length;

  /** Current (possibly user-edited) values in the API's schema shape. */
  const payload = useMemo(() => {
    const fields = FIELD_META.reduce<Record<string, string | null>>((accumulator, field) => {
      const value = values[field.key].trim();
      accumulator[field.key] = value === "" ? null : value;
      return accumulator;
    }, {});
    return { ...fields, confidence_flags: flags };
  }, [values, flags]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCsv = async () => {
    try {
      const header = FIELD_META.map((field) => escapeCsv(field.label)).join(",");
      const row = FIELD_META.map((field) => escapeCsv(values[field.key].trim())).join(",");

      const slug = (values.rr_number || values.account_number || "bill")
        .replace(/[^a-zA-Z0-9-_]/g, "")
        .slice(0, 32);

      const file = new File(Paths.cache, `electricity-bill-${slug || "extract"}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(`${header}\n${row}\n`);

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Saved", `CSV written to:\n${file.uri}`);
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Share bill details",
        UTI: "public.comma-separated-values-text",
      });
    } catch (error) {
      Alert.alert(
        "Could not export",
        error instanceof Error ? error.message : "The CSV could not be created."
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
          {notice && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Extracted details</Text>
              {flaggedCount > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {flaggedCount} to verify
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.cardSubtitle}>
              Everything below is editable — correct anything the scan got wrong before saving.
            </Text>

            {FIELD_META.map((field) => (
              <FieldCard
                key={field.key}
                label={field.label}
                value={values[field.key]}
                placeholder={field.placeholder}
                flag={flags[field.key]}
                multiline={field.multiline}
                keyboardType={field.keyboardType}
                onChange={(next) =>
                  setValues((previous) => ({ ...previous, [field.key]: next }))
                }
              />
            ))}
          </View>

          {rawText ? (
            <View style={styles.card}>
              <Pressable
                style={styles.rawToggle}
                onPress={() => setShowRawText((previous) => !previous)}
              >
                <Text style={styles.rawToggleLabel}>Raw text read from the bill</Text>
                <Text style={styles.rawToggleAction}>{showRawText ? "Hide" : "Show"}</Text>
              </Pressable>
              {showRawText && (
                <ScrollView style={styles.rawBox} nestedScrollEnabled>
                  <Text style={styles.rawText}>{rawText}</Text>
                </ScrollView>
              )}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={handleCopy}>
              <Text style={styles.secondaryButtonText}>
                {copied ? "Copied!" : "Copy as JSON"}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleShareCsv}>
              <Text style={styles.secondaryButtonText}>Export CSV</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={onStartOver}>
              <Text style={styles.primaryButtonText}>Scan Another Bill</Text>
            </Pressable>
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
  notice: {
    backgroundColor: colors.amberTint,
    borderWidth: 1,
    borderColor: colors.amberBorder,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  noticeText: {
    color: colors.amberInk,
    fontSize: 14,
    lineHeight: 20,
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
