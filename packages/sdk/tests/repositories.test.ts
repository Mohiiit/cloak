import { describe, it, expect, vi, afterEach } from "vitest";
import { SupabaseLite } from "../src/supabase";
import { ApprovalsRepository, TransactionsRepository } from "../src/repositories";
import * as approvalFns from "../src/two-factor";
import * as wardFns from "../src/ward";
import * as transactionFns from "../src/transactions";

describe("Repositories", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps canonical amounts in TransactionsRepository.save", async () => {
    const provider = {} as any;
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const repo = new TransactionsRepository(sb, provider);

    const saveSpy = vi
      .spyOn(transactionFns, "saveTransaction")
      .mockResolvedValue(null);

    await repo.save({
      wallet_address: "0x1",
      tx_hash: "0xtx",
      type: "transfer",
      token: "STRK",
      status: "pending",
      account_type: "normal",
      network: "sepolia",
      amount: {
        value: "1000000000000000000",
        unit: "erc20_wei",
        display: "1 STRK",
      },
    });

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: "1000000000000000000",
        amount_unit: "erc20_wei",
        note: "1 STRK",
      }),
      sb,
    );
  });

  it("delegates transaction read/write methods", async () => {
    const provider = { waitForTransaction: vi.fn() } as any;
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const repo = new TransactionsRepository(sb, provider);

    const updateSpy = vi
      .spyOn(transactionFns, "updateTransactionStatus")
      .mockResolvedValue();
    const listSpy = vi.spyOn(transactionFns, "getTransactions").mockResolvedValue([]);
    const confirmSpy = vi
      .spyOn(transactionFns, "confirmTransaction")
      .mockResolvedValue();

    await repo.updateStatus("0xtx", "failed", "boom", "0xfee");
    await repo.listByWallet("0x1", 20);
    await repo.confirm("0xtx");

    expect(updateSpy).toHaveBeenCalledWith("0xtx", "failed", "boom", "0xfee", sb);
    expect(listSpy).toHaveBeenCalledWith("0x1", 20, sb);
    expect(confirmSpy).toHaveBeenCalledWith(provider, "0xtx", sb);
  });

  it("delegates approval flows with common options", async () => {
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const repo = new ApprovalsRepository(sb);

    const twoFASpy = vi
      .spyOn(approvalFns, "request2FAApproval")
      .mockResolvedValue({ approved: true, txHash: "0x2fa" });
    const wardSpy = vi
      .spyOn(wardFns, "requestWardApproval")
      .mockResolvedValue({ approved: true, txHash: "0xward" });

    const signal = new AbortController().signal;

    await repo.requestTwoFactor(
      {
        walletAddress: "0x1",
        action: "transfer",
        token: "STRK",
        amount: "1",
        recipient: "0x2",
        callsJson: "[]",
        sig1Json: "[\"0x1\",\"0x2\"]",
        nonce: "0x1",
        resourceBoundsJson: "{}",
        txHash: "0xtx",
      },
      { onStatusChange: () => undefined, signal },
    );

    await repo.requestWard(
      {
        wardAddress: "0xward",
        guardianAddress: "0xguardian",
        action: "transfer",
        token: "STRK",
        amount: "1",
        recipient: "0x2",
        callsJson: "[]",
        wardSigJson: "[\"0x1\",\"0x2\"]",
        nonce: "0x1",
        resourceBoundsJson: "{}",
        txHash: "0xtx",
        needsWard2fa: false,
        needsGuardian: true,
        needsGuardian2fa: false,
      },
      { signal, requestOptions: { initialStatus: "pending_guardian" } },
    );

    expect(twoFASpy).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ walletAddress: "0x1" }),
      expect.any(Function),
      signal,
    );
    expect(wardSpy).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ wardAddress: "0xward" }),
      undefined,
      signal,
      { initialStatus: "pending_guardian" },
    );
  });
});
