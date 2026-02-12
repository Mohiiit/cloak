/**
 * Bottom tab navigation for the Cloak wallet.
 */
import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Send, Settings } from "lucide-react-native";
import HomeScreen from "../screens/HomeScreen";
import SendScreen from "../screens/SendScreen";
import WalletScreen from "../screens/WalletScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { CloakIcon } from "../components/CloakIcon";
import { colors, fontSize, spacing } from "../lib/theme";

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, React.FC<{ size: number; color: string }>> = {
  Home: ({ size, color }) => <Home size={size} color={color} />,
  Send: ({ size, color }) => <Send size={size} color={color} />,
  Wallet: ({ size, color }) => <CloakIcon size={size} color={color} />,
  Settings: ({ size, color }) => <Settings size={size} color={color} />,
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const color = focused ? colors.primary : colors.textMuted;
  const IconComponent = TAB_ICONS[label];
  if (IconComponent) {
    return <IconComponent size={22} color={color} />;
  }
  return <Text style={[styles.icon, focused && styles.iconActive]}>{"•"}</Text>;
}

function HeaderTitle() {
  return (
    <View style={styles.headerTitleRow}>
      <CloakIcon size={24} />
      <Text style={styles.headerBrand}>Cloak</Text>
    </View>
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
          headerTitleAlign: "center" as const,
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
          options={{ headerTitle: () => <HeaderTitle /> }}
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
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerShield: {},
  headerBrand: {
    fontSize: fontSize.lg,
    fontWeight: "bold",
    color: colors.text,
  },
});
