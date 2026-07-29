import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import { loadAssets, type Asset } from "../lib/assets";
import { ASSET_CLASSES, type AssetClassId } from "../lib/assetClasses";
import { loadReadings, type Reading } from "../lib/readings";
import { useRegion } from "../lib/region";
import { colors, radius, spacing } from "../lib/theme";
import AssetClassScreen from "./AssetClassScreen";
import AssetDetailScreen from "./AssetDetailScreen";

interface HomeScreenProps {
  onScanBill: () => void;
}

type HomeView =
  | { kind: "overview" }
  | { kind: "class"; classId: AssetClassId }
  | { kind: "asset"; asset: Asset };

export default function HomeScreen({ onScanBill }: HomeScreenProps) {
  const [view, setView] = useState<HomeView>({ kind: "overview" });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);

  // Detected silently in the background for future region-based customization -
  // deliberately not surfaced in this screen yet.
  useRegion();

  const refresh = useCallback(() => {
    void loadAssets().then(setAssets);
    void loadReadings().then(setReadings);
  }, []);

  useEffect(refresh, [refresh, view]);

  if (view.kind === "class") {
    return (
      <AssetClassScreen
        classId={view.classId}
        onBack={() => setView({ kind: "overview" })}
        onSelectAsset={(asset) => setView({ kind: "asset", asset })}
      />
    );
  }

  if (view.kind === "asset") {
    return (
      <AssetDetailScreen
        asset={view.asset}
        onBack={() => setView({ kind: "class", classId: view.asset.classId })}
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

        <Text style={styles.sectionTitle}>Asset Classes</Text>
        <View style={styles.grid}>
          {ASSET_CLASSES.map((assetClass) => {
            const classAssets = assets.filter((asset) => asset.classId === assetClass.id);
            const classReadings = readings.filter((reading) => reading.classId === assetClass.id);
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
                  {classAssets.length} asset{classAssets.length === 1 ? "" : "s"} ·{" "}
                  {classReadings.length} reading{classReadings.length === 1 ? "" : "s"}
                </Text>
              </SafeButton>
            );
          })}
        </View>
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    marginTop: spacing.sm,
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
