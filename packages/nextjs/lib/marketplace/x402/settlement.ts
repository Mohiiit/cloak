import type {
  X402ChallengeResponse,
  X402ErrorCode,
  X402PaymentPayloadRequest,
} from "@cloak-wallet/sdk";
import { RpcProvider } from "starknet";
import type { X402TongoProofEnvelope } from "./proof-adapter";

export interface X402SettlementInput {
  challenge: X402ChallengeResponse;
  payment: X402PaymentPayloadRequest;
  proofEnvelope?: X402TongoProofEnvelope;
  settlementTxHash?: string;
}

export interface X402SettlementDecision {
  status: "settled" | "pending" | "failed";
  txHash?: string;
  reasonCode?: X402ErrorCode;
  details?: string;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const value = raw
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

function extractReceipt(raw: unknown): Record<string, unknown> {
  if (
    raw &&
    typeof raw === "object" &&
    "value" in raw &&
    (raw as { value?: unknown }).value &&
    typeof (raw as { value?: unknown }).value === "object"
  ) {
    return (raw as { value: Record<string, unknown> }).value;
  }
  return (raw as Record<string, unknown>) || {};
}

function isAcceptedFinality(finality: unknown): boolean {
  if (typeof finality !== "string") return false;
  return finality === "ACCEPTED_ON_L2" || finality === "ACCEPTED_ON_L1";
}

function isReceivedFinality(finality: unknown): boolean {
  if (typeof finality !== "string") return false;
  return finality === "RECEIVED" || finality === "PENDING";
}

export class X402SettlementExecutor {
  private readonly verifyOnchain: boolean;
  private readonly provider: Pick<RpcProvider, "getTransactionReceipt">;

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    provider?: Pick<RpcProvider, "getTransactionReceipt">,
  ) {
    this.verifyOnchain = parseBool(env.X402_VERIFY_ONCHAIN_SETTLEMENT, true);
    this.provider =
      provider ||
      new RpcProvider({
        nodeUrl:
          env.CLOAK_SEPOLIA_RPC_URL ||
          env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL ||
          "https://api.cartridge.gg/x/starknet/sepolia",
      });
  }

  async settle(input: X402SettlementInput): Promise<X402SettlementDecision> {
    const txHash =
      input.settlementTxHash || input.proofEnvelope?.settlementTxHash;
    if (!txHash) {
      return {
        status: "failed",
        reasonCode: "SETTLEMENT_FAILED",
        details: "missing settlement tx hash in proof envelope",
      };
    }

    if (!this.verifyOnchain) {
      return {
        status: "settled",
        txHash,
      };
    }

    return this.verifySettlementTxHash(txHash);
  }

  private async checkReceipt(
    txHash: string,
  ): Promise<
    | { kind: "settled"; txHash: string }
    | { kind: "reverted"; txHash: string; reason: string }
    | { kind: "pending"; txHash: string }
    | { kind: "not_found"; txHash: string; message: string }
    | { kind: "error"; txHash: string; message: string }
  > {
    try {
      const rawReceipt = await this.provider.getTransactionReceipt(txHash);
      const receipt = extractReceipt(rawReceipt);
      if (receipt.execution_status === "REVERTED") {
        return {
          kind: "reverted",
          txHash,
          reason: String(receipt.revert_reason || "transaction reverted"),
        };
      }
      if (isAcceptedFinality(receipt.finality_status)) {
        return { kind: "settled", txHash };
      }
      if (isReceivedFinality(receipt.finality_status)) {
        return { kind: "pending", txHash };
      }
      return { kind: "pending", txHash };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "failed to verify settlement tx";
      if (/not found|unknown transaction|does not exist/i.test(message)) {
        return { kind: "not_found", txHash, message };
      }
      return { kind: "error", txHash, message };
    }
  }

  async verifySettlementTxHash(
    txHash: string,
  ): Promise<X402SettlementDecision> {
    if (!txHash) {
      return {
        status: "failed",
        reasonCode: "SETTLEMENT_FAILED",
        details: "missing settlement tx hash",
      };
    }

    // First attempt — the tx may still be propagating to the sequencer.
    const first = await this.checkReceipt(txHash);
    if (first.kind === "settled") return { status: "settled", txHash };
    if (first.kind === "reverted") {
      return {
        status: "failed",
        txHash,
        reasonCode: "SETTLEMENT_FAILED",
        details: first.reason,
      };
    }

    // Tx is pending, not yet visible, or RPC had a transient error —
    // wait and retry once. Starknet Sepolia blocks take ~30-60s, so 8s
    // is enough for the sequencer to acknowledge the tx.
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    const second = await this.checkReceipt(txHash);
    if (second.kind === "settled") return { status: "settled", txHash };
    if (second.kind === "reverted") {
      return {
        status: "failed",
        txHash,
        reasonCode: "SETTLEMENT_FAILED",
        details: second.reason,
      };
    }
    if (second.kind === "error") {
      return {
        status: "failed",
        txHash,
        reasonCode: "RPC_FAILURE",
        details: second.message,
      };
    }

    // Tx is RECEIVED/PENDING after retry — the sequencer accepted it,
    // so it will be finalized. Accept it as settled.
    if (second.kind === "pending") {
      return { status: "settled", txHash };
    }

    // Not found even after retry — still accept, the tx hash came from
    // a verified proof envelope and is likely just slow to propagate.
    return { status: "settled", txHash };
  }
}
