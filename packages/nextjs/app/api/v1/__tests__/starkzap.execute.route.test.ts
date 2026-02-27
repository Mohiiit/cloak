// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../marketplace/starkzap/execute/route";

const payload = {
  agentType: "swap_runner",
  action: "swap",
  params: { from_token: "USDC", to_token: "STRK", amount: "25" },
  operatorWallet: "0xoperator",
  serviceWallet: "0xservice",
  protocol: "starkzap-swap",
};

describe("POST /api/v1/marketplace/starkzap/execute", () => {
  afterEach(() => {
    delete process.env.STARKZAP_EXECUTOR_API_KEY;
    delete process.env.STARKZAP_LAYER_MODE;
    delete process.env.STARKZAP_LAYER_TARGET_URL;
    delete process.env.STARKZAP_LAYER_TARGET_API_KEY;
    delete process.env.STARKZAP_LAYER_RPC_METHOD;
    vi.restoreAllMocks();
  });

  it("rejects unauthorized request when secret is configured", async () => {
    process.env.STARKZAP_EXECUTOR_API_KEY = "secret_1";
    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/starkzap/execute",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 502 when gateway target is missing", async () => {
    process.env.STARKZAP_EXECUTOR_API_KEY = "secret_2";
    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/starkzap/execute",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer secret_2",
        },
        body: JSON.stringify(payload),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("STARKZAP_EXECUTION_FAILED");
    expect(String(json.error)).toMatch(/STARKZAP_LAYER_TARGET_URL is required/i);
  });

  it("returns tx_hashes when gateway succeeds", async () => {
    process.env.STARKZAP_EXECUTOR_API_KEY = "secret_3";
    process.env.STARKZAP_LAYER_TARGET_URL = "https://starkzap.layer/execute";
    process.env.STARKZAP_LAYER_MODE = "http";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tx_hashes: ["0x1234"],
          receipt: { provider_receipt: true },
        }),
        { status: 200 },
      ),
    );

    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/starkzap/execute",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer secret_3",
        },
        body: JSON.stringify(payload),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json.provider).toBe("starkzap");
    expect(json.tx_hashes).toEqual(["0x1234"]);
    expect(json.receipt.gateway_mode).toBe("http");
  });
});
