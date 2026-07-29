import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import { clearReadings } from "../lib/readings";
import { colors, radius, spacing } from "../lib/theme";

export default function ProfileScreen() {
  const [clearing, setClearing] = useState(false);

  const handleClearHistory = () => {
    Alert.alert(
      "Clear scan history?",
      "This removes every previously scanned bill from this device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            try {
              await clearReadings();
              Alert.alert("Done", "Scan history cleared.");
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Text style={styles.heading}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>App</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Name</Text>
          <Text style={styles.rowValue}>WRV Energies</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>1.0.0</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Data</Text>
        <SafeButton style={styles.dangerButton} onPress={handleClearHistory} disabled={clearing}>
          <Text style={styles.dangerButtonText}>
            {clearing ? "Clearing..." : "Clear Scan History"}
          </Text>
        </SafeButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.slate50,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.slate500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 14,
    color: colors.slate500,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  dangerButtonText: {
    color: colors.rose,
    fontSize: 14,
    fontWeight: "700",
  },
});
