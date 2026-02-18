import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AppNavigator from "./AppNavigator";
import type { RootStackParamList } from "./types";
import TransactionDetailScreen from "../screens/activity/TransactionDetailScreen";
import KeyBackupScreen from "../screens/settings/KeyBackupScreen";
import WardSetupScreen from "../screens/settings/WardSetupScreen";
import WardCreatedScreen from "../screens/settings/WardCreatedScreen";
import ImportAccountScreen from "../screens/onboarding/ImportAccountScreen";
import ImportWardScreen from "../screens/onboarding/ImportWardScreen";
import { colors } from "../lib/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
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
          name="TransactionDetail"
          component={TransactionDetailScreen}
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
          name="ImportAccount"
          component={ImportAccountScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ImportWard"
          component={ImportWardScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
