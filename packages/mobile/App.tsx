/**
 * Cloak Mobile — Shielded Payment Wallet
 */
import "react-native-get-random-values";
import React from "react";
import { StatusBar, LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

LogBox.ignoreLogs([
  "[TongoBridge]",
  "[WalletContext]",
  "[ErrorBoundary]",
  "[TwoFactorContext]",
  "[twoFactor]",
  "[ApprovalModal]",
]);
import { TongoBridgeProvider } from "./src/bridge/TongoBridge";
import { WalletProvider } from "./src/lib/WalletContext";
import { TwoFactorProvider } from "./src/lib/TwoFactorContext";
import { ToastProvider } from "./src/components/Toast";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import ApprovalModal from "./src/components/ApprovalModal";
import AppNavigator from "./src/navigation/AppNavigator";

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ToastProvider>
        <TongoBridgeProvider>
          <WalletProvider>
            <TwoFactorProvider>
              <ErrorBoundary>
                <AppNavigator />
              </ErrorBoundary>
              <ApprovalModal />
            </TwoFactorProvider>
          </WalletProvider>
        </TongoBridgeProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

export default App;
