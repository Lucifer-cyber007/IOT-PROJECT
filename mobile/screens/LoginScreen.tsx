import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import * as api from "../lib/api";
import type { AuthSession } from "../lib/authStore";
import { colors, radius, spacing } from "../lib/theme";

interface LoginScreenProps {
  onLogin: (session: AuthSession) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.login(email.trim(), password);
      onLogin({ token: result.token, role: result.role, clientId: result.clientId });
    } catch (err) {
      setError(
        err instanceof api.ApiError ? err.message : "Could not log in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <View style={styles.brandCard}>
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoPlaceholderText}>LOGO</Text>
            </View>
            <Text style={styles.brandName}>WRV Energies</Text>
            <Text style={styles.tagline}>Energy Monitoring System</Text>
          </View>

          <Text style={styles.heading}>Sign in</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              placeholderTextColor={colors.slate400}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.slate400}
              secureTextEntry
              style={styles.input}
            />
          </View>

          <SafeButton style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Sign In</Text>
            )}
          </SafeButton>
        </View>
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
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  brandCard: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  logoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  logoPlaceholderText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  brandName: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "800",
  },
  tagline: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: spacing.xs,
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
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: colors.slate500,
    textTransform: "uppercase",
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
  submitButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
