import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FieldCard from "../components/FieldCard";
import SafeButton from "../components/SafeButton";
import * as api from "../lib/api";
import type { Machine } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";

interface ManualEntryScreenProps {
  machine: Machine;
  onDone: () => void;
  onCancel: () => void;
}

export default function ManualEntryScreen({ machine, onDone, onCancel }: ManualEntryScreenProps) {
  const { fields } = machine.template;
  const [values, setValues] = useState<Record<string, string>>(() =>
    fields.reduce<Record<string, string>>((accumulator, field) => {
      accumulator[field.key] = "";
      return accumulator;
    }, {})
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = fields.reduce<Record<string, string | null>>((accumulator, field) => {
        const value = values[field.key].trim();
        accumulator[field.key] = value === "" ? null : value;
        return accumulator;
      }, {});
      await api.createReading({
        machineId: machine.id,
        captureMethod: "manual",
        fields: payload,
      });
      onDone();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not save that reading.");
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
            {machine.template.name} · {machine.name}
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {fields.map((field) => (
            <FieldCard
              key={field.key}
              label={field.label}
              value={values[field.key]}
              placeholder={field.placeholder}
              keyboardType={field.keyboard_type}
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
