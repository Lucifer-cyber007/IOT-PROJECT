import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import TabBar, { type TabKey } from "./components/TabBar";
import { colors } from "./lib/theme";
import { useAuthSession } from "./lib/authStore";
import HistoryScreen from "./screens/HistoryScreen";
import HomeScreen from "./screens/HomeScreen";
import LoginScreen from "./screens/LoginScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ScanBillFlow from "./screens/ScanBillFlow";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const { session, login, logout } = useAuthSession();

  if (session === undefined) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (session === null) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <LoginScreen onLogin={login} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {activeTab !== "scan" && <StatusBar style="dark" />}
      <View style={styles.content}>
        {activeTab === "home" && <HomeScreen onScanBill={() => setActiveTab("scan")} />}
        {activeTab === "scan" && <ScanBillFlow />}
        {activeTab === "history" && <HistoryScreen />}
        {activeTab === "profile" && <ProfileScreen onLogout={logout} />}
      </View>
      <TabBar active={activeTab} onChange={setActiveTab} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.slate50,
  },
});
