import { describe, expect, it, vi } from "vitest";
import { executeWithBasicProtocols } from "./basic-protocol-adapter";

const baseInput = {
  agentType: "treasury_dispatcher",
  action: "dispatch_batch",
  params: {
    transfers: [
      {
        token: "0x1234",
        to: "0x9999",
        amount: "25",
      },
    ],
  },
  operatorWallet: "0xoperator",
  serviceWallet: "0xservice",
  protocol: "treasury",
};

describe("basic protocol adapter", () => {
  it("executes custom params.calls through provided account", async () => {
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xaaa" });
    const result = await executeWithBasicProtocols(
      {
        ...baseInput,
        params: {
          calls: [
            {
              contractAddress: "0x1234",
              entrypoint: "noop",
              calldata: ["0x1"],
            },
          ],
        },
      },
      process.env,
      {
        account: { execute },
      },
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("basic-protocol");
    expect(result.txHashes).toEqual(["0xaaa"]);
  });

  it("builds ERC20 transfer calls for dispatch_batch", async () => {
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xbbb" });
    await executeWithBasicProtocols(baseInput, process.env, {
      account: { execute },
    });
    const calls = execute.mock.calls[0]?.[0];
    expect(Array.isArray(calls)).toBe(true);
    expect(calls[0].entrypoint).toBe("transfer");
    expect(calls[0].contractAddress).toBe("0x1234");
  });

  it("fails swap action without router + calldata in basic mode", async () => {
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xccc" });
    await expect(
      executeWithBasicProtocols(
        {
          agentType: "swap_runner",
          action: "swap",
          params: {
            from_token: "USDC",
            to_token: "STRK",
            amount: "10",
          },
          operatorWallet: "0xoperator",
          serviceWallet: "0xservice",
          protocol: "swap",
        },
        process.env,
        { account: { execute } },
      ),
    ).rejects.toThrow(/params\.router must be a 0x-prefixed hex address/i);
  });

  it("builds real stake flow calls (approve + stake) for staking steward", async () => {
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xstake" });
    await executeWithBasicProtocols(
      {
        agentType: "staking_steward",
        action: "stake",
        params: {
          amount: "1.5",
          amount_unit: "strk",
          token: "STRK",
          staking_contract:
            "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1",
        },
        operatorWallet:
          "0x7f7d57934a34ee9357857488cc69a08af7976533874c4fea5a6dd433647d7b6",
        serviceWallet:
          "0x7f7d57934a34ee9357857488cc69a08af7976533874c4fea5a6dd433647d7b6",
        protocol: "staking",
      },
      process.env,
      { account: { execute } },
    );

    const calls = execute.mock.calls[0]?.[0];
    expect(Array.isArray(calls)).toBe(true);
    expect(calls[0].entrypoint).toBe("approve");
    expect(calls[1].entrypoint).toBe("stake");
    expect(calls[1].calldata[2]).toMatch(/^0x/i);
  });

  it("fails rebalance in basic mode without explicit calls", async () => {
    await expect(
      executeWithBasicProtocols(
        {
          agentType: "staking_steward",
          action: "rebalance",
          params: {
            from_pool: "0x1",
            to_pool: "0x2",
            amount: "1",
          },
          operatorWallet: "0xoperator",
          serviceWallet: "0xservice",
          protocol: "staking",
        },
        process.env,
        { account: { execute: vi.fn() } },
      ),
    ).rejects.toThrow(/rebalance is not supported in basic on-chain mode/i);
  });
});
