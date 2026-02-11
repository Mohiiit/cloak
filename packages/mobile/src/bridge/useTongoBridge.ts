/**
 * Hook to interact with the Tongo SDK via WebView bridge.
 */
import { useState, useEffect, useCallback } from "react";
import { getTongoBridge, TongoBridgeRef } from "./TongoBridge";

const SEPOLIA_RPC = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_9/_hKu4IgnPgrF8O82GLuYU";

type TongoState = {
  balance: string;
  pending: string;
  nonce: string;
};

export function useTongoBridge() {
  const [bridge, setBridge] = useState<TongoBridgeRef | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    getTongoBridge().then((b) => {
      setBridge(b);
      setIsReady(true);
    });
  }, []);

  const initialize = useCallback(
    async (params: {
      tongoPrivateKey: string;
      token?: string;
      starkAddress?: string;
      starkPrivateKey?: string;
    }) => {
      if (!bridge) throw new Error("Bridge not ready");
      await bridge.send("init", {
        rpcUrl: SEPOLIA_RPC,
        tongoPrivateKey: params.tongoPrivateKey,
        token: params.token || "STRK",
        starkAddress: params.starkAddress,
        starkPrivateKey: params.starkPrivateKey,
      });
      setIsInitialized(true);
    },
    [bridge],
  );

  const getState = useCallback(async (): Promise<TongoState> => {
    if (!bridge) throw new Error("Bridge not ready");
    return bridge.send("getState");
  }, [bridge]);

  const getRate = useCallback(async (): Promise<string> => {
    if (!bridge) throw new Error("Bridge not ready");
    return bridge.send("getRate");
  }, [bridge]);

  const getTongoAddress = useCallback(async (): Promise<string> => {
    if (!bridge) throw new Error("Bridge not ready");
    return bridge.send("getTongoAddress");
  }, [bridge]);

  const fund = useCallback(
    async (amount: string, sender: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("fund", { amount, sender });
    },
    [bridge],
  );

  const transfer = useCallback(
    async (amount: string, recipientBase58: string, sender: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("transfer", { amount, recipientBase58, sender });
    },
    [bridge],
  );

  const withdraw = useCallback(
    async (amount: string, to: string, sender: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("withdraw", { amount, to, sender });
    },
    [bridge],
  );

  const rollover = useCallback(
    async (sender: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("rollover", { sender });
    },
    [bridge],
  );

  const switchToken = useCallback(
    async (tongoPrivateKey: string, token: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("switchToken", { tongoPrivateKey, token });
    },
    [bridge],
  );

  const generateKeypair = useCallback(async () => {
    if (!bridge) throw new Error("Bridge not ready");
    return bridge.send("generateKeypair");
  }, [bridge]);

  const derivePublicKey = useCallback(
    async (privateKey: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("derivePublicKey", { privateKey });
    },
    [bridge],
  );

  const getTxHistory = useCallback(
    async (fromBlock = 0) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("getTxHistory", { fromBlock });
    },
    [bridge],
  );

  return {
    isReady,
    isInitialized,
    initialize,
    getState,
    getRate,
    getTongoAddress,
    fund,
    transfer,
    withdraw,
    rollover,
    switchToken,
    generateKeypair,
    derivePublicKey,
    getTxHistory,
  };
}
