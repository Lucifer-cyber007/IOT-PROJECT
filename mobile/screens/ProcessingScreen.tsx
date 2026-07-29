import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import { colors, radius, spacing } from "../lib/theme";

interface ProcessingScreenProps {
  /** When set, the run failed and this message explains why. */
  error?: string | null;
  onRetry: () => void;
  onStartOver: () => void;
}

export default function ProcessingScreen({
  error,
  onRetry,
  onStartOver,
}: ProcessingScreenProps) {
  if (error) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.card}>
          <Text style={styles.errorBadge}>!</Text>
          <Text style={styles.title}>We couldn&apos;t read that bill</Text>
          <Text style={styles.errorBody}>{error}</Text>

          <SafeButton style={styles.primaryButton} onPress={onRetry}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </SafeButton>
          <SafeButton style={styles.secondaryButton} onPress={onStartOver}>
            <Text style={styles.secondaryButtonText}>Start Over</Text>
          </SafeButton>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={styles.title}>Reading your bill…</Text>
        <Text style={styles.subtitle}>
          Scanning the text and pulling out the billing details.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.slate50,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.slate500,
    textAlign: "center",
    lineHeight: 20,
  },
  errorBadge: {
    width: 44,
    height: 44,
    lineHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.roseSoft,
    color: colors.roseInk,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    overflow: "hidden",
  },
  errorBody: {
    fontSize: 14,
    color: colors.slate500,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: colors.ink,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    width: "100%",
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
