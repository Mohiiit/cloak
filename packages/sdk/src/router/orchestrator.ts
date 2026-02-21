import type { CanonicalAmount, SaveTransactionInput } from "../repositories";
import type { AccountType, TransactionType } from "../transactions";
import type {
  RouterCall,
  WardExecutionDecision,
  WardPolicySnapshot,
} from "./policy";

export interface RouteExecutionMeta {
  type: TransactionType;
  token: string;
  amount?: CanonicalAmount | null;
  recipient?: string | null;
  recipientName?: string | null;
  note?: string | null;
  network: string;
  platform?: string | null;
  directAccountType?: Exclude<AccountType, "ward">;
}

export interface RouteExecutionInput {
  walletAddress: string;
  calls: RouterCall[];
  meta: RouteExecutionMeta;
  wardAddress?: string;
  is2FAEnabled?: boolean;
  onStatusChange?: (status: string) => void;
  confirmOnChain?: boolean;
  executeDirect: () => Promise<unknown>;
  execute2FA?: () => Promise<{ approved: boolean; txHash?: string; error?: string }>;
  executeWardApproval?: (
    decision: WardExecutionDecision,
    snapshot: WardPolicySnapshot,
  ) => Promise<{ approved: boolean; txHash?: string; error?: string }>;
}

export interface RouteExecutionResult {
  txHash: string;
  route: "ward_direct" | "ward_approval" | "2fa" | "direct";
  decision?: WardExecutionDecision;
  snapshot?: WardPolicySnapshot;
}

export interface OrchestratorDeps {
  getWardPolicySnapshot: (wardAddress: string) => Promise<WardPolicySnapshot | null>;
  evaluateWardExecutionPolicy: (
    wardAddress: string,
    calls: RouterCall[],
  ) => Promise<WardExecutionDecision | null>;
  saveTransaction: (record: SaveTransactionInput) => Promise<unknown>;
  confirmTransaction: (txHash: string) => Promise<void>;
}

function extractTxHash(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const txHash = (value as any).txHash || (value as any).transaction_hash;
    if (typeof txHash === "string" && txHash.length > 0) return txHash;
  }
  throw new Error("Transaction executor did not return a transaction hash");
}

async function persistPendingTx(
  deps: OrchestratorDeps,
  input: RouteExecutionInput,
  txHash: string,
  accountType: AccountType,
): Promise<void> {
  await deps.saveTransaction({
    wallet_address: input.walletAddress,
    tx_hash: txHash,
    type: input.meta.type,
    token: input.meta.token,
    amount: input.meta.amount ?? null,
    recipient: input.meta.recipient ?? null,
    recipient_name: input.meta.recipientName ?? null,
    note: input.meta.note ?? null,
    status: "pending",
    account_type: accountType,
    network: input.meta.network,
    platform: input.meta.platform ?? null,
  });

  if (input.confirmOnChain !== false) {
    void deps.confirmTransaction(txHash).catch(() => {});
  }
}

export async function orchestrateExecution(
  deps: OrchestratorDeps,
  input: RouteExecutionInput,
): Promise<RouteExecutionResult> {
  if (input.wardAddress) {
    const snapshot = await deps.getWardPolicySnapshot(input.wardAddress);
    if (!snapshot) throw new Error("Ward policy snapshot not found");

    const decision = await deps.evaluateWardExecutionPolicy(
      input.wardAddress,
      input.calls,
    );
    if (!decision) throw new Error("Ward policy decision failed");

    const needsWardApproval = decision.needsGuardian || decision.needsWard2fa;
    if (!needsWardApproval) {
      input.onStatusChange?.("Executing ward transaction directly...");
      const txHash = extractTxHash(await input.executeDirect());
      await persistPendingTx(deps, input, txHash, "ward");
      return { txHash, route: "ward_direct", decision, snapshot };
    }

    if (!input.executeWardApproval) {
      throw new Error("Ward approval executor is required for guarded transactions");
    }

    input.onStatusChange?.("Requesting ward approval...");
    const approval = await input.executeWardApproval(decision, snapshot);
    if (!approval.approved || !approval.txHash) {
      throw new Error(approval.error || "Ward approval failed");
    }

    await persistPendingTx(deps, input, approval.txHash, "ward");
    return {
      txHash: approval.txHash,
      route: "ward_approval",
      decision,
      snapshot,
    };
  }

  if (input.is2FAEnabled) {
    if (!input.execute2FA) {
      throw new Error("2FA executor is required when 2FA is enabled");
    }
    input.onStatusChange?.("Waiting for 2FA approval...");
    const result = await input.execute2FA();
    if (!result.approved || !result.txHash) {
      throw new Error(result.error || "2FA approval failed");
    }
    await persistPendingTx(
      deps,
      input,
      result.txHash,
      input.meta.directAccountType || "normal",
    );
    return { txHash: result.txHash, route: "2fa" };
  }

  input.onStatusChange?.("Executing transaction...");
  const txHash = extractTxHash(await input.executeDirect());
  await persistPendingTx(
    deps,
    input,
    txHash,
    input.meta.directAccountType || "normal",
  );
  return { txHash, route: "direct" };
}
