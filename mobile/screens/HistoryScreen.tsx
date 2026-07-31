import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as api from "../lib/api";
import type { Machine, Reading } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EntryCard({ reading, machine }: { reading: Reading; machine: Machine | undefined }) {
  const templateFields = machine?.template.fields.slice(0, 3) ?? [];
  return (
    <View style={styles.card}>
      <Text style={styles.cardDate}>
        {formatDateTime(reading.captured_at)} ·{" "}
        {reading.capture_method === "ocr" ? "Scanned" : "Manual"}
      </Text>
      <Text style={styles.cardName}>{machine ? machine.name : "Unknown asset"}</Text>
      {templateFields.map((field) => (
        <View key={field.key} style={styles.cardRow}>
          <Text style={styles.cardLabel}>{field.label}</Text>
          <Text style={styles.cardValue}>{reading.fields[field.key] ?? "—"}</Text>
        </View>
      ))}
    </View>
  );
}

export default function HistoryScreen() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.getMyReadings(), api.getMyMachines()])
      .then(([myReadings, myMachines]) => {
        setReadings(myReadings);
        setMachines(myMachines);
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load history.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Text style={styles.heading}>Scan History</Text>

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
            <EntryCard
              reading={item}
              machine={machines.find((machine) => machine.id === item.machine_id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No readings recorded yet.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
    paddingTop: spacing.sm,
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
  },
  cardName: {
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
  empty: {
    alignItems: "center",
    paddingTop: spacing.xxl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.slate400,
  },
});
