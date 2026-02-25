// @vitest-environment node

import { describe, expect, it } from "vitest";
import { GET } from "../marketplace/payments/x402/metrics/route";

describe("GET /api/v1/marketplace/payments/x402/metrics", () => {
  it("returns x402 metric snapshot", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.metrics).toBeTruthy();
    expect(typeof json.metrics.challenge_issued).toBe("number");
    expect(typeof json.metrics.paywall_required).toBe("number");
  });
});

