import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import * as api from "../lib/api";
import { useRegion } from "../lib/region";
import type { AssetClass, Machine, Reading } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";
import AssetClassScreen from "./AssetClassScreen";
import AssetDetailScreen from "./AssetDetailScreen";

interface HomeScreenProps {
  onScanBill: () => void;
}

type HomeView =
  | { kind: "overview" }
  | { kind: "class"; classId: string }
  | { kind: "asset"; machine: Machine };

export default function HomeScreen({ onScanBill }: HomeScreenProps) {
  const [view, setView] = useState<HomeView>({ kind: "overview" });
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detected silently in the background for future region-based customization -
  // deliberately not surfaced in this screen yet.
  useRegion();

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.getAssetClasses(), api.getMyMachines(), api.getMyReadings()])
      .then(([classes, myMachines, myReadings]) => {
        setAssetClasses(classes);
        setMachines(myMachines);
        setReadings(myReadings);
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load your data.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh, view.kind]);

  if (view.kind === "class") {
    const assetClass = assetClasses.find((item) => item.id === view.classId);
    if (assetClass) {
      return (
        <AssetClassScreen
          assetClass={assetClass}
          onBack={() => setView({ kind: "overview" })}
          onSelectMachine={(machine) => setView({ kind: "asset", machine })}
        />
      );
    }
  }

  if (view.kind === "asset") {
    return (
      <AssetDetailScreen
        machine={view.machine}
        onBack={() => setView({ kind: "class", classId: view.machine.template.asset_class_id })}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandCard}>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoPlaceholderText}>LOGO</Text>
          </View>
          <Text style={styles.brandName}>WRV Energies</Text>
          <Text style={styles.tagline}>Energy Monitoring System</Text>
        </View>

        <SafeButton style={styles.ctaButton} onPress={onScanBill}>
          <Text style={styles.ctaButtonText}>Scan a Bill</Text>
        </SafeButton>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Asset Classes</Text>

        {loading && assetClasses.length === 0 ? (
          <ActivityIndicator color={colors.ink} style={styles.spinner} />
        ) : (
          <View style={styles.grid}>
            {assetClasses.map((assetClass) => {
              const classMachines = machines.filter(
                (machine) => machine.template.asset_class_id === assetClass.id
              );
              const classReadings = readings.filter((reading) =>
                classMachines.some((machine) => machine.id === reading.machine_id)
              );
              return (
                <SafeButton
                  key={assetClass.id}
                  style={styles.classCard}
                  contentStyle={styles.classCardContent}
                  onPress={() => setView({ kind: "class", classId: assetClass.id })}
                >
                  <Text style={styles.classIcon}>{assetClass.icon}</Text>
                  <Text style={styles.classLabel}>{assetClass.label}</Text>
                  <Text style={styles.classMeta}>
                    {classMachines.length} asset{classMachines.length === 1 ? "" : "s"} ·{" "}
                    {classReadings.length} reading{classReadings.length === 1 ? "" : "s"}
                  </Text>
                </SafeButton>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  brandCard: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  logoPlaceholderText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  brandName: {
    color: colors.white,
    fontSize: 22,
    fontWeight: "800",
  },
  tagline: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    marginTop: spacing.sm,
  },
  spinner: {
    marginTop: spacing.xl,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  classCard: {
    width: "47%",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    height: 104,
  },
  classCardContent: {
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  classIcon: {
    fontSize: 20,
  },
  classLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  classMeta: {
    fontSize: 11,
    color: colors.slate500,
  },
});
