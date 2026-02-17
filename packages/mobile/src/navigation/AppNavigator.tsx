/**
 * Bottom tab navigation for the Cloak wallet.
 */
import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Home, Send, Settings, Clock, ShieldAlert } from "lucide-react-native";
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

function HeaderTitle({ routeName }: { routeName?: string }) {
  let isWard = false;
  try {
    const wardCtx = useWardContext();
    isWard = wardCtx.isWard;
  } catch {
    // WardProvider not available yet
  }

  const isWardHome = isWard && routeName === "Home";

  return (
    <View style={styles.headerTitleRow}>
      <CloakIcon size={24} />
      <Text style={styles.headerBrand}>{isWardHome ? "Ward Account" : "Cloak"}</Text>
      {isWard && (
        <View style={styles.wardHeaderBadge}>
          <ShieldAlert size={12} color="#F59E0B" />
          <Text style={styles.wardHeaderBadgeText}>Ward</Text>
        </View>
      )}
    </View>
  );
}

export default function AppNavigator() {
  const wallet = useWallet();
  const ward = useWardContext();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 12 : 24);
  const [previewInitialRoute, setPreviewInitialRoute] = React.useState<keyof AppTabParamList>("Home");
  const [previewReady, setPreviewReady] = React.useState(!__DEV__);

  React.useEffect(() => {
    if (!__DEV__) return;
    let isMounted = true;
    AsyncStorage.getItem("cloak_preview_tab")
      .then((value) => {
        if (!isMounted) return;
        const allowed: Array<keyof AppTabParamList> = ["Home", "Send", "Wallet", "Activity", "Settings"];
        if (value && allowed.includes(value as keyof AppTabParamList)) {
          setPreviewInitialRoute(value as keyof AppTabParamList);
        } else {
          setPreviewInitialRoute("Home");
        }
      })
      .finally(() => {
        if (isMounted) setPreviewReady(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Gate: show deploy screen if wallet exists but is not deployed
  if (wallet.isWalletCreated && !wallet.isDeployed && !wallet.isLoading && !wallet.isCheckingDeployment) {
    return (
      <View style={styles.root}>
        <DeployScreen />
        <TestStateMarkers />
      </View>
    );
  }

  if (!previewReady) {
    return <View style={styles.root} />;
  }

  const initialRouteName =
    ward.isWard && previewInitialRoute === "Wallet" ? "Home" : previewInitialRoute;

  return (
    <View style={styles.root}>
      <Tab.Navigator
        initialRouteName={initialRouteName}
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0 },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600", fontFamily: typography.primarySemibold },
          headerTitleAlign: "center" as const,
          tabBarStyle: {
            ...styles.tabBar,
            paddingBottom: bottomPadding,
            height: 56 + bottomPadding,
          },
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
          options={{ headerTitle: () => <HeaderTitle routeName="Home" /> }}
        />
        <Tab.Screen
          name="Send"
          component={SendScreen}
          options={{ headerTitle: "Send Shielded" }}
        />
        {!ward.isWard && (
          <Tab.Screen
            name="Wallet"
            component={WalletScreen}
            options={{ headerTitle: "Wallet" }}
          />
        )}
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
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerShield: {},
  headerBrand: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  wardHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  wardHeaderBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#F59E0B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
