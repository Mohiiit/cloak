import { describe, expect, it } from "vitest";
import type { ActivityRecord } from "../src/activity";
import {
  buildPortfolioBalanceView,
  quantizeToShieldedUnits,
  resolveAmountUnit,
  toActivityRecordView,
  toTokenAmountView,
} from "../src/presentation";

describe("presentation helpers", () => {
  it("keeps sub-cent ETH shielded unit precision in display output", () => {
    const ethUnit = toTokenAmountView("ETH", "1", "tongo_units");
    expect(ethUnit.erc20Display).toBe("0.000003");
    expect(ethUnit.erc20DisplayWithSymbol).toBe("0.000003 ETH");
  });

  it("quantizes STRK display amounts into shielded units with remainder", () => {
    const q = quantizeToShieldedUnits("STRK", "0.06", "erc20_display");

    expect(q.requested.erc20Display).toBe("0.06");
    expect(q.quantized.tongoUnits).toBe("1");
    expect(q.quantized.erc20Display).toBe("0.05");
    expect(q.remainderDisplay).toBe("0.01");
    expect(q.canRepresentInShieldedUnits).toBe(true);
    expect(q.hasRemainder).toBe(true);
  });

  it("quantizes ETH values with non-zero remainder below a shielded unit", () => {
    const q = quantizeToShieldedUnits("ETH", "0.000007", "erc20_display");

    expect(q.quantized.tongoUnits).toBe("2");
    expect(q.quantized.erc20Display).toBe("0.000006");
    expect(q.remainderDisplay).toBe("0.000001");
    expect(q.minimumShieldedUnitDisplay).toBe("0.000003 ETH");
  });

  it("builds portfolio balances for STRK/ETH/USDC in a single typed object", () => {
    const view = buildPortfolioBalanceView({
      STRK: {
        token: "STRK",
        publicErc20Wei: "1000000000000000000",
        shieldedAvailableTongoUnits: "20",
        shieldedPendingTongoUnits: "2",
      },
      ETH: {
        token: "ETH",
        publicErc20Wei: "100000000000000000",
        shieldedAvailableTongoUnits: "10",
        shieldedPendingTongoUnits: "1",
      },
      USDC: {
        token: "USDC",
        publicErc20Wei: "1234567",
        shieldedAvailableTongoUnits: "50",
        shieldedPendingTongoUnits: "5",
      },
    });

    expect(view.tokens).toHaveLength(3);
    expect(view.byToken.STRK.public.erc20Display).toBe("1");
    expect(view.byToken.STRK.shieldedTotal.erc20Display).toBe("1.1");
    expect(view.byToken.ETH.shieldedAvailable.erc20Display).toBe("0.00003");
    expect(view.byToken.USDC.public.erc20Display).toBe("1.2345");
  });

  it("maps activity record into frontend-ready typed view with swap breakdown", () => {
    const record: ActivityRecord = {
      id: "row_1",
      source: "transaction",
      wallet_address: "0xabc",
      tx_hash: "0xswap",
      type: "shielded_swap",
      token: "STRK",
      amount: "2",
      amount_unit: "tongo_units",
      status: "pending",
      account_type: "normal",
      network: "sepolia",
      created_at: "2026-02-21T00:00:00.000Z",
      swap: {
        provider: "avnu",
        sell_token: "STRK",
        buy_token: "ETH",
        sell_amount_wei: "100000000000000000",
        estimated_buy_amount_wei: "10000000000000",
        min_buy_amount_wei: "9000000000000",
        buy_actual_amount_wei: null,
      },
    };

    const view = toActivityRecordView(record);
    expect(view.token).toBe("STRK");
    expect(view.amount?.erc20Display).toBe("0.1");
    expect(view.swap?.sellAmount.erc20Display).toBe("0.1");
    expect(view.swap?.estimatedBuyAmount.erc20Display).toBe("0.00001");
    expect(view.swap?.minBuyAmount.erc20Display).toBe("0.000009");
  });

  it("resolves missing amount units consistently with transaction type", () => {
    expect(resolveAmountUnit("1.25 ETH", null, "transfer")).toBe("erc20_display");
    expect(resolveAmountUnit("1000", null, "transfer")).toBe("tongo_units");
    expect(resolveAmountUnit("0.5", null, "erc20_transfer")).toBe("erc20_display");
  });
});
