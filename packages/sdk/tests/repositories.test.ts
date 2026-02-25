import { describe, it, expect, vi, afterEach } from "vitest";
import { CloakApiClient } from "../src/api-client";
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
    const client = new CloakApiClient("https://example.com", "test-key");
    const repo = new TransactionsRepository(client, provider);

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
      client,
    );
  });

  it("delegates transaction read/write methods", async () => {
    const provider = { waitForTransaction: vi.fn() } as any;
    const client = new CloakApiClient("https://example.com", "test-key");
    const repo = new TransactionsRepository(client, provider);

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

    expect(updateSpy).toHaveBeenCalledWith("0xtx", "failed", "boom", "0xfee", client);
    expect(listSpy).toHaveBeenCalledWith("0x1", 20, client);
    expect(confirmSpy).toHaveBeenCalledWith(provider, "0xtx", client);
  });

  it("delegates approval flows with common options", async () => {
    const client = new CloakApiClient("https://example.com", "test-key");
    const repo = new ApprovalsRepository(client);

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
      client,
      expect.objectContaining({ walletAddress: "0x1" }),
      expect.any(Function),
      signal,
    );
    expect(wardSpy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ wardAddress: "0xward" }),
      undefined,
      signal,
      { initialStatus: "pending_guardian" },
    );
  });

  it("delegates typed ward request lifecycle helpers", async () => {
    const client = new CloakApiClient("https://example.com", "test-key");
    const repo = new ApprovalsRepository(client);

    const sample = {
      id: "req-1",
      ward_address: "0xward",
      guardian_address: "0xguardian",
      action: "transfer",
      token: "STRK",
      amount: "20",
      amount_unit: "tongo_units",
      recipient: "0x2",
      calls_json: "[]",
      nonce: "0x1",
      resource_bounds_json: "{}",
      tx_hash: "0xtx",
      ward_sig_json: "[]",
      ward_2fa_sig_json: null,
      guardian_sig_json: null,
      guardian_2fa_sig_json: null,
      needs_ward_2fa: false,
      needs_guardian: true,
      needs_guardian_2fa: false,
      status: "pending_guardian" as const,
      final_tx_hash: null,
      error_message: null,
      created_at: "2026-02-21T00:00:00.000Z",
      expires_at: "2026-02-21T00:10:00.000Z",
      responded_at: null,
    };

    const createSpy = vi.spyOn(wardFns, "createWardApprovalRequest").mockResolvedValue(sample as any);
    const getSpy = vi.spyOn(wardFns, "getWardApprovalRequestById").mockResolvedValue(sample as any);
    const updateSpy = vi.spyOn(wardFns, "updateWardApprovalRequest").mockResolvedValue({
      ...sample,
      status: "approved",
    } as any);
    const listGuardianSpy = vi
      .spyOn(wardFns, "listWardApprovalRequestsForGuardian")
      .mockResolvedValue([sample as any]);
    const listWardSpy = vi
      .spyOn(wardFns, "listWardApprovalRequestsForWard")
      .mockResolvedValue([sample as any]);

    await repo.createWardRequest({
      wardAddress: "0xward",
      guardianAddress: "0xguardian",
      action: "transfer",
      token: "STRK",
      amount: "20",
      recipient: "0x2",
      callsJson: "[]",
      wardSigJson: "[]",
      nonce: "0x1",
      resourceBoundsJson: "{}",
      txHash: "0xtx",
      needsWard2fa: false,
      needsGuardian: true,
      needsGuardian2fa: false,
    });
    await repo.getWardRequest("req-1");
    await repo.updateWardRequest("req-1", { status: "approved" });
    await repo.listGuardianWardRequests("0xguardian", ["pending_guardian"], 20);
    await repo.listWardRequests("0xward", ["approved"], 20);
    const ui = repo.toWardRequestView(sample as any);

    expect(createSpy).toHaveBeenCalledWith(client, expect.objectContaining({ wardAddress: "0xward" }), undefined);
    expect(getSpy).toHaveBeenCalledWith(client, "req-1");
    expect(updateSpy).toHaveBeenCalledWith(client, "req-1", { status: "approved" });
    expect(listGuardianSpy).toHaveBeenCalledWith(client, "0xguardian", ["pending_guardian"], 20);
    expect(listWardSpy).toHaveBeenCalledWith(client, "0xward", ["approved"], 20);
    expect(ui.actionLabel).toBe("Private Transfer");
  });
});
