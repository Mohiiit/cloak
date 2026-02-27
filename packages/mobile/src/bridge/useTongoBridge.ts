/**
 * Hook to interact with the Tongo SDK through a runtime-selected client.
 */
import { useState, useEffect, useCallback } from "react";
import { getTongoBridge, TongoBridgeRef } from "./TongoBridge";
import { isMockMode } from "../testing/runtimeConfig";
import { MockBridgeClient } from "../testing/mocks/MockBridgeClient";
import { DEFAULT_RPC } from "@cloak-wallet/sdk";
import type {
  BridgeClient,
  BridgeInitParams,
  BridgeX402PaymentResult,
  TongoState,
} from "../testing/interfaces/BridgeClient";

const SEPOLIA_RPC = DEFAULT_RPC.sepolia;
const BACKUP_SEPOLIA_RPCS = [
  "https://starknet-sepolia-rpc.publicnode.com",
  "https://rpc.starknet-testnet.lava.build",
];

class LiveBridgeClient implements BridgeClient {
  readonly isReady = true;
  private initParams: BridgeInitParams | null = null;
  private activeRpcUrl = SEPOLIA_RPC;

  constructor(private readonly bridge: TongoBridgeRef) {}

  private rpcCandidates(): string[] {
    return Array.from(new Set([SEPOLIA_RPC, ...BACKUP_SEPOLIA_RPCS]));
  }

  private isRecoverableRpcError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
      message.includes("-32001") ||
      message.includes("unable to complete request") ||
      message.includes("network request failed") ||
      message.includes("failed to fetch") ||
      message.includes("fetch failed") ||
      message.includes("bridge timeout") ||
      message.includes("timeout")
    );
  }

  private async initWithRpc(params: BridgeInitParams, rpcUrl: string): Promise<any> {
    const normalized: BridgeInitParams = {
      ...params,
      token: params.token || "STRK",
    };
    const result = await this.bridge.send("init", {
      rpcUrl,
      tongoPrivateKey: normalized.tongoPrivateKey,
      token: normalized.token,
      starkAddress: normalized.starkAddress,
      starkPrivateKey: normalized.starkPrivateKey,
    });
    // Warm-up call to detect unhealthy RPCs early.
    await this.bridge.send("getRate");
    this.activeRpcUrl = rpcUrl;
    this.initParams = normalized;
    return result;
  }

  private async failoverRpc(): Promise<boolean> {
    if (!this.initParams) return false;
    const previousRpc = this.activeRpcUrl;
    for (const candidate of this.rpcCandidates()) {
      if (candidate === previousRpc) continue;
      try {
        await this.initWithRpc(this.initParams, candidate);
        console.warn(`[useTongoBridge] Switched RPC provider from ${previousRpc} to ${candidate}`);
        return true;
      } catch (err) {
        console.warn(`[useTongoBridge] RPC candidate failed: ${candidate}`, err);
      }
    }
    return false;
  }

  private async sendWithRetry<T>(command: string, params?: Record<string, any>): Promise<T> {
    try {
      return (await this.bridge.send(command, params)) as T;
    } catch (err) {
      if (!this.isRecoverableRpcError(err)) {
        throw err;
      }
      const switched = await this.failoverRpc();
      if (!switched) {
        throw err;
      }
      return (await this.bridge.send(command, params)) as T;
    }
  }

  async initialize(params: BridgeInitParams): Promise<any> {
    let lastError: unknown;
    for (const candidate of this.rpcCandidates()) {
      try {
        return await this.initWithRpc(params, candidate);
      } catch (err) {
        lastError = err;
        console.warn(`[useTongoBridge] Init failed on ${candidate}`, err);
      }
    }
    throw lastError ?? new Error("Failed to initialize bridge on available RPC providers");
  }

  async getState(): Promise<TongoState> {
    return this.sendWithRetry<TongoState>("getState");
  }

  async getRate(): Promise<string> {
    return this.sendWithRetry<string>("getRate");
  }

  async getTongoAddress(): Promise<string> {
    return this.sendWithRetry<string>("getTongoAddress");
  }

  async fund(amount: string, sender: string): Promise<{ txHash: string }> {
    return this.sendWithRetry<{ txHash: string }>("fund", { amount, sender });
  }

  async transfer(
    amount: string,
    recipientBase58: string,
    sender: string,
  ): Promise<{ txHash: string }> {
    return this.sendWithRetry<{ txHash: string }>("transfer", { amount, recipientBase58, sender });
  }

  async withdraw(
    amount: string,
    to: string,
    sender: string,
  ): Promise<{ txHash: string }> {
    return this.sendWithRetry<{ txHash: string }>("withdraw", { amount, to, sender });
  }

  async rollover(sender: string): Promise<{ txHash: string }> {
    return this.sendWithRetry<{ txHash: string }>("rollover", { sender });
  }

  async prepareFund(amount: string, sender: string): Promise<{ calls: any[] }> {
    return this.sendWithRetry<{ calls: any[] }>("prepareFund", { amount, sender });
  }

  async prepareTransfer(
    amount: string,
    recipientBase58: string,
    sender: string,
  ): Promise<{ calls: any[] }> {
    return this.sendWithRetry<{ calls: any[] }>("prepareTransfer", { amount, recipientBase58, sender });
  }

  async prepareWithdraw(
    amount: string,
    to: string,
    sender: string,
  ): Promise<{ calls: any[] }> {
    return this.sendWithRetry<{ calls: any[] }>("prepareWithdraw", { amount, to, sender });
  }

  async prepareRollover(sender: string): Promise<{ calls: any[] }> {
    return this.sendWithRetry<{ calls: any[] }>("prepareRollover", { sender });
  }

  async x402Pay(
    amount: string,
    recipient: string,
    sender: string,
    recipientBase58?: string,
  ): Promise<BridgeX402PaymentResult> {
    console.warn(`[TongoBridge] x402Pay — amount="${amount}", mode=${recipientBase58 ? "transfer" : "withdraw"}, sender="${sender?.slice(0,12)}…"`);
    return this.sendWithRetry<BridgeX402PaymentResult>("x402Pay", {
      amount,
      recipientBase58,
      recipient,
      sender,
    });
  }

  async switchToken(tongoPrivateKey: string, token: string): Promise<any> {
    const result = await this.sendWithRetry<any>("switchToken", { tongoPrivateKey, token });
    if (this.initParams) {
      this.initParams = { ...this.initParams, token };
    }
    return result;
  }

  async generateKeypair(): Promise<{ privateKey: string; publicKey: string }> {
    return this.sendWithRetry<{ privateKey: string; publicKey: string }>("generateKeypair");
  }

  async derivePublicKey(privateKey: string): Promise<{ x: string; y: string }> {
    return this.sendWithRetry<{ x: string; y: string }>("derivePublicKey", { privateKey });
  }

  async queryERC20Balance(token: string, address: string): Promise<string> {
    return this.sendWithRetry<string>("queryERC20Balance", { token, address });
  }

  async getTxHistory(fromBlock = 0): Promise<any[]> {
    return this.sendWithRetry<any[]>("getTxHistory", { fromBlock });
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

  const x402Pay = useCallback(
    async (amount: string, recipient: string, sender: string, recipientBase58?: string) => {
      return requireClient().x402Pay(amount, recipient, sender, recipientBase58);
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
    x402Pay,
    switchToken,
    generateKeypair,
    derivePublicKey,
    queryERC20Balance,
    getTxHistory,
    validateBase58,
  };
}
