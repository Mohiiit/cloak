"use client";

import { useEffect, useRef } from "react";
import { useConnect } from "@starknet-react/core";
import { useAccount } from "~~/hooks/useAccount";

/**
 * Auto-connects the TestConnector on mount when NEXT_PUBLIC_TEST_MODE=true.
 * This bypasses the wallet selection modal entirely for automated testing.
 */
export function TestAutoConnect() {
  const { connect, connectors } = useConnect();
  const { status } = useAccount();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (status === "connected") return;

    const testConnector = connectors.find((c) => c.id === "test-wallet");
    if (testConnector) {
      attempted.current = true;
      connect({ connector: testConnector });
    }
  }, [connect, connectors, status]);

  return null;
}
