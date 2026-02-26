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
  const value = raw.trim().toLowerCase();
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

function isPendingFinality(finality: unknown): boolean {
  if (typeof finality !== "string") return false;
  return finality === "RECEIVED" || finality === "PENDING";
}

export class X402SettlementExecutor {
  private readonly verifyOnchain: boolean;
  private readonly allowLegacySettlement: boolean;
  private readonly provider: Pick<RpcProvider, "getTransactionReceipt">;

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    provider?: Pick<RpcProvider, "getTransactionReceipt">,
  ) {
    this.verifyOnchain = parseBool(env.X402_VERIFY_ONCHAIN_SETTLEMENT, false);
    this.allowLegacySettlement = parseBool(
      env.X402_LEGACY_SETTLEMENT_COMPAT,
      true,
    );
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
      if (this.allowLegacySettlement) {
        const fallbackTxHash = `0x${Buffer.from(
          `legacy-${input.payment.replayKey}`,
        )
          .toString("hex")
          .slice(0, 62)}`;
        return {
          status: "settled",
          txHash: fallbackTxHash,
          details: "legacy settlement compatibility mode",
        };
      }
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

    try {
      const rawReceipt = await this.provider.getTransactionReceipt(txHash);
      const receipt = extractReceipt(rawReceipt);
      const executionStatus = receipt.execution_status;
      const finalityStatus = receipt.finality_status;
      if (executionStatus === "REVERTED") {
        return {
          status: "failed",
          txHash,
          reasonCode: "SETTLEMENT_FAILED",
          details: String(receipt.revert_reason || "transaction reverted"),
        };
      }
      if (isAcceptedFinality(finalityStatus)) {
        return {
          status: "settled",
          txHash,
        };
      }
      if (isPendingFinality(finalityStatus)) {
        return {
          status: "pending",
          txHash,
        };
      }
      return {
        status: "pending",
        txHash,
        reasonCode: "SETTLEMENT_FAILED",
        details: `unexpected finality status: ${String(finalityStatus || "unknown")}`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "failed to verify settlement tx";
      if (/not found|unknown transaction|does not exist/i.test(message)) {
        return {
          status: "pending",
          txHash,
          reasonCode: "SETTLEMENT_FAILED",
          details: message,
        };
      }
      return {
        status: "failed",
        txHash,
        reasonCode: "RPC_FAILURE",
        details: message,
      };
    }
  }
}
