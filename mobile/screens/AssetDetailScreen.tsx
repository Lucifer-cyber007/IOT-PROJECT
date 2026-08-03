import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import * as api from "../lib/api";
import type { Machine, Reading } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";
import ManualEntryScreen from "./ManualEntryScreen";

interface AssetDetailScreenProps {
  machine: Machine;
  onBack: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AssetDetailScreen({ machine, onBack }: AssetDetailScreenProps) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingReading, setAddingReading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getMyReadings(machine.id)
      .then(setReadings)
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load readings.");
      })
      .finally(() => setLoading(false));
  }, [machine.id]);

  useEffect(refresh, [refresh]);

  if (addingReading) {
    return (
      <ManualEntryScreen
        machine={machine}
        onDone={() => {
          setAddingReading(false);
          refresh();
        }}
        onCancel={() => setAddingReading(false)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <SafeButton style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </SafeButton>
        <Text style={styles.heading}>{machine.name}</Text>
        <Text style={styles.subheading}>{machine.template.name}</Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.ink} style={styles.spinner} />
      ) : (
        <FlatList
          data={readings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardDate}>
                {formatDateTime(item.captured_at)} ·{" "}
                {item.capture_method === "ocr" ? "Scanned" : "Manual"}
              </Text>
              {machine.template.fields.map((field) => (
                <View key={field.key} style={styles.cardRow}>
                  <Text style={styles.cardLabel}>{field.label}</Text>
                  <Text style={styles.cardValue}>{item.fields[field.key] ?? "—"}</Text>
                </View>
              ))}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No readings yet for this asset.</Text>
            </View>
          }
        />
      )}

      {machine.template.capture_methods.includes("manual") && (
        <View style={styles.footer}>
          <SafeButton style={styles.ctaButton} onPress={() => setAddingReading(true)}>
            <Text style={styles.ctaButtonText}>+ Add Reading</Text>
          </SafeButton>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.slate50,
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
  spinner: {
    marginTop: spacing.xl,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
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
  cardDate: {
    fontSize: 11,
    color: colors.slate400,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  empty: {
    alignItems: "center",
    paddingTop: spacing.xxl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.slate400,
  },
  footer: {
    padding: spacing.lg,
  },
  ctaButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  ctaButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
