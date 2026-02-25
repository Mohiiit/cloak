// @vitest-environment node

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../marketplace/payments/x402/challenge/route";

describe("POST /api/v1/marketplace/payments/x402/challenge", () => {
  it("returns 400 if recipient is missing", async () => {
    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/challenge",
      {
        method: "POST",
        body: JSON.stringify({ token: "STRK" }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("recipient");
  });

  it("returns a signed challenge response", async () => {
    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/challenge",
      {
        method: "POST",
        body: JSON.stringify({
          recipient: "0xabc123",
          token: "STRK",
          minAmount: "123",
          context: { route: "/api/v1/marketplace/runs" },
        }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-x402-challenge")).toBeTruthy();
    expect(res.headers.get("x-agentic-trace-id")).toBeTruthy();

    const json = await res.json();
    expect(json.challenge.scheme).toBe("cloak-shielded-x402");
    expect(json.challenge.signature).toBeTruthy();
    expect(json.challenge.recipient).toBe("0xabc123");
  });
});

