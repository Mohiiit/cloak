import { describe, expect, it, vi, afterEach } from "vitest";
import type { CloakApiClient } from "../src/api-client";
import type { SwapResponse } from "../src/types/api";
import {
  getSwapExecutions,
  saveSwapExecution,
  updateSwapExecution,
} from "../src/swaps";

function mockClient(overrides: Partial<CloakApiClient> = {}): CloakApiClient {
  return {
    saveSwap: vi.fn(),
    updateSwap: vi.fn(),
    updateSwapByExecutionId: vi.fn(),
    getSwaps: vi.fn().mockResolvedValue([]),
    getSwapSteps: vi.fn().mockResolvedValue([]),
    upsertSwapStep: vi.fn(),
    ...overrides,
  } as unknown as CloakApiClient;
}

describe("swaps.storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves normalized swap execution rows", async () => {
    const saveSwapMock = vi.fn().mockResolvedValue({
      id: "1",
      execution_id: "swap_exec_1",
      wallet_address: "0xabc",
      ward_address: "0xdef",
      tx_hash: "0xtx",
      primary_tx_hash: "0xtx",
      tx_hashes: null,
      provider: "avnu",
      sell_token: "STRK",
      buy_token: "ETH",
      sell_amount_wei: "100",
      estimated_buy_amount_wei: "50",
      min_buy_amount_wei: "45",
      buy_actual_amount_wei: null,
      failure_step_key: null,
      failure_reason: null,
      route_meta: null,
      status: "pending",
      error_message: null,
      created_at: "2026-02-21T00:00:00.000Z",
    } satisfies SwapResponse);

    const client = mockClient({ saveSwap: saveSwapMock });

    await saveSwapExecution(
      {
        execution_id: "swap_exec_1",
        wallet_address: "0x000abc",
        ward_address: "0x000def",
        tx_hash: "0xtx",
        provider: "avnu",
        sell_token: "STRK",
        buy_token: "ETH",
        sell_amount_wei: "100",
        estimated_buy_amount_wei: "50",
        min_buy_amount_wei: "45",
        buy_actual_amount_wei: null,
        status: "pending",
        error_message: null,
      },
      client,
    );

    expect(saveSwapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet_address: "0xabc",
        ward_address: "0xdef",
      }),
    );
  });

  it("updates swap execution rows by tx hash", async () => {
    const updateSwapMock = vi.fn().mockResolvedValue(undefined);
    const client = mockClient({ updateSwap: updateSwapMock });

    await updateSwapExecution("0xtx", { status: "failed", error_message: "boom" }, client);

    expect(updateSwapMock).toHaveBeenCalledWith(
      "0xtx",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("fetches swap rows via API client", async () => {
    const getSwapsMock = vi.fn().mockResolvedValue([
      {
        id: "1",
        execution_id: "swap_1",
        wallet_address: "0xguardian",
        ward_address: null,
        tx_hash: "0xswap",
        primary_tx_hash: "0xswap",
        tx_hashes: null,
        provider: "avnu",
        sell_token: "STRK",
        buy_token: "ETH",
        sell_amount_wei: "100",
        estimated_buy_amount_wei: "50",
        min_buy_amount_wei: "45",
        buy_actual_amount_wei: null,
        failure_step_key: null,
        failure_reason: null,
        route_meta: null,
        status: "pending",
        error_message: null,
        created_at: "2026-02-21T00:00:00.000Z",
      } satisfies SwapResponse,
    ]);

    const client = mockClient({ getSwaps: getSwapsMock });

    const rows = await getSwapExecutions("0xguardian", 20, client);
    expect(rows).toHaveLength(1);
    expect(rows[0].tx_hash).toBe("0xswap");
    expect(getSwapsMock).toHaveBeenCalledWith("0xguardian", { limit: 20 });
  });
});
