import { updateRunRecord, listRunRecords } from "~~/lib/marketplace/runs-repo";
import { getAgentProfileRecord } from "~~/lib/marketplace/agents-repo";
import {
  executeAgentRuntime,
  inferAgentType,
} from "~~/lib/marketplace/agents/runtime";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";
import { X402ReplayStore } from "./replay-store";
import { X402SettlementExecutor } from "./settlement";

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

export class X402ReconciliationWorker {
  private readonly traceId: string;

  constructor(
    private readonly replayStore = new X402ReplayStore(),
    private readonly settlementExecutor = new X402SettlementExecutor({
      ...process.env,
      X402_VERIFY_ONCHAIN_SETTLEMENT: "true",
      X402_LEGACY_SETTLEMENT_COMPAT: "false",
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
