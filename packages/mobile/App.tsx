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
  "[WardContext]",
  "[WardApprovalModal]",
  "[GuardianApprovalModal]",
  "Attempting to change the refresh control while it is not idle",
]);

if (__DEV__) {
  LogBox.ignoreAllLogs(true);
}
import { TongoBridgeProvider } from "./src/bridge/TongoBridge";
import { WalletProvider } from "./src/lib/WalletContext";
import { TwoFactorProvider } from "./src/lib/TwoFactorContext";
import { ToastProvider } from "./src/components/Toast";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { WardProvider } from "./src/lib/wardContext";
import ApprovalModal from "./src/components/ApprovalModal";
import WardApprovalModal from "./src/components/WardApprovalModal";
import GuardianApprovalModal from "./src/components/GuardianApprovalModal";
import RootNavigator from "./src/navigation/RootNavigator";
import { isE2E } from "./src/testing/runtimeConfig";
import TestStateMarkers from "./src/testing/TestStateMarkers";

if (isE2E()) {
  LogBox.ignoreAllLogs(true);
}

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0A0F1C" />
      <ToastProvider>
        <TongoBridgeProvider>
          <WalletProvider>
            <TwoFactorProvider>
              <WardProvider>
                <ErrorBoundary>
                  <RootNavigator />
                </ErrorBoundary>
                {isE2E() && <TestStateMarkers />}
                <ApprovalModal />
                <WardApprovalModal />
                <GuardianApprovalModal />
              </WardProvider>
            </TwoFactorProvider>
          </WalletProvider>
        </TongoBridgeProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

export default App;
