import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import * as api from "../lib/api";
import type { AssetClass, Machine, MachineTemplate } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";
import BatchScanFlow from "./BatchScanFlow";

interface AssetClassScreenProps {
  assetClass: AssetClass;
  onBack: () => void;
  onSelectMachine: (machine: Machine) => void;
}

type ScreenView = "list" | "addAsset" | "batchScan";

export default function AssetClassScreen({
  assetClass,
  onBack,
  onSelectMachine,
}: AssetClassScreenProps) {
  const [view, setView] = useState<ScreenView>("list");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [templates, setTemplates] = useState<MachineTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newIdentifier, setNewIdentifier] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.getMyMachines(), api.getMachineTemplates(assetClass.id)])
      .then(([myMachines, myTemplates]) => {
        setMachines(myMachines.filter((m) => m.template.asset_class_id === assetClass.id));
        setTemplates(myTemplates);
        if (myTemplates.length === 1) setSelectedTemplateId(myTemplates[0].id);
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load machines.");
      })
      .finally(() => setLoading(false));
  }, [assetClass.id]);

  useEffect(refresh, [refresh]);

  const handleAdd = async () => {
    const name = newName.trim();
    const identifier = newIdentifier.trim();
    if (!selectedTemplateId || !name || !identifier) return;
    setSaving(true);
    setError(null);
    try {
      await api.createMachine(selectedTemplateId, name, identifier);
      setNewName("");
      setNewIdentifier("");
      setView("list");
      refresh();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not add that asset.");
    } finally {
      setSaving(false);
    }
  };

  if (view === "batchScan") {
    return (
      <BatchScanFlow
        assetClass={assetClass}
        onDone={() => {
          setView("list");
          refresh();
        }}
        onCancel={() => setView("list")}
      />
    );
  }

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

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.ink} style={styles.spinner} />
      ) : (
        <FlatList
          data={machines}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SafeButton
              style={styles.assetRow}
              contentStyle={styles.assetRowContent}
              onPress={() => onSelectMachine(item)}
            >
              <Text style={styles.assetName}>{item.name}</Text>
              <Text style={styles.assetChevron}>›</Text>
            </SafeButton>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No {assetClass.label.toLowerCase()} added yet.
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerActions}>
              {machines.length > 0 && (
                <SafeButton
                  style={styles.batchButton}
                  onPress={() => setView("batchScan")}
                >
                  <Text style={styles.batchButtonText}>Batch Scan</Text>
                </SafeButton>
              )}

              {view === "addAsset" ? (
                <View style={styles.addCard}>
                  <Text style={styles.addLabel}>Template</Text>
                  <View style={styles.templateList}>
                    {templates.map((template) => {
                      const isSelected = template.id === selectedTemplateId;
                      return (
                        <SafeButton
                          key={template.id}
                          style={[
                            styles.templateChip,
                            isSelected && styles.templateChipSelected,
                          ]}
                          contentStyle={styles.templateChipContent}
                          onPress={() => setSelectedTemplateId(template.id)}
                        >
                          <Text
                            style={[
                              styles.templateChipText,
                              isSelected && styles.templateChipTextSelected,
                            ]}
                          >
                            {template.name}
                          </Text>
                        </SafeButton>
                      );
                    })}
                  </View>

                  <Text style={styles.addLabel}>Name</Text>
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="e.g. Server Room UPS"
                    placeholderTextColor={colors.slate400}
                    style={styles.addInput}
                  />

                  <Text style={styles.addLabel}>Identifier (serial / account / meter no.)</Text>
                  <TextInput
                    value={newIdentifier}
                    onChangeText={setNewIdentifier}
                    placeholder="The number printed on this exact unit"
                    placeholderTextColor={colors.slate400}
                    style={styles.addInput}
                  />

                  <SafeButton
                    style={styles.addButton}
                    onPress={handleAdd}
                    disabled={saving || !selectedTemplateId || !newName.trim() || !newIdentifier.trim()}
                  >
                    <Text style={styles.addButtonText}>{saving ? "Adding…" : "Add"}</Text>
                  </SafeButton>
                  <SafeButton style={styles.cancelButton} onPress={() => setView("list")}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </SafeButton>
                </View>
              ) : (
                <SafeButton
                  style={styles.addAssetButton}
                  onPress={() => setView("addAsset")}
                  disabled={templates.length === 0}
                >
                  <Text style={styles.addAssetButtonText}>
                    {templates.length === 0 ? "No templates yet" : "+ Add Asset"}
                  </Text>
                </SafeButton>
              )}
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
  footerActions: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  batchButton: {
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: colors.amberBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  batchButtonText: {
    color: colors.amberInk,
    fontSize: 14,
    fontWeight: "700",
  },
  addAssetButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  addAssetButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  addCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  addLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.slate500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  templateList: {
    gap: spacing.sm,
  },
  templateChip: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    height: 48,
  },
  templateChipContent: {
    paddingHorizontal: spacing.md,
  },
  templateChipSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  templateChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  templateChipTextSelected: {
    color: colors.white,
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
    marginTop: spacing.sm,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.slate500,
    fontSize: 14,
    fontWeight: "600",
  },
});
