/**
 * Bottom tab navigation for the Cloak wallet.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Platform, Pressable, Modal } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Send, Clock, Shield, Sparkles, ScanLine, QrCode, Repeat } from "lucide-react-native";
import HomeScreen from "../screens/HomeScreen";
import SendScreen from "../screens/SendScreen";
import WalletScreen from "../screens/WalletScreen";
import ActivityScreen from "../screens/ActivityScreen";
import SwapScreen from "../screens/SwapScreen";
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
  Swap: ({ size, color }) => <Repeat size={size} color={color} />,
  Activity: ({ size, color }) => <Clock size={size} color={color} />,
};

const TAB_TEST_IDS: Record<string, string> = {
  Home: testIDs.navigation.tabHome,
  Send: testIDs.navigation.tabSend,
  Wallet: testIDs.navigation.tabWallet,
  Swap: testIDs.navigation.tabSwap,
  Activity: testIDs.navigation.tabActivity,
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const color = focused ? colors.primary : colors.textMuted;
  const IconComponent = TAB_ICONS[label];
  if (IconComponent) {
    return <IconComponent size={22} color={color} />;
  }
  return <Text style={[styles.icon, focused && styles.iconActive]}>{"•"}</Text>;
}

function HeaderLogoButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.headerLeftGroup}>
      <CloakIcon size={24} />
      <Text style={styles.headerBrand}>Cloak</Text>
    </Pressable>
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
      <Sparkles size={15} color={colors.primaryLight} />
    </Pressable>
  );
}

function QuickActionSheet({
  visible,
  onClose,
  onQuickSend,
  onScanToPay,
  onShowReceiveQr,
}: {
  visible: boolean;
  onClose: () => void;
  onQuickSend: () => void;
  onScanToPay: () => void;
  onShowReceiveQr: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.quickOverlay} onPress={onClose}>
        <View style={styles.quickSheet}>
          <Pressable style={styles.quickRow} onPress={onQuickSend}>
            <Send size={16} color={colors.primaryLight} />
            <Text style={styles.quickLabel}>Quick Send</Text>
          </Pressable>
          <Pressable style={styles.quickRow} onPress={onScanToPay}>
            <ScanLine size={16} color={colors.primaryLight} />
            <Text style={styles.quickLabel}>Scan to Pay</Text>
          </Pressable>
          <Pressable style={styles.quickRow} onPress={onShowReceiveQr}>
            <QrCode size={16} color={colors.primaryLight} />
            <Text style={styles.quickLabel}>Show Receive QR</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
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
  const [quickActionOpen, setQuickActionOpen] = useState(false);

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
          headerLeft: () => (
            <HeaderLogoButton onPress={() => navigation.getParent()?.navigate("SettingsHub")} />
          ),
          headerRight: () => (
            <HeaderQuickActionButton onPress={() => setQuickActionOpen(true)} />
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
            const frozenTab = isWardFrozen && (route.name === "Send" || route.name === "Wallet");
            return (
              <Text style={[styles.tabLabel, { color, fontWeight: focused ? "600" : "500", opacity: frozenTab ? 0.3 : 1 }]}>
                {route.name}
              </Text>
            );
          },
          tabBarButtonTestID: TAB_TEST_IDS[route.name],
          tabBarAccessibilityLabel: TAB_TEST_IDS[route.name],
          tabBarIcon: ({ focused }) => {
            const frozenTab = isWardFrozen && (route.name === "Send" || route.name === "Wallet");
            return (
              <View style={{ opacity: frozenTab ? 0.3 : 1 }}>
                <TabIcon label={route.name} focused={focused} />
              </View>
            );
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
          name="Send"
          component={SendScreen}
          options={{ headerTitle: "" }}
          listeners={isWardFrozen ? { tabPress: (e) => e.preventDefault() } : undefined}
        />
        <Tab.Screen
          name="Wallet"
          component={WalletScreen}
          options={{ headerTitle: "" }}
          listeners={isWardFrozen ? { tabPress: (e) => e.preventDefault() } : undefined}
        />
        <Tab.Screen
          name="Swap"
          component={SwapScreen}
          options={{ headerTitle: "" }}
        />
        <Tab.Screen
          name="Activity"
          component={ActivityScreen}
          options={{ headerTitle: "" }}
        />
      </Tab.Navigator>
      <QuickActionSheet
        visible={quickActionOpen}
        onClose={() => setQuickActionOpen(false)}
        onQuickSend={() => {
          setQuickActionOpen(false);
          navigation.navigate("Send");
        }}
        onScanToPay={() => {
          setQuickActionOpen(false);
          navigation.navigate("Send");
        }}
        onShowReceiveQr={() => {
          setQuickActionOpen(false);
          navigation.getParent()?.navigate("SettingsHub");
        }}
      />
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
  quickOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  quickSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
    paddingBottom: 24,
  },
  quickRow: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(22, 31, 49, 0.7)",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  quickLabel: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.secondarySemibold,
  },
});
