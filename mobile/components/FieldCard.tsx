import { StyleSheet, Text, TextInput, View } from "react-native";
import type { ConfidenceFlag } from "../lib/types";
import { colors, radius, spacing } from "../lib/theme";

interface FieldCardProps {
  label: string;
  value: string;
  placeholder: string;
  flag?: ConfidenceFlag;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  onChange: (next: string) => void;
}

export default function FieldCard({
  label,
  value,
  placeholder,
  flag,
  multiline,
  keyboardType,
  onChange,
}: FieldCardProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {flag && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>PLEASE VERIFY</Text>
          </View>
        )}
      </View>

      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.slate400}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          flag ? styles.inputFlagged : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: colors.slate500,
    textTransform: "uppercase",
  },
  badge: {
    backgroundColor: colors.amberSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.amberInk,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  inputFlagged: {
    borderColor: colors.amberBorder,
    backgroundColor: colors.amberTint,
  },
});
