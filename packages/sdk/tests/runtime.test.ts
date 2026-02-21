import { describe, it, expect, vi, afterEach } from "vitest";
import { SupabaseLite } from "../src/supabase";
import { MemoryStorage } from "../src/storage/memory";
import { createCloakRuntime } from "../src/runtime/createRuntime";
import * as twoFactor from "../src/two-factor";
import * as ward from "../src/ward";
import * as transactions from "../src/transactions";
import * as router from "../src/router";

describe("createCloakRuntime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a runtime with defaults", () => {
    const runtime = createCloakRuntime();

    expect(runtime.config.network).toBe("sepolia");
    expect(runtime.deps.provider).toBeDefined();
    expect(runtime.deps.supabase).toBeDefined();
    expect(runtime.deps.storage).toBeInstanceOf(MemoryStorage);
    expect(typeof runtime.deps.now()).toBe("number");
  });

  it("wires approval methods to the shared supabase client", async () => {
    const provider = {} as any;
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const runtime = createCloakRuntime({ provider, supabase: sb });

    const twoFASpy = vi
      .spyOn(twoFactor, "request2FAApproval")
      .mockResolvedValue({ approved: true, txHash: "0x2fa" });
    const wardSpy = vi
      .spyOn(ward, "requestWardApproval")
      .mockResolvedValue({ approved: true, txHash: "0xward" });

    await runtime.approvals.request2FAApproval({
      walletAddress: "0x123",
      action: "transfer",
      token: "STRK",
      amount: "1",
      recipient: "0xabc",
      callsJson: "[]",
      sig1Json: "[\"0x1\",\"0x2\"]",
      nonce: "0x1",
      resourceBoundsJson: "{}",
      txHash: "0xtx",
    });

    await runtime.approvals.requestWardApproval({
      wardAddress: "0xward",
      guardianAddress: "0xguardian",
      action: "transfer",
      token: "STRK",
      amount: "1",
      recipient: "0xabc",
      callsJson: "[]",
      wardSigJson: "[\"0x1\",\"0x2\"]",
      nonce: "0x1",
      resourceBoundsJson: "{}",
      txHash: "0xtx",
      needsWard2fa: false,
      needsGuardian: true,
      needsGuardian2fa: false,
    });

    expect(twoFASpy).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ walletAddress: "0x123" }),
      undefined,
      undefined,
    );
    expect(wardSpy).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ wardAddress: "0xward" }),
      undefined,
      undefined,
      undefined,
    );
  });

  it("wires transaction and ward methods with shared provider/supabase", async () => {
    const provider = { waitForTransaction: vi.fn() } as any;
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const runtime = createCloakRuntime({ provider, supabase: sb });

    const saveSpy = vi.spyOn(transactions, "saveTransaction").mockResolvedValue(null);
    const updateSpy = vi
      .spyOn(transactions, "updateTransactionStatus")
      .mockResolvedValue();
    const listSpy = vi.spyOn(transactions, "getTransactions").mockResolvedValue([]);
    const confirmSpy = vi
      .spyOn(transactions, "confirmTransaction")
      .mockResolvedValue();
    const wardNeedsSpy = vi
      .spyOn(ward, "fetchWardApprovalNeeds")
      .mockResolvedValue(null);
    const wardInfoSpy = vi.spyOn(ward, "fetchWardInfo").mockResolvedValue(null);
    const snapshotSpy = vi
      .spyOn(router, "fetchWardPolicySnapshot")
      .mockResolvedValue({
        wardAddress: "0xward",
        guardianAddress: "0xguardian",
        wardHas2fa: false,
        guardianHas2fa: false,
        requireGuardianForAll: false,
        maxPerTxn: 0n,
        dailyLimit24h: 0n,
        spent24h: 0n,
      });
    const evaluateSpy = vi
      .spyOn(router, "evaluateWardExecutionPolicy")
      .mockReturnValue({
        needsGuardian: false,
        needsWard2fa: false,
        needsGuardian2fa: false,
        reasons: [],
        evaluatedSpend: 0n,
        projectedSpent24h: 0n,
      });
    const wardCheckSpy = vi
      .spyOn(ward, "checkIfWardAccount")
      .mockResolvedValue(true);
    const gasSpy = vi.spyOn(ward, "getBlockGasPrices").mockResolvedValue({
      l1GasPrice: 1n,
      l1DataGasPrice: 2n,
    });
    const feeSpy = vi.spyOn(ward, "estimateWardInvokeFee").mockResolvedValue({
      l1Gas: 1n,
      l1GasPrice: 1n,
      l2Gas: 1n,
      l2GasPrice: 1n,
      l1DataGas: 1n,
      l1DataGasPrice: 1n,
      overallFee: 1n,
    });

    await runtime.transactions.save({
      wallet_address: "0x1",
      tx_hash: "0xtx",
      type: "transfer",
      token: "STRK",
      amount: { value: "1", unit: "erc20_display", display: "1 STRK" },
      status: "pending",
      account_type: "normal",
      network: "sepolia",
    });
    await runtime.transactions.updateStatus("0xtx", "confirmed");
    await runtime.transactions.listByWallet("0x1", 10);
    await runtime.transactions.confirm("0xtx");

    await runtime.policy.getWardPolicySnapshot("0xward");
    await runtime.policy.evaluateWardExecutionPolicy("0xward", []);
    await runtime.policy.getWardApprovalNeeds("0xward");
    await runtime.policy.getWardInfo("0xward");
    await runtime.ward.checkIfWardAccount("0xward");
    await runtime.ward.fetchApprovalNeeds("0xward");
    await runtime.ward.fetchInfo("0xward");
    await runtime.ward.getBlockGasPrices();
    await runtime.ward.estimateInvokeFee("0xward", []);

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tx_hash: "0xtx" }),
      sb,
    );
    expect(updateSpy).toHaveBeenCalledWith(
      "0xtx",
      "confirmed",
      undefined,
      undefined,
      sb,
    );
    expect(listSpy).toHaveBeenCalledWith("0x1", 10, sb);
    expect(confirmSpy).toHaveBeenCalledWith(provider, "0xtx", sb);

    expect(snapshotSpy).toHaveBeenCalledWith(provider, "0xward");
    expect(evaluateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wardAddress: "0xward" }),
      [],
    );
    expect(wardNeedsSpy).toHaveBeenCalledWith(provider, "0xward");
    expect(wardInfoSpy).toHaveBeenCalledWith(provider, "0xward");
    expect(wardCheckSpy).toHaveBeenCalledWith(provider, "0xward");
    expect(gasSpy).toHaveBeenCalledWith(provider);
    expect(feeSpy).toHaveBeenCalledWith(provider, "0xward", []);
  });
});
