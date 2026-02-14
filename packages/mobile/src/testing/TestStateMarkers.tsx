import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useWallet } from "../lib/WalletContext";
import { useTwoFactor } from "../lib/TwoFactorContext";
import { useWardContext } from "../lib/wardContext";
import { testIDs, testProps } from "./testIDs";
import { useTransactionRouterPath } from "./transactionRouteTrace";

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

  const approvalQueueCount =
    twoFactor.pendingRequests.length +
    ward.pendingWard2faRequests.length +
    ward.pendingGuardianRequests.length;

  return (
    <View pointerEvents="none" style={styles.container} accessible={false}>
      <Text
        {...testProps(testIDs.markers.deployStatus)}
        style={styles.marker}
        accessible={false}
      >
        {`deploy.status=${getDeployStatus(wallet)}`}
      </Text>
      <Text
        {...testProps(testIDs.markers.approvalQueueCount)}
        style={styles.marker}
        accessible={false}
      >
        {`approval.queue.count=${approvalQueueCount}`}
      </Text>
      <Text
        {...testProps(testIDs.markers.transactionRouterPath)}
        style={styles.marker}
        accessible={false}
      >
        {`transaction.router.path=${routerPath}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 2,
    height: 2,
    opacity: 0.01,
  },
  marker: {
    fontSize: 1,
    lineHeight: 1,
    color: "#000000",
  },
});
