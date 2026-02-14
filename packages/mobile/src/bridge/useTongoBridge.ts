/**
 * Hook to interact with the Tongo SDK through a runtime-selected client.
 */
import { useState, useEffect, useCallback } from "react";
import { getTongoBridge, TongoBridgeRef } from "./TongoBridge";
import { isMockMode } from "../testing/runtimeConfig";
import { MockBridgeClient } from "../testing/mocks/MockBridgeClient";
import type {
  BridgeClient,
  BridgeInitParams,
  TongoState,
} from "../testing/interfaces/BridgeClient";

const SEPOLIA_RPC = "https://rpc.starknet-testnet.lava.build";

class LiveBridgeClient implements BridgeClient {
  readonly isReady = true;

  constructor(private readonly bridge: TongoBridgeRef) {}

  async initialize(params: BridgeInitParams): Promise<any> {
    return this.bridge.send("init", {
      rpcUrl: SEPOLIA_RPC,
      tongoPrivateKey: params.tongoPrivateKey,
      token: params.token || "STRK",
      starkAddress: params.starkAddress,
      starkPrivateKey: params.starkPrivateKey,
    });
  }

  async getState(): Promise<TongoState> {
    return this.bridge.send("getState");
  }

  async getRate(): Promise<string> {
    return this.bridge.send("getRate");
  }

  async getTongoAddress(): Promise<string> {
    return this.bridge.send("getTongoAddress");
  }

  async fund(amount: string, sender: string): Promise<{ txHash: string }> {
    return this.bridge.send("fund", { amount, sender });
  }

  async transfer(
    amount: string,
    recipientBase58: string,
    sender: string,
  ): Promise<{ txHash: string }> {
    return this.bridge.send("transfer", { amount, recipientBase58, sender });
  }

  async withdraw(
    amount: string,
    to: string,
    sender: string,
  ): Promise<{ txHash: string }> {
    return this.bridge.send("withdraw", { amount, to, sender });
  }

  async rollover(sender: string): Promise<{ txHash: string }> {
    return this.bridge.send("rollover", { sender });
  }

  async prepareFund(amount: string, sender: string): Promise<{ calls: any[] }> {
    return this.bridge.send("prepareFund", { amount, sender });
  }

  async prepareTransfer(
    amount: string,
    recipientBase58: string,
    sender: string,
  ): Promise<{ calls: any[] }> {
    return this.bridge.send("prepareTransfer", { amount, recipientBase58, sender });
  }

  async prepareWithdraw(
    amount: string,
    to: string,
    sender: string,
  ): Promise<{ calls: any[] }> {
    return this.bridge.send("prepareWithdraw", { amount, to, sender });
  }

  async prepareRollover(sender: string): Promise<{ calls: any[] }> {
    return this.bridge.send("prepareRollover", { sender });
  }

  async switchToken(tongoPrivateKey: string, token: string): Promise<any> {
    return this.bridge.send("switchToken", { tongoPrivateKey, token });
  }

  async generateKeypair(): Promise<{ privateKey: string; publicKey: string }> {
    return this.bridge.send("generateKeypair");
  }

  async derivePublicKey(privateKey: string): Promise<{ x: string; y: string }> {
    return this.bridge.send("derivePublicKey", { privateKey });
  }

  async queryERC20Balance(token: string, address: string): Promise<string> {
    return this.bridge.send("queryERC20Balance", { token, address });
  }

  async getTxHistory(fromBlock = 0): Promise<any[]> {
    return this.bridge.send("getTxHistory", { fromBlock });
  }

  async validateBase58(base58: string): Promise<boolean> {
    try {
      await this.bridge.send("base58ToPubKey", { base58 });
      return true;
    } catch {
      return false;
    }
  }
}

export function useTongoBridge() {
  const [client, setClient] = useState<BridgeClient | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (isMockMode()) {
      const mockClient = new MockBridgeClient();
      if (isMounted) {
        setClient(mockClient);
        setIsReady(mockClient.isReady);
      }
      return () => {
        isMounted = false;
      };
    }

    getTongoBridge()
      .then((bridge) => {
        if (!isMounted) return;
        const liveClient = new LiveBridgeClient(bridge);
        setClient(liveClient);
        setIsReady(liveClient.isReady);
      })
      .catch((err) => {
        console.warn("[useTongoBridge] Bridge setup failed:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const requireClient = useCallback((): BridgeClient => {
    if (!client) throw new Error("Bridge not ready");
    return client;
  }, [client]);

  const initialize = useCallback(
    async (params: BridgeInitParams) => {
      await requireClient().initialize(params);
      setIsInitialized(true);
    },
    [requireClient],
  );

  const getState = useCallback(async (): Promise<TongoState> => {
    return requireClient().getState();
  }, [requireClient]);

  const getRate = useCallback(async (): Promise<string> => {
    return requireClient().getRate();
  }, [requireClient]);

  const getTongoAddress = useCallback(async (): Promise<string> => {
    return requireClient().getTongoAddress();
  }, [requireClient]);

  const fund = useCallback(
    async (amount: string, sender: string) => {
      return requireClient().fund(amount, sender);
    },
    [requireClient],
  );

  const transfer = useCallback(
    async (amount: string, recipientBase58: string, sender: string) => {
      return requireClient().transfer(amount, recipientBase58, sender);
    },
    [requireClient],
  );

  const withdraw = useCallback(
    async (amount: string, to: string, sender: string) => {
      return requireClient().withdraw(amount, to, sender);
    },
    [requireClient],
  );

  const rollover = useCallback(
    async (sender: string) => {
      return requireClient().rollover(sender);
    },
    [requireClient],
  );

  const prepareFund = useCallback(
    async (amount: string, sender: string) => {
      return requireClient().prepareFund(amount, sender);
    },
    [requireClient],
  );

  const prepareTransfer = useCallback(
    async (amount: string, recipientBase58: string, sender: string) => {
      return requireClient().prepareTransfer(amount, recipientBase58, sender);
    },
    [requireClient],
  );

  const prepareWithdraw = useCallback(
    async (amount: string, to: string, sender: string) => {
      return requireClient().prepareWithdraw(amount, to, sender);
    },
    [requireClient],
  );

  const prepareRollover = useCallback(
    async (sender: string) => {
      return requireClient().prepareRollover(sender);
    },
    [requireClient],
  );

  const switchToken = useCallback(
    async (tongoPrivateKey: string, token: string) => {
      return requireClient().switchToken(tongoPrivateKey, token);
    },
    [requireClient],
  );

  const generateKeypair = useCallback(async () => {
    return requireClient().generateKeypair();
  }, [requireClient]);

  const derivePublicKey = useCallback(
    async (privateKey: string) => {
      return requireClient().derivePublicKey(privateKey);
    },
    [requireClient],
  );

  const queryERC20Balance = useCallback(
    async (token: string, address: string): Promise<string> => {
      return requireClient().queryERC20Balance(token, address);
    },
    [requireClient],
  );

  const getTxHistory = useCallback(
    async (fromBlock = 0) => {
      return requireClient().getTxHistory(fromBlock);
    },
    [requireClient],
  );

  const validateBase58 = useCallback(
    async (base58: string): Promise<boolean> => {
      if (!client) return false;
      return client.validateBase58(base58);
    },
    [client],
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
