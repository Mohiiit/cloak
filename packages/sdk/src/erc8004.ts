import { RpcProvider, num, type Call } from "starknet";
import { DEFAULT_RPC } from "./config";
import type { Network } from "./types";

export type ERC8004RegistryType = "identity" | "reputation" | "validation";
export type ERC8004CalldataValue = string | bigint | number;

export interface ERC8004RegistrySet {
  identity: string;
  reputation: string;
  validation: string;
}

export interface ERC8004ProviderLike {
  callContract: RpcProvider["callContract"];
  waitForTransaction?: RpcProvider["waitForTransaction"];
  getTransactionReceipt?: RpcProvider["getTransactionReceipt"];
}

export interface ERC8004AccountLike {
  execute: (
    calls: Call | Call[],
    details?: unknown,
  ) => Promise<{ transaction_hash?: string; transactionHash?: string } | string>;
}

export interface ERC8004ClientOptions {
  network?: Network;
  rpcUrl?: string;
  provider?: ERC8004ProviderLike;
  account?: ERC8004AccountLike;
  registryOverrides?: Partial<ERC8004RegistrySet>;
}

export interface ERC8004InvokeResult {
  transactionHash: string;
  registry: ERC8004RegistryType;
  entrypoint: string;
  calldata: string[];
}

export interface ERC8004WaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface ERC8004WriteInput {
  entrypoint?: string;
  calldata: ERC8004CalldataValue[];
}

export class ERC8004ClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ERC8004ClientError";
  }
}

export class ERC8004WriteNotConfiguredError extends ERC8004ClientError {
  constructor() {
    super("ERC-8004 write operations require an account executor", "WRITE_NOT_CONFIGURED");
    this.name = "ERC8004WriteNotConfiguredError";
  }
}

export class ERC8004TransactionTimeoutError extends ERC8004ClientError {
  constructor(txHash: string, timeoutMs: number) {
    super(
      `Timed out waiting for transaction ${txHash} after ${timeoutMs}ms`,
      "TX_TIMEOUT",
    );
    this.name = "ERC8004TransactionTimeoutError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toBigIntOrNull(value: ERC8004CalldataValue): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^(0x[0-9a-fA-F]+|\d+)$/.test(normalized)) {
      return BigInt(normalized);
    }
  }
  return null;
}

function toUint256Calldata(value: ERC8004CalldataValue): [string, string] | null {
  const parsed = toBigIntOrNull(value);
  if (parsed === null) return null;
  const lowMask = (1n << 128n) - 1n;
  const low = parsed & lowMask;
  const high = parsed >> 128n;
  return [num.toHex(low), num.toHex(high)];
}

function extractTransactionHash(
  value: Awaited<ReturnType<ERC8004AccountLike["execute"]>>,
): string | null {
  if (typeof value === "string") return value;
  const txHash = value.transaction_hash || value.transactionHash;
  if (typeof txHash === "string" && txHash.length > 0) return txHash;
  return null;
}

/**
 * Registry addresses sourced from Cloak privacy infra research notes.
 */
export const ERC8004_REGISTRIES: Record<Network, ERC8004RegistrySet> = {
  mainnet: {
    identity:
      "0x33653298d42aca87f9c004c834c6830a08e8f1c0bd694faaa1412ec8fe77595",
    reputation:
      "0x698849defe3997eccd3dc5e096c01ae8f4fbc2e49e8d67efcb0b0642447944",
    validation:
      "0x3c2aae404b64ddf09f7ef07dfb4f723c9053443d35038263acf7d5d77efcd83",
  },
  sepolia: {
    identity:
      "0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631",
    reputation:
      "0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e",
    validation:
      "0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f",
  },
};

export function getERC8004Registries(network: Network): ERC8004RegistrySet {
  return ERC8004_REGISTRIES[network];
}

export function getERC8004RegistryAddress(
  network: Network,
  registry: ERC8004RegistryType,
): string {
  return ERC8004_REGISTRIES[network][registry];
}

export class ERC8004Client {
  private readonly provider: ERC8004ProviderLike;
  private readonly network: Network;
  private readonly account?: ERC8004AccountLike;
  private readonly registryOverrides: Partial<ERC8004RegistrySet>;

  constructor(options: ERC8004ClientOptions = {}) {
    this.network = options.network ?? "sepolia";
    this.provider =
      options.provider ??
      new RpcProvider({
        nodeUrl: options.rpcUrl ?? DEFAULT_RPC[this.network],
      });
    this.account = options.account;
    this.registryOverrides = options.registryOverrides ?? {};
  }

  getRegistryAddress(registry: ERC8004RegistryType): string {
    return (
      this.registryOverrides[registry] ||
      getERC8004RegistryAddress(this.network, registry)
    );
  }

