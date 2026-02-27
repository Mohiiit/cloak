import { beforeEach, describe, expect, it, vi } from "vitest";
import { X402ReplayStore } from "./replay-store";
import { X402ReconciliationWorker } from "./reconcile";
import {
  createRunRecord,
  listRunRecords,
  updateRunRecord,
} from "~~/lib/marketplace/runs-repo";
import { clearRunsStore } from "~~/lib/marketplace/runs-store";
import {
  clearAgentProfiles,
  upsertAgentProfile,
} from "~~/lib/marketplace/agents-store";

vi.mock("~~/lib/marketplace/agents/runtime", () => ({
  executeAgentRuntime: vi.fn().mockResolvedValue({
    status: "completed",
    executionTxHashes: ["0xexec"],
    result: {
      provider: "basic-protocol",
      protocol: "basic-staking",
    },
  }),
  inferAgentType: vi.fn().mockImplementation((agentId: string) => {
    if (agentId.includes("swap")) return "swap_runner";
    if (agentId.includes("treasury")) return "treasury_dispatcher";
    return "staking_steward";
  }),
}));

describe("x402 reconciliation worker", () => {
  const replayStore = new X402ReplayStore();

  beforeEach(() => {
    replayStore.clearInMemory();
    clearRunsStore();
    clearAgentProfiles();
  });

  it("settles pending payments and executes pending runs", async () => {
    await replayStore.registerPending("rk_reconcile_1", "pay_rk_reconcile_1");
    await replayStore.markPending(
      "rk_reconcile_1",
      "pay_rk_reconcile_1",
      "0x1234",
    );

    const run = await createRunRecord({
      hireId: "hire_reconcile_1",
      agentId: "staking_steward",
      hireOperatorWallet: "0xoperator",
      action: "stake",
      params: { amount: "25" },
      billable: true,
      initialStatus: "pending_payment",
      paymentRef: "pay_rk_reconcile_1",
      settlementTxHash: "0x1234",
    });
    expect(run.status).toBe("pending_payment");

    const settlementExecutor = {
      verifySettlementTxHash: vi.fn().mockResolvedValue({
        status: "settled",
        txHash: "0x1234",
      }),
    };

    const worker = new X402ReconciliationWorker(
      replayStore,
      settlementExecutor as any,
    );
    const summary = await worker.run(20);
    expect(summary.paymentSettled).toBeGreaterThanOrEqual(1);
    expect(summary.runsExecuted).toBeGreaterThanOrEqual(1);

    const runs = await listRunRecords({
      paymentRef: "pay_rk_reconcile_1",
      limit: 5,
      offset: 0,
    });
    expect(runs[0]?.status).toBe("completed");
    expect(runs[0]?.execution_tx_hashes?.length).toBeGreaterThan(0);
  });

  it("keeps runs in pending_payment while settlement is still pending", async () => {
    await replayStore.registerPending("rk_reconcile_2", "pay_rk_reconcile_2");
    await replayStore.markPending(
      "rk_reconcile_2",
      "pay_rk_reconcile_2",
      "0x5678",
    );
    await createRunRecord({
      hireId: "hire_reconcile_2",
      agentId: "swap_runner",
      hireOperatorWallet: "0xoperator",
      action: "swap",
      params: {
        from_token: "USDC",
        to_token: "STRK",
        amount: "10",
      },
      billable: true,
      initialStatus: "pending_payment",
      paymentRef: "pay_rk_reconcile_2",
      settlementTxHash: "0x5678",
    });

    const settlementExecutor = {
      verifySettlementTxHash: vi.fn().mockResolvedValue({
        status: "pending",
        txHash: "0x5678",
      }),
    };

    const worker = new X402ReconciliationWorker(
      replayStore,
      settlementExecutor as any,
    );
    const summary = await worker.run(20);
    expect(summary.paymentPending).toBeGreaterThanOrEqual(1);
    expect(summary.runsStillPending).toBeGreaterThanOrEqual(1);

    const runs = await listRunRecords({
      paymentRef: "pay_rk_reconcile_2",
      limit: 5,
      offset: 0,
    });
    expect(runs[0]?.status).toBe("pending_payment");
  });

  it("fails pending runs when stored identity context drifts before execution", async () => {
    upsertAgentProfile({
      agent_id: "staking_steward",
      name: "Staking Steward",
      description: "staking",
      agent_type: "staking_steward",
      capabilities: ["stake"],
      endpoints: ["https://agents.example/staking"],
      endpoint_proofs: [
        {
          endpoint: "https://agents.example/staking",
          nonce: "nonce_reconcile_context",
          digest: "d".repeat(64),
        },
      ],
      pricing: {
        mode: "per_run",
        amount: "1",
        token: "STRK",
      },
      operator_wallet: "0xagent",
      service_wallet: "0xface",
      status: "active",
    });

    await replayStore.registerPending("rk_reconcile_3", "pay_rk_reconcile_3");
    await replayStore.markPending(
      "rk_reconcile_3",
      "pay_rk_reconcile_3",
      "0x9999",
    );

    const run = await createRunRecord({
      hireId: "hire_reconcile_3",
      agentId: "staking_steward",
      hireOperatorWallet: "0xoperator",
      action: "stake",
      params: { amount: "25", pool: "0xpool" },
      billable: true,
      initialStatus: "pending_payment",
      paymentRef: "pay_rk_reconcile_3",
      settlementTxHash: "0x9999",
    });

    await updateRunRecord(run.id, {
      payment_evidence: {
        ...(run.payment_evidence || {
          scheme: "cloak-shielded-x402",
          payment_ref: run.payment_ref,
          settlement_tx_hash: run.settlement_tx_hash,
        }),
        identity_context: {
          hire_id: "hire_reconcile_3",
          agent_id: "staking_steward",
          action: "stake",
          operator_wallet: "0xagent",
          service_wallet: "0xbeef",
          onchain_enforced: false,
          onchain_status: "skipped",
          onchain_owner: null,
          onchain_reason: null,
          onchain_checked_at: null,
        },
      } as any,
    });

    const settlementExecutor = {
      verifySettlementTxHash: vi.fn().mockResolvedValue({
        status: "settled",
        txHash: "0x9999",
      }),
    };

    const worker = new X402ReconciliationWorker(
      replayStore,
      settlementExecutor as any,
    );
    const summary = await worker.run(20);
    expect(summary.runsFailed).toBeGreaterThanOrEqual(1);

    const runs = await listRunRecords({
      paymentRef: "pay_rk_reconcile_3",
      limit: 5,
      offset: 0,
    });
    expect(runs[0]?.status).toBe("failed");
    expect(runs[0]?.result?.reason_code).toBe(
      "ONCHAIN_IDENTITY_CONTEXT_MISMATCH",
    );
  });
});
