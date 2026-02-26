import React, { useState } from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AppNavigator from "./AppNavigator";
import type { RootStackParamList } from "./types";
import TransactionDetailScreen from "../screens/activity/TransactionDetailScreen";
import KeyBackupScreen from "../screens/settings/KeyBackupScreen";
import WardSetupScreen from "../screens/settings/WardSetupScreen";
import WardCreatedScreen from "../screens/settings/WardCreatedScreen";
import WardDetailScreen from "../screens/settings/WardDetailScreen";
import ImportAccountScreen from "../screens/onboarding/ImportAccountScreen";
import ImportWardScreen from "../screens/onboarding/ImportWardScreen";
import AddressInfoScreen from "../screens/AddressInfoScreen";
import AddContactScreen from "../screens/AddContactScreen";
import MarketplaceScreen from "../screens/MarketplaceScreen";
import MarketplaceRunDetailScreen from "../screens/MarketplaceRunDetailScreen";
import SplashScreen from "../screens/SplashScreen";
import SettingsScreen from "../screens/SettingsScreen";
import SwapDetailScreen from "../screens/swap/SwapDetailScreen";
import SendScreen from "../screens/SendScreen";
import ShieldScreen from "../screens/ShieldScreen";
import UnshieldScreen from "../screens/UnshieldScreen";
import SwapScreen from "../screens/SwapScreen";
import { useWallet } from "../lib/WalletContext";
import { colors } from "../lib/theme";
import { isE2E } from "../testing/runtimeConfig";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const wallet = useWallet();
  const [showSplash, setShowSplash] = useState(true);

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator
          id="root"
          initialRouteName="AppTabs"
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen
            name="AppTabs"
            component={AppNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SettingsHub"
            component={SettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Marketplace"
            component={MarketplaceScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="MarketplaceRunDetail"
            component={MarketplaceRunDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="TransactionDetail"
            component={TransactionDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SwapDetail"
            component={SwapDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="KeyBackup"
            component={KeyBackupScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="WardSetup"
            component={WardSetupScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="WardCreated"
            component={WardCreatedScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="WardDetail"
            component={WardDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ImportAccount"
            component={ImportAccountScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ImportWard"
            component={ImportWardScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AddressInfo"
            component={AddressInfoScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AddContact"
            component={AddContactScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Send"
            component={SendScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Shield"
            component={ShieldScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Unshield"
            component={UnshieldScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Swap"
            component={SwapScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>

      {!isE2E() && showSplash ? (
        <SplashScreen
          readyToExit={!wallet.isLoading}
          onFinished={() => setShowSplash(false)}
        />
      ) : null}
    </View>
  );
}
