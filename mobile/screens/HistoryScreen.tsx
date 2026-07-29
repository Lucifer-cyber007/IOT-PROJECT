import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadAssets, type Asset } from "../lib/assets";
import { getAssetClass } from "../lib/assetClasses";
import { loadReadings, type Reading } from "../lib/readings";
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

function EntryCard({ reading, asset }: { reading: Reading; asset: Asset | undefined }) {
  const assetClass = getAssetClass(reading.classId);
  const primaryFields = assetClass.fields.slice(0, 3);
  return (
    <View style={styles.card}>
      <Text style={styles.cardDate}>
        {formatDateTime(reading.capturedAt)} · {reading.captureMethod === "ocr" ? "Scanned" : "Manual"}
      </Text>
      <Text style={styles.cardName}>
        {assetClass.icon} {asset?.name ?? "Unknown asset"} — {assetClass.label}
      </Text>
      {primaryFields.map((field) => (
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
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    let mounted = true;
    loadReadings().then((data) => {
      if (mounted) setReadings(data);
    });
    loadAssets().then((data) => {
      if (mounted) setAssets(data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Text style={styles.heading}>Scan History</Text>
      <FlatList
        data={readings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <EntryCard reading={item} asset={assets.find((asset) => asset.id === item.assetId)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No readings recorded yet.</Text>
          </View>
        }
      />
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
