import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FieldCard from "../components/FieldCard";
import SafeButton from "../components/SafeButton";
import type { Asset } from "../lib/assets";
import { getAssetClass } from "../lib/assetClasses";
import { addReading } from "../lib/readings";
import { colors, radius, spacing } from "../lib/theme";

interface ManualEntryScreenProps {
  asset: Asset;
  onDone: () => void;
  onCancel: () => void;
}

export default function ManualEntryScreen({ asset, onDone, onCancel }: ManualEntryScreenProps) {
  const assetClass = useMemo(() => getAssetClass(asset.classId), [asset.classId]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    assetClass.fields.reduce<Record<string, string>>((accumulator, field) => {
      accumulator[field.key] = "";
      return accumulator;
    }, {})
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = assetClass.fields.reduce<Record<string, string | null>>(
        (accumulator, field) => {
          const value = values[field.key].trim();
          accumulator[field.key] = value === "" ? null : value;
          return accumulator;
        },
        {}
      );
      await addReading({
        assetId: asset.id,
        classId: asset.classId,
        captureMethod: "manual",
        fields,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>New Reading</Text>
          <Text style={styles.subheading}>
            {assetClass.label} · {asset.name}
          </Text>

          {assetClass.fields.map((field) => (
            <FieldCard
              key={field.key}
              label={field.label}
              value={values[field.key]}
              placeholder={field.placeholder}
              multiline={field.multiline}
              keyboardType={field.keyboardType}
              onChange={(next) => setValues((previous) => ({ ...previous, [field.key]: next }))}
            />
          ))}

          <SafeButton style={styles.primaryButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? "Saving…" : "Save Reading"}</Text>
          </SafeButton>
          <SafeButton style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </SafeButton>
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
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
  },
  subheading: {
    fontSize: 13,
    color: colors.slate500,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.ink,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
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
