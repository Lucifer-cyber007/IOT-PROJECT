import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import { addAsset, loadAssets, type Asset } from "../lib/assets";
import { getAssetClass, type AssetClassId } from "../lib/assetClasses";
import { colors, radius, spacing } from "../lib/theme";

interface AssetClassScreenProps {
  classId: AssetClassId;
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
}

export default function AssetClassScreen({
  classId,
  onBack,
  onSelectAsset,
}: AssetClassScreenProps) {
  const assetClass = useMemo(() => getAssetClass(classId), [classId]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    void loadAssets().then((all) => setAssets(all.filter((asset) => asset.classId === classId)));
  }, [classId]);

  useEffect(refresh, [refresh]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await addAsset(classId, name);
      setNewName("");
      refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <SafeButton style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </SafeButton>
        <Text style={styles.heading}>
          {assetClass.icon} {assetClass.label}
        </Text>
      </View>

      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <SafeButton
            style={styles.assetRow}
            contentStyle={styles.assetRowContent}
            onPress={() => onSelectAsset(item)}
          >
            <Text style={styles.assetName}>{item.name}</Text>
            <Text style={styles.assetChevron}>›</Text>
          </SafeButton>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No {assetClass.label.toLowerCase()} added yet.</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.addCard}>
            <Text style={styles.addLabel}>Add asset</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Server Room UPS"
              placeholderTextColor={colors.slate400}
              style={styles.addInput}
            />
            <SafeButton style={styles.addButton} onPress={handleAdd} disabled={saving}>
              <Text style={styles.addButtonText}>{saving ? "Adding…" : "Add"}</Text>
            </SafeButton>
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
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
  },
  assetRow: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    height: 56,
    marginBottom: spacing.md,
  },
  assetRowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  assetName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  assetChevron: {
    fontSize: 18,
    color: colors.slate400,
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.slate400,
  },
  addCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.slate500,
  },
  addInput: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  addButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
});
