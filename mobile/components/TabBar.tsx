import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "./SafeButton";
import { colors, spacing } from "../lib/theme";

export type TabKey = "home" | "scan" | "history" | "profile";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "scan", label: "Scan Bill", icon: "⚡" },
  { key: "history", label: "History", icon: "☰" },
  { key: "profile", label: "Profile", icon: "☺" },
];

interface TabBarProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export default function TabBar({ active, onChange }: TabBarProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <SafeButton
              key={tab.key}
              style={styles.tab}
              contentStyle={styles.tabContent}
              onPress={() => onChange(tab.key)}
              accessibilityLabel={tab.label}
            >
              <Text style={[styles.icon, isActive && styles.iconActive]}>{tab.icon}</Text>
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            </SafeButton>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
  },
  bar: {
    flexDirection: "row",
    height: 60,
  },
  tab: {
    flex: 1,
    height: 60,
  },
  tabContent: {
    gap: 2,
  },
  icon: {
    fontSize: 18,
    color: colors.slate400,
  },
  iconActive: {
    color: colors.ink,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.slate400,
  },
  labelActive: {
    color: colors.ink,
  },
});
