import { describe, it, expect } from "vitest";
import { TOKENS } from "../src/tokens";
import {
  evaluateWardExecutionPolicy,
  parseSpendFromCalls,
  type WardPolicySnapshot,
  type RouterCall,
} from "../src/router";

function makeSnapshot(overrides: Partial<WardPolicySnapshot> = {}): WardPolicySnapshot {
  return {
    wardAddress: "0x123",
    guardianAddress: "0x999",
    wardHas2fa: false,
    guardianHas2fa: false,
    requireGuardianForAll: false,
    maxPerTxn: 0n,
    dailyLimit24h: 0n,
    spent24h: 0n,
    ...overrides,
  };
}

function tokenTransfer(amount: bigint): RouterCall {
  return {
    contractAddress: TOKENS.STRK.erc20Address,
    entrypoint: "transfer",
    calldata: ["0xabc", amount.toString(), "0x0"],
  };
}

describe("router policy evaluation", () => {
  it("allows ward tx within per-tx and daily limits", () => {
    const snapshot = makeSnapshot({
      maxPerTxn: 100n,
      dailyLimit24h: 500n,
      spent24h: 100n,
    });
    const decision = evaluateWardExecutionPolicy(snapshot, [tokenTransfer(50n)]);

    expect(decision.needsGuardian).toBe(false);
    expect(decision.reasons).toEqual([]);
    expect(decision.evaluatedSpend).toBe(50n);
    expect(decision.projectedSpent24h).toBe(150n);
  });

  it("requires guardian when max_per_txn is exceeded", () => {
    const snapshot = makeSnapshot({ maxPerTxn: 40n });
    const decision = evaluateWardExecutionPolicy(snapshot, [tokenTransfer(50n)]);

    expect(decision.needsGuardian).toBe(true);
    expect(decision.reasons).toContain("EXCEEDS_MAX_PER_TXN");
  });

  it("requires guardian when projected 24h usage exceeds daily limit", () => {
    const snapshot = makeSnapshot({
      dailyLimit24h: 120n,
      spent24h: 90n,
    });
    const decision = evaluateWardExecutionPolicy(snapshot, [tokenTransfer(50n)]);

    expect(decision.needsGuardian).toBe(true);
    expect(decision.reasons).toContain("EXCEEDS_DAILY_LIMIT");
  });

  it("allows exact boundary values for max_per_txn and daily limit", () => {
    const snapshot = makeSnapshot({
      maxPerTxn: 50n,
      dailyLimit24h: 150n,
      spent24h: 100n,
    });
    const decision = evaluateWardExecutionPolicy(snapshot, [tokenTransfer(50n)]);

    expect(decision.needsGuardian).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  it("treats daily limit of zero as unlimited", () => {
    const snapshot = makeSnapshot({
      maxPerTxn: 0n,
      dailyLimit24h: 0n,
      spent24h: 9_999_999n,
    });
    const decision = evaluateWardExecutionPolicy(snapshot, [tokenTransfer(5_000_000n)]);

    expect(decision.needsGuardian).toBe(false);
  });

  it("forces guardian approval for unknown external calls", () => {
    const snapshot = makeSnapshot();
    const decision = evaluateWardExecutionPolicy(snapshot, [
      { contractAddress: "0xdeadbeef", entrypoint: "do_something", calldata: [] },
    ]);

    expect(decision.needsGuardian).toBe(true);
    expect(decision.reasons).toEqual(["UNKNOWN_SPEND"]);
    expect(decision.evaluatedSpend).toBeNull();
  });

  it("respects require_guardian_for_all except for pure self-calls", () => {
    const snapshot = makeSnapshot({
      requireGuardianForAll: true,
      guardianHas2fa: true,
    });

    const guarded = evaluateWardExecutionPolicy(snapshot, [tokenTransfer(1n)]);
    expect(guarded.needsGuardian).toBe(true);
    expect(guarded.reasons).toEqual(["REQUIRE_GUARDIAN_FOR_ALL"]);
    expect(guarded.needsGuardian2fa).toBe(true);

    const selfOnly = evaluateWardExecutionPolicy(snapshot, [
      { contractAddress: snapshot.wardAddress, entrypoint: "set_secondary_key", calldata: [] },
    ]);
    expect(selfOnly.needsGuardian).toBe(false);
    expect(selfOnly.reasons).toEqual([]);
  });

  it("parses approve calls as spend and ignores non-spend selectors on known tokens", () => {
    const snapshot = makeSnapshot();
    const parsed = parseSpendFromCalls(snapshot, [
      {
        contractAddress: TOKENS.STRK.erc20Address,
        entrypoint: "approve",
        calldata: ["0xabc", "25", "0"],
      },
      {
        contractAddress: TOKENS.STRK.erc20Address,
        entrypoint: "balance_of",
        calldata: ["0xabc"],
      },
    ]);

    expect(parsed.unknown).toBe(false);
    expect(parsed.spend).toBe(25n);
  });
});
