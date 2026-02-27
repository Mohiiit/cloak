import { updateRunRecord, listRunRecords } from "~~/lib/marketplace/runs-repo";
import { getAgentProfileRecord } from "~~/lib/marketplace/agents-repo";
import {
  executeAgentRuntime,
  inferAgentType,
} from "~~/lib/marketplace/agents/runtime";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";
import { X402ReplayStore } from "./replay-store";
import { X402SettlementExecutor } from "./settlement";
import { checkAgentOnchainIdentity } from "../onchain-identity";

export interface X402ReconcileSummary {
  scannedPayments: number;
  paymentSettled: number;
  paymentPending: number;
  paymentFailed: number;
  paymentSkippedNoTxHash: number;
  scannedRuns: number;
  runsExecuted: number;
  runsFailed: number;
  runsStillPending: number;
}

function createDefaultSummary(): X402ReconcileSummary {
  return {
    scannedPayments: 0,
    paymentSettled: 0,
    paymentPending: 0,
    paymentFailed: 0,
    paymentSkippedNoTxHash: 0,
    scannedRuns: 0,
    runsExecuted: 0,
    runsFailed: 0,
    runsStillPending: 0,
  };
}

interface StoredRunIdentityContext {
  operator_wallet?: string | null;
  service_wallet?: string | null;
  onchain_enforced?: boolean;
  onchain_status?: string | null;
  onchain_owner?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  return address.toLowerCase().replace(/^0x0+/, "0x");
}

function readIdentityContextFromRun(
  run: Awaited<ReturnType<typeof listRunRecords>>[number],
): StoredRunIdentityContext | null {
  const paymentEvidence = asRecord(run.payment_evidence);
  if (!paymentEvidence) return null;
  const context = asRecord(paymentEvidence.identity_context);
  if (!context) return null;
  return context as StoredRunIdentityContext;
}

function resolveIdentityContextMismatchReason(input: {
  stored: StoredRunIdentityContext | null;
  operatorWallet: string | null;
  serviceWallet: string | null;
  onchainStatus: string | null;
  onchainOwner: string | null;
  onchainEnforced: boolean;
}): string | null {
  const stored = input.stored;
  if (!stored) return null;

  const storedOperator = normalizeAddress(stored.operator_wallet);
  const currentOperator = normalizeAddress(input.operatorWallet);
  if (storedOperator && currentOperator && storedOperator !== currentOperator) {
    return "operator_wallet_changed";
  }

  const storedService = normalizeAddress(stored.service_wallet);
  const currentService = normalizeAddress(input.serviceWallet);
  if (storedService && currentService && storedService !== currentService) {
    return "service_wallet_changed";
  }

  const storedStatus =
    typeof stored.onchain_status === "string" ? stored.onchain_status : null;
  if (
    storedStatus &&
    input.onchainStatus &&
    storedStatus !== input.onchainStatus
  ) {
    return "onchain_status_changed";
  }

  const storedOwner = normalizeAddress(stored.onchain_owner);
  const currentOwner = normalizeAddress(input.onchainOwner);
  if (storedOwner && currentOwner && storedOwner !== currentOwner) {
    return "onchain_owner_changed";
  }

  if (
    typeof stored.onchain_enforced === "boolean" &&
    stored.onchain_enforced !== input.onchainEnforced
  ) {
    return "onchain_enforcement_changed";
  }

  return null;
}

export class X402ReconciliationWorker {
  private readonly traceId: string;

  constructor(
    private readonly replayStore = new X402ReplayStore(),
    private readonly settlementExecutor = new X402SettlementExecutor({
      ...process.env,
      X402_VERIFY_ONCHAIN_SETTLEMENT: "true",
    }),
  ) {
    this.traceId = createTraceId("x402-reconcile");
  }

  async run(limit = 50): Promise<X402ReconcileSummary> {
    const summary = createDefaultSummary();
    await this.reconcilePayments(summary, limit);
    await this.reconcileRuns(summary, limit);
    logAgenticEvent({
      level: "info",
      event: "x402.reconcile.completed",
      traceId: this.traceId,
      metadata: summary as unknown as Record<string, unknown>,
    });
    return summary;
  }

  private async reconcilePayments(
    summary: X402ReconcileSummary,
    limit: number,
  ): Promise<void> {
    const pending = await this.replayStore.listPending(limit);
    for (const payment of pending) {
      summary.scannedPayments += 1;
      if (!payment.settlement_tx_hash) {
        summary.paymentSkippedNoTxHash += 1;
        continue;
      }
      const decision = await this.settlementExecutor.verifySettlementTxHash(
        payment.settlement_tx_hash,
      );
      if (decision.status === "settled") {
        await this.replayStore.markSettled(
          payment.replay_key,
          payment.payment_ref,
          payment.settlement_tx_hash,
        );
        summary.paymentSettled += 1;
        continue;
      }
      if (decision.status === "failed") {
        await this.replayStore.markRejected(
          payment.replay_key,
          payment.payment_ref,
          decision.reasonCode || "SETTLEMENT_FAILED",
        );
        summary.paymentFailed += 1;
        continue;
      }
      await this.replayStore.markPending(
        payment.replay_key,
        payment.payment_ref,
        payment.settlement_tx_hash,
      );
      summary.paymentPending += 1;
    }
  }

