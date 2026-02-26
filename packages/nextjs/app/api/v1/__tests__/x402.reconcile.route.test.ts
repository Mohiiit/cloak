// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../marketplace/payments/x402/reconcile/route";
import { X402ReconciliationWorker } from "~~/lib/marketplace/x402/reconcile";

describe("POST /api/v1/marketplace/payments/x402/reconcile", () => {
  beforeEach(() => {
    delete process.env.X402_RECONCILE_SECRET;
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("rejects requests without reconciliation secret", async () => {
    process.env.X402_RECONCILE_SECRET = "secret_1";
    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/reconcile",
      {
        method: "POST",
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("runs reconciliation with valid bearer token", async () => {
    process.env.X402_RECONCILE_SECRET = "secret_2";
    vi.spyOn(X402ReconciliationWorker.prototype, "run").mockResolvedValue({
      scannedPayments: 1,
      paymentSettled: 1,
      paymentPending: 0,
      paymentFailed: 0,
      paymentSkippedNoTxHash: 0,
      scannedRuns: 1,
      runsExecuted: 1,
      runsFailed: 0,
      runsStillPending: 0,
    });

    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/reconcile?limit=25",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer secret_2",
        },
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.summary.paymentSettled).toBe(1);
    expect(json.summary.runsExecuted).toBe(1);
  });
});
