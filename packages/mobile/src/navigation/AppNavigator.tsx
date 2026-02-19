/**
 * Bottom tab navigation for the Cloak wallet.
 */
import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Home, Send, Settings, Clock } from "lucide-react-native";
import HomeScreen from "../screens/HomeScreen";
import SendScreen from "../screens/SendScreen";
import WalletScreen from "../screens/WalletScreen";
import ActivityScreen from "../screens/ActivityScreen";
import SettingsScreen from "../screens/SettingsScreen";
import DeployScreen from "../screens/DeployScreen";
import { CloakIcon } from "../components/CloakIcon";
import { useWallet } from "../lib/WalletContext";
import { useWardContext } from "../lib/wardContext";
import { colors, spacing, typography } from "../lib/theme";
import { testIDs } from "../testing/testIDs";
import TestStateMarkers from "../testing/TestStateMarkers";
import type { AppTabParamList } from "./types";

const Tab = createBottomTabNavigator<AppTabParamList>();

const TAB_ICONS: Record<string, React.FC<{ size: number; color: string }>> = {
  Home: ({ size, color }) => <Home size={size} color={color} />,
  Send: ({ size, color }) => <Send size={size} color={color} />,
  Wallet: ({ size, color }) => <CloakIcon size={size} color={color} />,
  Activity: ({ size, color }) => <Clock size={size} color={color} />,
  Settings: ({ size, color }) => <Settings size={size} color={color} />,
};

const TAB_TEST_IDS: Record<string, string> = {
  Home: testIDs.navigation.tabHome,
  Send: testIDs.navigation.tabSend,
  Wallet: testIDs.navigation.tabWallet,
  Activity: testIDs.navigation.tabActivity,
  Settings: testIDs.navigation.tabSettings,
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const color = focused ? colors.primary : colors.textMuted;
  const IconComponent = TAB_ICONS[label];
  if (IconComponent) {
    return <IconComponent size={22} color={color} />;
  }
  return <Text style={[styles.icon, focused && styles.iconActive]}>{"•"}</Text>;
}

function HeaderLeft() {
  return (
    <View style={styles.headerLeftGroup}>
      <CloakIcon size={24} />
      <Text style={styles.headerBrand}>Cloak</Text>
    </View>
  );
}

function HeaderRight() {
  let isWard = false;
  try {
    const wardCtx = useWardContext();
    isWard = wardCtx.isWard;
  } catch {
    // WardProvider not available yet
  }
  if (!isWard) return null;
  return (
    <View style={styles.headerWardBadge}>
      <Text style={styles.headerWardBadgeText}>Ward</Text>
    </View>
  );
}

export default function AppNavigator() {
  const wallet = useWallet();
  const ward = useWardContext();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 12 : 24);
  const initialRouteName: keyof AppTabParamList = "Home";

  // Gate: show deploy screen if wallet exists but is not deployed (or still checking)
  if (wallet.isWalletCreated && !wallet.isDeployed && !wallet.isLoading) {
    return (
      <View style={styles.root}>
        <DeployScreen />
        <TestStateMarkers />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Tab.Navigator
        id="tabs"
        initialRouteName={initialRouteName}
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0 },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600", fontFamily: typography.primarySemibold },
          headerTitleAlign: "center" as const,
          tabBarStyle: wallet.isWalletCreated
            ? {
                ...styles.tabBar,
                paddingBottom: bottomPadding,
                height: 56 + bottomPadding,
              }
            : { display: "none" as const },
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabel: ({ focused, color }) => (
            <Text style={[styles.tabLabel, { color, fontWeight: focused ? "600" : "500" }]}>
              {route.name}
            </Text>
          ),
          tabBarButtonTestID: TAB_TEST_IDS[route.name],
          tabBarAccessibilityLabel: TAB_TEST_IDS[route.name],
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name} focused={focused} />
          ),
        })}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerTitle: "",
            headerLeft: () => <HeaderLeft />,
            headerRight: () => <HeaderRight />,
          }}
        />
        <Tab.Screen
          name="Send"
          component={SendScreen}
          options={{ headerTitle: "Send Shielded" }}
        />
        <Tab.Screen
          name="Wallet"
          component={WalletScreen}
          options={{ headerTitle: "Wallet" }}
        />
        <Tab.Screen
          name="Activity"
          component={ActivityScreen}
          options={{ headerTitle: "Activity" }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerTitle: "Settings" }}
        />
      </Tab.Navigator>
      <TestStateMarkers />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: typography.primary,
  },
  icon: {
    fontSize: 20,
    color: colors.textMuted,
  },
  iconActive: {
    color: colors.primary,
  },
  headerLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  headerBrand: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  headerWardBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginRight: spacing.sm,
  },
  headerWardBadgeText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
});