  async call(
    registry: ERC8004RegistryType,
    entrypoint: string,
    calldata: ERC8004CalldataValue[] = [],
  ): Promise<string[]> {
    return this.provider.callContract({
      contractAddress: this.getRegistryAddress(registry),
      entrypoint,
      calldata: calldata.map((value) => num.toHex(value)),
    });
  }

  private async callWithFlexibleAgentId(
    registry: ERC8004RegistryType,
    entrypoint: string,
    agentId: ERC8004CalldataValue,
  ): Promise<string[] | null> {
    const uint256AgentId = toUint256Calldata(agentId);
    if (uint256AgentId) {
      try {
        return await this.provider.callContract({
          contractAddress: this.getRegistryAddress(registry),
          entrypoint,
          calldata: uint256AgentId,
        });
      } catch {
        // Try felt-style fallback below for deployments expecting a single felt.
      }
    }

    try {
      return await this.provider.callContract({
        contractAddress: this.getRegistryAddress(registry),
        entrypoint,
        calldata: [num.toHex(agentId)],
      });
    } catch {
      return null;
    }
  }

  async invoke(
    registry: ERC8004RegistryType,
    entrypoint: string,
    calldata: ERC8004CalldataValue[] = [],
    details?: unknown,
  ): Promise<ERC8004InvokeResult> {
    if (!this.account) {
      throw new ERC8004WriteNotConfiguredError();
    }

    const formattedCalldata = calldata.map((value) => num.toHex(value));
    const result = await this.account.execute(
      [
        {
          contractAddress: this.getRegistryAddress(registry),
          entrypoint,
          calldata: formattedCalldata,
        },
      ],
      details,
    );
    const txHash = extractTransactionHash(result);
    if (!txHash) {
      throw new ERC8004ClientError(
        "Failed to extract transaction hash from account.execute result",
        "MISSING_TX_HASH",
      );
    }
    return {
      transactionHash: txHash,
      registry,
      entrypoint,
      calldata: formattedCalldata,
    };
  }

  async waitForTransaction(
    txHash: string,
    options: ERC8004WaitOptions = {},
  ): Promise<unknown> {
    const timeoutMs = options.timeoutMs ?? 180_000;
    const pollIntervalMs = options.pollIntervalMs ?? 4_000;

    if (this.provider.waitForTransaction) {
      return this.provider.waitForTransaction(txHash, {
        retryInterval: pollIntervalMs,
        timeout: timeoutMs,
      } as never);
    }

    if (!this.provider.getTransactionReceipt) {
      throw new ERC8004ClientError(
        "Provider does not support waitForTransaction/getTransactionReceipt",
        "WAIT_UNSUPPORTED",
      );
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        return await this.provider.getTransactionReceipt(txHash);
      } catch {
        await sleep(pollIntervalMs);
      }
    }

    throw new ERC8004TransactionTimeoutError(txHash, timeoutMs);
  }

  async registerAgentOnchain(
    input: ERC8004WriteInput,
    details?: unknown,
  ): Promise<ERC8004InvokeResult> {
    return this.invoke(
      "identity",
      input.entrypoint ?? "register_agent",
      input.calldata,
      details,
    );
  }

  async updateAgentOnchain(
    input: ERC8004WriteInput,
    details?: unknown,
  ): Promise<ERC8004InvokeResult> {
    return this.invoke(
      "identity",
      input.entrypoint ?? "update_agent",
      input.calldata,
      details,
    );
  }

  async setAgentStatusOnchain(
    input: ERC8004WriteInput,
    details?: unknown,
  ): Promise<ERC8004InvokeResult> {
    return this.invoke(
      "identity",
      input.entrypoint ?? "set_agent_status",
      input.calldata,
      details,
    );
  }

  /**
   * Default Identity Registry wrapper.
   * Override `entrypoint` if your deployed ABI uses a different name.
   */
  async ownerOf(
    agentId: string | bigint | number,
    entrypoint = "owner_of",
  ): Promise<string | null> {
    try {
      const res = await this.callWithFlexibleAgentId(
        "identity",
        entrypoint,
        agentId,
      );
      if (!res) return null;
      return res[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Default Identity Registry wrapper.
   * Override `entrypoint` if your deployed ABI uses a different name.
   */
  async tokenUri(
    agentId: string | bigint | number,
    entrypoint = "token_uri",
  ): Promise<string | null> {
    try {
      const res = await this.callWithFlexibleAgentId(
        "identity",
        entrypoint,
        agentId,
      );
      if (!res) return null;
      return res[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Generic summary reader for reputation/validation contracts.
   * Useful while ABI variants are still being finalized across deployments.
   */
  async getSummary(
    registry: "reputation" | "validation",
    agentIdOrAddress: string | bigint | number,
    entrypoint = "get_summary",
  ): Promise<string[] | null> {
    try {
      return await this.call(registry, entrypoint, [agentIdOrAddress]);
    } catch {
      return null;
    }
  }
}
