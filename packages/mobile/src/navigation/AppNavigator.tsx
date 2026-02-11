/**
 * Bottom tab navigation for the Cloak wallet.
 */
import React from "react";
import { Text, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HomeScreen from "../screens/HomeScreen";
import SendScreen from "../screens/SendScreen";
import WalletScreen from "../screens/WalletScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { colors, fontSize } from "../lib/theme";

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: "⬡",
    Send: "↑",
    Wallet: "🛡️",
    Settings: "⚙️",
  };
  return (
    <Text style={[styles.icon, focused && styles.iconActive]}>
      {icons[label] || "•"}
    </Text>
  );
}

export default function AppNavigator() {
  const insets = useSafeAreaInsets();
  // Ensure at least 8px bottom padding, use safe area inset on devices with gesture nav
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 0);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0 },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600" },
          tabBarStyle: {
            ...styles.tabBar,
            paddingBottom: bottomPadding + 6,
            height: 60 + bottomPadding,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name} focused={focused} />
          ),
        })}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerTitle: "Cloak" }}
        />
        <Tab.Screen
          name="Send"
          component={SendScreen}
          options={{ headerTitle: "Send Payment" }}
        />
        <Tab.Screen
          name="Wallet"
          component={WalletScreen}
          options={{ headerTitle: "Wallet" }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerTitle: "Settings" }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderLight,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: "500",
  },
  icon: {
    fontSize: 20,
    color: colors.textMuted,
  },
  iconActive: {
    color: colors.primary,
  },
});
