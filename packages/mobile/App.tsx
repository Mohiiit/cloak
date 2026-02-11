/**
 * Cloak Mobile — Shielded Payment Wallet
 */
import React from "react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TongoBridgeProvider } from "./src/bridge/TongoBridge";
import { WalletProvider } from "./src/lib/WalletContext";
import AppNavigator from "./src/navigation/AppNavigator";

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <TongoBridgeProvider>
        <WalletProvider>
          <AppNavigator />
        </WalletProvider>
      </TongoBridgeProvider>
    </SafeAreaProvider>
  );
}

export default App;
