import { beforeEach, describe, expect, it, vi } from "vitest";
import { X402ReplayStore } from "./replay-store";
import { X402ReconciliationWorker } from "./reconcile";
import { createRunRecord, listRunRecords } from "~~/lib/marketplace/runs-repo";
import { clearRunsStore } from "~~/lib/marketplace/runs-store";

describe("x402 reconciliation worker", () => {
  const replayStore = new X402ReplayStore();

  beforeEach(() => {
    replayStore.clearInMemory();
    clearRunsStore();
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
});
