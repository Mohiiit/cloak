import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useWallet } from "../lib/WalletContext";
import { useTwoFactor } from "../lib/TwoFactorContext";
import { useWardContext } from "../lib/wardContext";
import { testIDs, testProps } from "./testIDs";
import { useTransactionRouterPath } from "./transactionRouteTrace";
import { getNetworkMode, getRuntimeMode } from "./runtimeConfig";

function getDeployStatus(wallet: ReturnType<typeof useWallet>) {
  if (!wallet.isWalletCreated) return "wallet_missing";
  if (wallet.isCheckingDeployment) return "checking_deployment";
  if (wallet.isDeployed) return "deployed";
  return "needs_deploy";
}

export default function TestStateMarkers() {
  const wallet = useWallet();
  const twoFactor = useTwoFactor();
  const ward = useWardContext();
  const routerPath = useTransactionRouterPath();
  const deployStatus = getDeployStatus(wallet);

  const approvalQueueCount =
    twoFactor.pendingRequests.length +
    ward.pendingWard2faRequests.length +
    ward.pendingGuardianRequests.length;
  const approvalQueueText = `approval.queue.count=${approvalQueueCount}`;
  const deployStatusText = `deploy.status=${deployStatus}`;
  const routerPathText = `transaction.router.path=${routerPath}`;
  const runtimeModeText = `runtime.mode=${getRuntimeMode()}`;
  const networkModeText = `network.mode=${getNetworkMode()}`;
  const topOffset = 64;

  return (
    <>
      <View
        {...testProps(testIDs.markers.deployStatus, deployStatusText)}
        style={[styles.markerContainer, { top: topOffset }]}
        collapsable={false}
        accessible
        importantForAccessibility="yes"
        pointerEvents="none"
      >
        <Text style={styles.marker}>{deployStatusText}</Text>
      </View>
      <View
        {...testProps(testIDs.markers.approvalQueueCount, approvalQueueText)}
        style={[styles.markerContainer, { top: topOffset + 10 }]}
        collapsable={false}
        accessible
        importantForAccessibility="yes"
        pointerEvents="none"
      >
        <Text style={styles.marker}>{approvalQueueText}</Text>
      </View>
      <View
        {...testProps(testIDs.markers.transactionRouterPath, routerPathText)}
        style={[styles.markerContainer, { top: topOffset + 20 }]}
        collapsable={false}
        accessible
        importantForAccessibility="yes"
        pointerEvents="none"
      >
        <Text style={styles.marker}>{routerPathText}</Text>
      </View>
      <View
        {...testProps(testIDs.markers.runtimeMode, runtimeModeText)}
        style={[styles.markerContainer, { top: topOffset + 30 }]}
        collapsable={false}
        accessible
        importantForAccessibility="yes"
        pointerEvents="none"
      >
        <Text style={styles.marker}>{runtimeModeText}</Text>
      </View>
      <View
        {...testProps(testIDs.markers.networkMode, networkModeText)}
        style={[styles.markerContainer, { top: topOffset + 40 }]}
        collapsable={false}
        accessible
        importantForAccessibility="yes"
        pointerEvents="none"
      >
        <Text style={styles.marker}>{networkModeText}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  markerContainer: {
    position: "absolute",
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  marker: {
    fontSize: 1,
    color: "transparent",
  },
});
