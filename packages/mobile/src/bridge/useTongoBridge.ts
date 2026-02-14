/**
 * Hook to interact with the Tongo SDK via WebView bridge.
 */
import { useState, useEffect, useCallback } from "react";
import { getTongoBridge, TongoBridgeRef } from "./TongoBridge";

const SEPOLIA_RPC = "https://rpc.starknet-testnet.lava.build";

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

  const prepareFund = useCallback(
    async (amount: string, sender: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("prepareFund", { amount, sender });
    },
    [bridge],
  );

  const prepareTransfer = useCallback(
    async (amount: string, recipientBase58: string, sender: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("prepareTransfer", { amount, recipientBase58, sender });
    },
    [bridge],
  );

  const prepareWithdraw = useCallback(
    async (amount: string, to: string, sender: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("prepareWithdraw", { amount, to, sender });
    },
    [bridge],
  );

  const prepareRollover = useCallback(
    async (sender: string) => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("prepareRollover", { sender });
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

  const queryERC20Balance = useCallback(
    async (token: string, address: string): Promise<string> => {
      if (!bridge) throw new Error("Bridge not ready");
      return bridge.send("queryERC20Balance", { token, address });
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

  const validateBase58 = useCallback(
    async (base58: string): Promise<boolean> => {
      if (!bridge) return false;
      try {
        await bridge.send("base58ToPubKey", { base58 });
        return true;
      } catch {
        return false;
      }
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
    prepareFund,
    prepareTransfer,
    prepareWithdraw,
    prepareRollover,
    switchToken,
    generateKeypair,
    derivePublicKey,
    queryERC20Balance,
    getTxHistory,
    validateBase58,
  };
}