  private async reconcileRuns(
    summary: X402ReconcileSummary,
    limit: number,
  ): Promise<void> {
    const pendingRuns = await listRunRecords({
      status: "pending_payment",
      limit,
      offset: 0,
    });

    for (const run of pendingRuns) {
      summary.scannedRuns += 1;
      if (!run.payment_ref) {
        await updateRunRecord(run.id, {
          status: "failed",
          result: {
            error: "missing payment reference for pending_payment run",
          },
          payment_evidence: {
            ...(run.payment_evidence || {
              scheme: "cloak-shielded-x402",
              payment_ref: null,
              settlement_tx_hash: null,
            }),
            state: "failed",
          },
        });
        summary.runsFailed += 1;
        continue;
      }

      const payment = await this.replayStore.getByPaymentRef(run.payment_ref);
      if (!payment || payment.status === "pending") {
        summary.runsStillPending += 1;
        continue;
      }
      if (payment.status !== "settled") {
        await updateRunRecord(run.id, {
          status: "failed",
          settlement_tx_hash: payment.settlement_tx_hash,
          payment_evidence: {
            ...(run.payment_evidence || {
              scheme: "cloak-shielded-x402",
              payment_ref: run.payment_ref,
              settlement_tx_hash: run.settlement_tx_hash,
            }),
            settlement_tx_hash: payment.settlement_tx_hash,
            state: "failed",
          },
          result: {
            error: "payment did not settle",
            reason_code: payment.reason_code,
          },
        });
        summary.runsFailed += 1;
        continue;
      }

      const queued =
        (await updateRunRecord(run.id, {
          status: "queued",
          settlement_tx_hash: payment.settlement_tx_hash,
          payment_evidence: {
            ...(run.payment_evidence || {
              scheme: "cloak-shielded-x402",
              payment_ref: run.payment_ref,
              settlement_tx_hash: run.settlement_tx_hash,
            }),
            settlement_tx_hash: payment.settlement_tx_hash,
            state: "settled",
          },
        })) || run;

      const agentProfile = await getAgentProfileRecord(queued.agent_id);
      const agentType = agentProfile?.agent_type || inferAgentType(queued.agent_id);
      if (!agentType) {
        await updateRunRecord(queued.id, {
          status: "failed",
          result: {
            error: `unknown agent type for ${queued.agent_id}`,
          },
          payment_evidence: {
            ...(queued.payment_evidence || {
              scheme: "cloak-shielded-x402",
              payment_ref: queued.payment_ref,
              settlement_tx_hash: queued.settlement_tx_hash,
            }),
            state: "failed",
          },
        });
        summary.runsFailed += 1;
        continue;
      }

      const onchainIdentity = agentProfile
        ? await checkAgentOnchainIdentity({
            agentId: queued.agent_id,
            operatorWallet: agentProfile.operator_wallet,
          })
        : null;
      if (onchainIdentity?.enforced && !onchainIdentity.verified) {
        await updateRunRecord(queued.id, {
          status: "failed",
          result: {
            error: "agent on-chain identity mismatch during reconciliation",
            reason_code: "ONCHAIN_IDENTITY_MISMATCH",
            details: onchainIdentity.reason,
          },
          payment_evidence: {
            ...(queued.payment_evidence || {
              scheme: "cloak-shielded-x402",
              payment_ref: queued.payment_ref,
              settlement_tx_hash: queued.settlement_tx_hash,
            }),
            state: "failed",
          },
        });
        summary.runsFailed += 1;
        continue;
      }

      const storedIdentityContext = readIdentityContextFromRun(queued);
      const mismatchReason = resolveIdentityContextMismatchReason({
        stored: storedIdentityContext,
        operatorWallet: agentProfile?.operator_wallet || null,
        serviceWallet:
          agentProfile?.service_wallet ||
          process.env.CLOAK_AGENT_SERVICE_ADDRESS ||
          queued.hire_operator_wallet ||
          null,
        onchainStatus: onchainIdentity?.status || "skipped",
        onchainOwner: onchainIdentity?.owner || null,
        onchainEnforced: !!onchainIdentity?.enforced,
      });
      if (mismatchReason) {
        await updateRunRecord(queued.id, {
          status: "failed",
          result: {
            error:
              "x402 identity context no longer matches current ERC-8004 profile state",
            reason_code: "ONCHAIN_IDENTITY_CONTEXT_MISMATCH",
            details: mismatchReason,
          },
          payment_evidence: {
            ...(queued.payment_evidence || {
              scheme: "cloak-shielded-x402",
              payment_ref: queued.payment_ref,
              settlement_tx_hash: queued.settlement_tx_hash,
            }),
            state: "failed",
          },
        });
        summary.runsFailed += 1;
        continue;
      }

      const running = (await updateRunRecord(queued.id, { status: "running" })) || queued;
      const execution = await executeAgentRuntime({
        agentType,
        action: running.action,
        params: running.params || {},
        operatorWallet:
          running.hire_operator_wallet ||
          agentProfile?.operator_wallet ||
          "0x0",
        serviceWallet:
          agentProfile?.service_wallet ||
          process.env.CLOAK_AGENT_SERVICE_ADDRESS ||
          running.hire_operator_wallet ||
          "0x0",
      });

      await updateRunRecord(running.id, {
        status: execution.status === "completed" ? "completed" : "failed",
        execution_tx_hashes: execution.executionTxHashes,
        result: execution.result,
        payment_evidence: {
          ...(running.payment_evidence || {
            scheme: "cloak-shielded-x402",
            payment_ref: running.payment_ref,
            settlement_tx_hash: running.settlement_tx_hash,
          }),
          state: execution.status === "completed" ? "settled" : "failed",
        },
      });

      if (execution.status === "completed") {
        summary.runsExecuted += 1;
      } else {
        summary.runsFailed += 1;
      }
    }
  }
}
