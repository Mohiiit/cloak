/**
 * Bottom tab navigation for the Cloak wallet.
 */
import React, { useRef } from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { createBottomTabNavigator, type BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Clock, Shield, ScanLine, Bot, Settings as SettingsIcon } from "lucide-react-native";
import HomeScreen from "../screens/HomeScreen";
import AgentScreen from "../screens/AgentScreen";
import ActivityScreen from "../screens/ActivityScreen";
import SettingsScreen from "../screens/SettingsScreen";
import DeployScreen from "../screens/DeployScreen";
import { CloakIcon } from "../components/CloakIcon";
import { useWallet } from "../lib/WalletContext";
import { useWardContext } from "../lib/wardContext";
import { emitAgentTabVoiceEvent } from "../lib/agentVoiceEvents";
import { colors, spacing, typography } from "../lib/theme";
import { testIDs } from "../testing/testIDs";
import TestStateMarkers from "../testing/TestStateMarkers";
import type { AppTabParamList } from "./types";

const Tab = createBottomTabNavigator<AppTabParamList>();
const AGENT_HOLD_TO_RECORD_MS = 3000;

const TAB_ICONS: Record<string, React.FC<{ size: number; color: string }>> = {
  Home: ({ size, color }) => <Home size={size} color={color} />,
  Agent: ({ size, color }) => <Bot size={size} color={color} />,
  Activity: ({ size, color }) => <Clock size={size} color={color} />,
  Settings: ({ size, color }) => <SettingsIcon size={size} color={color} />,
};

const TAB_TEST_IDS: Record<string, string> = {
  Home: testIDs.navigation.tabHome,
  Agent: testIDs.navigation.tabAgent,
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

function HeaderLogoButton() {
  return (
    <View style={styles.headerLeftGroup}>
      <CloakIcon size={24} />
      <Text style={styles.headerBrand}>Cloak</Text>
    </View>
  );
}

function HeaderWardBadge({ frozen = false }: { frozen?: boolean }) {
  return (
    <View style={[styles.headerWardBadge, frozen && styles.headerWardBadgeFrozen]}>
      <Shield size={13} color={frozen ? colors.warning : colors.secondary} />
      <Text style={[styles.headerWardBadgeText, frozen && styles.headerWardBadgeTextFrozen]}>Ward Mode</Text>
    </View>
  );
}

function HeaderQuickActionButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.headerQuickBtn}>
      <ScanLine size={15} color={colors.primaryLight} />
    </Pressable>
  );
}

function AgentTabBarButton({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  disabled,
  style,
  testID,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  children,
}: BottomTabBarButtonProps) {
  const holdTriggeredRef = useRef(false);

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      disabled={disabled}
      style={style}
      testID={testID}
      delayLongPress={AGENT_HOLD_TO_RECORD_MS}
      onPressIn={(e) => {
        holdTriggeredRef.current = false;
        onPressIn?.(e);
      }}
      onLongPress={(e) => {
        holdTriggeredRef.current = true;
        onLongPress?.(e);
        onPress?.(e);
        emitAgentTabVoiceEvent("start");
      }}
      onPressOut={(e) => {
        onPressOut?.(e);
        if (!holdTriggeredRef.current) return;
        emitAgentTabVoiceEvent("stop");
        holdTriggeredRef.current = false;
      }}
      onPress={(e) => {
        if (holdTriggeredRef.current) return;
        onPress?.(e);
      }}
    >
      {children}
    </Pressable>
  );
}

export default function AppNavigator() {
  const wallet = useWallet();
  const ward = useWardContext();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 12 : 24);
  const initialRouteName: keyof AppTabParamList = "Home";
  const isWardFrozen = ward.isWard && !!ward.wardInfo?.isFrozen;

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
          headerTitle: route.name === "Home" && ward.isWard ? () => <HeaderWardBadge frozen={isWardFrozen} /> : "",
          headerLeft: () => <HeaderLogoButton />,
          headerRight: () => (
            <HeaderQuickActionButton onPress={() => navigation.getParent("root")?.navigate("Send", { openScanner: true })} />
          ),
          headerLeftContainerStyle: { paddingLeft: 20 },
          headerRightContainerStyle: { paddingRight: 20 },
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
          tabBarLabel: ({ focused, color }) => {
            return (
              <Text style={[styles.tabLabel, { color, fontWeight: focused ? "600" : "500" }]}>
                {route.name}
              </Text>
            );
          },
          tabBarButtonTestID: TAB_TEST_IDS[route.name],
          tabBarAccessibilityLabel: TAB_TEST_IDS[route.name],
          tabBarIcon: ({ focused }) => {
            return <TabIcon label={route.name} focused={focused} />;
          },
        })}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={ward.isWard ? {
            headerTitle: () => <HeaderWardBadge frozen={isWardFrozen} />,
          } : {
            headerTitle: "",
          }}
        />
        <Tab.Screen
          name="Agent"
          component={AgentScreen}
          options={{
            headerTitle: "",
            tabBarButton: (props) => <AgentTabBarButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Activity"
          component={ActivityScreen}
          options={{ headerTitle: "" }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerTitle: "" }}
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
  },
  headerBrand: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  headerWardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(139, 92, 246, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.35)",
    paddingHorizontal: 10,
    height: 24,
  },
  headerWardBadgeText: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  headerWardBadgeFrozen: {
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  headerWardBadgeTextFrozen: {
    color: colors.warning,
  },
  headerQuickBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
});
