/**
 * Cloak Mobile — Shielded Payment Wallet
 */
import React from "react";
import { StatusBar, LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

LogBox.ignoreLogs([
  "[TongoBridge]",
  "[WalletContext]",
  "[ErrorBoundary]",
]);
import { TongoBridgeProvider } from "./src/bridge/TongoBridge";
import { WalletProvider } from "./src/lib/WalletContext";
import { ToastProvider } from "./src/components/Toast";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import AppNavigator from "./src/navigation/AppNavigator";

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ToastProvider>
        <TongoBridgeProvider>
          <WalletProvider>
            <ErrorBoundary>
              <AppNavigator />
            </ErrorBoundary>
          </WalletProvider>
        </TongoBridgeProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

export default App;
