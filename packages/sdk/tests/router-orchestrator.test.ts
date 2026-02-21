import { describe, it, expect, vi } from "vitest";
import { orchestrateExecution, type OrchestratorDeps } from "../src/router";
import type { WardPolicySnapshot } from "../src/router";

function makeDeps(
  overrides: Partial<OrchestratorDeps> = {},
): OrchestratorDeps & {
  saveSpy: ReturnType<typeof vi.fn>;
  confirmSpy: ReturnType<typeof vi.fn>;
} {
  const snapshot: WardPolicySnapshot = {
    wardAddress: "0xward",
    guardianAddress: "0xguardian",
    wardHas2fa: false,
    guardianHas2fa: false,
    requireGuardianForAll: false,
    maxPerTxn: 100n,
    dailyLimit24h: 500n,
    spent24h: 0n,
  };

  const saveSpy = vi.fn().mockResolvedValue(undefined);
  const confirmSpy = vi.fn().mockResolvedValue(undefined);

  return {
    getWardPolicySnapshot: vi.fn().mockResolvedValue(snapshot),
    evaluateWardExecutionPolicy: vi.fn().mockResolvedValue({
      needsGuardian: false,
      needsWard2fa: false,
      needsGuardian2fa: false,
      reasons: [],
      evaluatedSpend: 10n,
      projectedSpent24h: 10n,
    }),
    saveTransaction: saveSpy,
    confirmTransaction: confirmSpy,
    ...overrides,
    saveSpy,
    confirmSpy,
  };
}

describe("orchestrateExecution", () => {
  it("routes ward tx directly when guardian is not required", async () => {
    const deps = makeDeps();
    const executeDirect = vi.fn().mockResolvedValue({ txHash: "0xabc" });

    const result = await orchestrateExecution(deps, {
      walletAddress: "0xward",
      wardAddress: "0xward",
      calls: [],
      meta: {
        type: "transfer",
        token: "STRK",
        network: "sepolia",
      },
      executeDirect,
    });

    expect(result.route).toBe("ward_direct");
    expect(result.txHash).toBe("0xabc");
    expect(executeDirect).toHaveBeenCalled();
    expect(deps.saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ account_type: "ward", tx_hash: "0xabc" }),
    );
    expect(deps.confirmSpy).toHaveBeenCalledWith("0xabc");
  });

  it("routes ward tx via guardian approval when policy requires it", async () => {
    const deps = makeDeps({
      evaluateWardExecutionPolicy: vi.fn().mockResolvedValue({
        needsGuardian: true,
        needsWard2fa: false,
        needsGuardian2fa: true,
        reasons: ["EXCEEDS_MAX_PER_TXN"],
        evaluatedSpend: 150n,
        projectedSpent24h: 150n,
      }),
    });
    const executeWardApproval = vi
      .fn()
      .mockResolvedValue({ approved: true, txHash: "0xguarded" });

    const result = await orchestrateExecution(deps, {
      walletAddress: "0xward",
      wardAddress: "0xward",
      calls: [],
      meta: {
        type: "transfer",
        token: "STRK",
        network: "sepolia",
      },
      executeDirect: vi.fn(),
      executeWardApproval,
    });

    expect(result.route).toBe("ward_approval");
    expect(result.txHash).toBe("0xguarded");
    expect(executeWardApproval).toHaveBeenCalled();
    expect(deps.saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ account_type: "ward", tx_hash: "0xguarded" }),
    );
  });

  it("routes ward tx via approval when ward 2FA is required", async () => {
    const deps = makeDeps({
      evaluateWardExecutionPolicy: vi.fn().mockResolvedValue({
        needsGuardian: false,
        needsWard2fa: true,
        needsGuardian2fa: false,
        reasons: [],
        evaluatedSpend: 50n,
        projectedSpent24h: 50n,
      }),
    });
    const executeWardApproval = vi
      .fn()
      .mockResolvedValue({ approved: true, txHash: "0xward2fa" });
    const executeDirect = vi.fn();

    const result = await orchestrateExecution(deps, {
      walletAddress: "0xward",
      wardAddress: "0xward",
      calls: [],
      meta: {
        type: "transfer",
        token: "STRK",
        network: "sepolia",
      },
      executeDirect,
      executeWardApproval,
    });

    expect(result.route).toBe("ward_approval");
    expect(result.txHash).toBe("0xward2fa");
    expect(executeWardApproval).toHaveBeenCalled();
    expect(executeDirect).not.toHaveBeenCalled();
  });

  it("routes non-ward tx via 2FA when enabled", async () => {
    const deps = makeDeps();
    const execute2FA = vi
      .fn()
      .mockResolvedValue({ approved: true, txHash: "0x2fa" });

    const result = await orchestrateExecution(deps, {
      walletAddress: "0xnormal",
      calls: [],
      is2FAEnabled: true,
      meta: {
        type: "transfer",
        token: "STRK",
        network: "sepolia",
      },
      executeDirect: vi.fn(),
      execute2FA,
    });

    expect(result.route).toBe("2fa");
    expect(result.txHash).toBe("0x2fa");
    expect(execute2FA).toHaveBeenCalled();
    expect(deps.saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ account_type: "normal", tx_hash: "0x2fa" }),
    );
  });

  it("routes non-ward tx directly when 2FA is disabled", async () => {
    const deps = makeDeps();
    const executeDirect = vi
      .fn()
      .mockResolvedValue({ transaction_hash: "0xdirect" });

    const result = await orchestrateExecution(deps, {
      walletAddress: "0xnormal",
      calls: [],
      meta: {
        type: "transfer",
        token: "STRK",
        network: "sepolia",
      },
      executeDirect,
    });

    expect(result.route).toBe("direct");
    expect(result.txHash).toBe("0xdirect");
    expect(executeDirect).toHaveBeenCalled();
    expect(deps.saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ account_type: "normal", tx_hash: "0xdirect" }),
    );
  });
});
