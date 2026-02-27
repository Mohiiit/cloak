import { afterEach, describe, expect, it, vi } from "vitest";
import { executeThroughStarkZapGateway } from "./starkzap-gateway";

const baseInput = {
  agentType: "swap_runner",
  action: "swap",
  params: { from_token: "USDC", to_token: "STRK", amount: "25" },
  operatorWallet: "0xoperator",
  serviceWallet: "0xservice",
  protocol: "starkzap-swap",
};

describe("starkzap gateway", () => {
  afterEach(() => {
    delete process.env.STARKZAP_LAYER_MODE;
    delete process.env.STARKZAP_LAYER_TARGET_URL;
    delete process.env.STARKZAP_LAYER_TARGET_API_KEY;
    delete process.env.STARKZAP_LAYER_RPC_METHOD;
    vi.restoreAllMocks();
  });

  it("throws when target url is missing", async () => {
    await expect(executeThroughStarkZapGateway(baseInput)).rejects.toThrow(
      /STARKZAP_LAYER_TARGET_URL is required/i,
    );
  });

  it("supports http mode and tx_hashes payload", async () => {
    process.env.STARKZAP_LAYER_MODE = "http";
    process.env.STARKZAP_LAYER_TARGET_URL = "https://starkzap.layer/execute";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tx_hashes: ["0xabc"],
          receipt: { upstream: true },
        }),
        { status: 200 },
      ),
    );

    const result = await executeThroughStarkZapGateway(baseInput);
    expect(result.mode).toBe("http");
    expect(result.txHashes).toEqual(["0xabc"]);
    expect(result.receipt.upstream).toBe(true);
  });

  it("supports jsonrpc mode and transaction_hash result", async () => {
    process.env.STARKZAP_LAYER_MODE = "jsonrpc";
    process.env.STARKZAP_LAYER_TARGET_URL = "https://starkzap.layer/rpc";
    process.env.STARKZAP_LAYER_RPC_METHOD = "starkzap_execute";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: {
            transaction_hash: "0xdef",
            receipt: { rpc: true },
          },
        }),
        { status: 200 },
      ),
    );

    const result = await executeThroughStarkZapGateway(baseInput);
    expect(result.mode).toBe("jsonrpc");
    expect(result.txHashes).toEqual(["0xdef"]);
    expect(result.receipt.rpc).toBe(true);
  });

  it("throws on jsonrpc error response", async () => {
    process.env.STARKZAP_LAYER_MODE = "jsonrpc";
    process.env.STARKZAP_LAYER_TARGET_URL = "https://starkzap.layer/rpc";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          error: {
            code: -32601,
            message: "Method not found",
          },
        }),
        { status: 200 },
      ),
    );

    await expect(executeThroughStarkZapGateway(baseInput)).rejects.toThrow(
      /starkzap layer rpc error: Method not found/i,
    );
  });
});
